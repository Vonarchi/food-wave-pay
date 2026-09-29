import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=denonext";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-11-20",
});
const cryptoProvider = Stripe.createSubtleCryptoProvider();

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const signature = req.headers.get("Stripe-Signature");
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature!,
      Deno.env.get("STRIPE_WEBHOOK_SECRET")!,
      undefined,
      cryptoProvider
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return new Response((err as Error).message, { status: 400 });
  }

  console.log(`Webhook received: ${event.type}`);

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.metadata?.kind === "food_order") {
          const orderId = session.metadata.order_id;
          const restaurantSlug = session.metadata.restaurant_slug;
          if (!orderId || !restaurantSlug) break;
          const { data: existing } = await supabase
            .from("orders")
            .select("payment_status")
            .eq("id", orderId)
            .eq("truck_id", restaurantSlug)
            .maybeSingle();
          if (!existing || existing.payment_status === "paid") break;
          const { data: truck } = await supabase.from("food_trucks").select("order_route").eq("slug", restaurantSlug).maybeSingle();
          const route = truck?.order_route;
          const routingStatus = route === "pos" || route === "both" ? "pending_submission" : "not_required";
          await supabase
            .from("orders")
            .update({
              payment_status: "paid",
              payment_provider: "stripe",
              payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
              payment_amount: session.amount_total != null ? session.amount_total / 100 : null,
              payment_method_type: "card",
              status: "received",
              routing_status: routingStatus,
            })
            .eq("id", orderId)
            .eq("truck_id", restaurantSlug)
            .neq("payment_status", "paid");
          console.log(`Food order ${orderId} marked paid`);
          break;
        }
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;
        const metaUserId = session.metadata?.supabase_user_id;

        let profileId: string | null = metaUserId ?? null;

        if (!profileId) {
          const customer = await stripe.customers.retrieve(customerId);
          const email = (customer as Stripe.Customer).email;
          if (!email) break;
          const { data: profile } = await supabase
            .from("profiles")
            .select("id")
            .eq("email", email)
            .single();
          profileId = profile?.id ?? null;
        }

        if (profileId) {
          await supabase
            .from("profiles")
            .update({
              stripe_customer_id: customerId,
              stripe_subscription_id: subscriptionId,
              subscription_status: "active",
            })
            .eq("id", profileId);
          console.log(`Updated profile ${profileId} with subscription`);
        }
        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const status =
          subscription.status === "active"
            ? "active"
            : subscription.status === "trialing"
              ? "trialing"
              : subscription.status === "canceled"
                ? "canceled"
                : subscription.status === "past_due"
                  ? "past_due"
                  : "inactive";

        const profileUpdate = {
          subscription_status: status,
          stripe_subscription_id: subscription.id,
        };
        const { data: updatedRows } = await supabase
          .from("profiles")
          .update(profileUpdate)
          .eq("stripe_subscription_id", subscription.id)
          .select("id");
        if (!updatedRows?.length && subscription.metadata?.supabase_user_id) {
          await supabase
            .from("profiles")
            .update(profileUpdate)
            .eq("id", subscription.metadata.supabase_user_id);
        }
        console.log(`Updated subscription ${subscription.id} status: ${status}`);
        // Digital menus stay published when a subscription lapses.
        // Ordering upgrades are recorded on the profile only.
        break;
      }

      case "account.updated": {
        const account = event.data.object as Stripe.Account;
        const restaurantSlug = account.metadata?.restaurant_slug;
        if (!restaurantSlug || !account.id) break;
        await supabase
          .from("food_trucks")
          .update({ card_payments_enabled: account.charges_enabled === true })
          .eq("slug", restaurantSlug)
          .eq("stripe_account_id", account.id);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Webhook handler error:", err);
    return new Response("Webhook handler failed", { status: 500 });
  }
});
