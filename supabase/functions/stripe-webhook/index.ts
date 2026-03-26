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
            : subscription.status === "canceled"
              ? "canceled"
              : subscription.status === "past_due"
                ? "past_due"
                : "inactive";

        await supabase
          .from("profiles")
          .update({ subscription_status: status })
          .eq("stripe_subscription_id", subscription.id);
        console.log(`Updated subscription ${subscription.id} status: ${status}`);

        if (status !== "active") {
          let ownerId = subscription.metadata?.supabase_user_id ?? null;
          if (!ownerId) {
            const { data: prof } = await supabase
              .from("profiles")
              .select("id")
              .eq("stripe_subscription_id", subscription.id)
              .maybeSingle();
            ownerId = prof?.id ?? null;
          }
          if (ownerId) {
            await supabase
              .from("food_trucks")
              .update({ is_published: false })
              .eq("owner_id", ownerId);
            console.log(`Unpublished trucks for owner ${ownerId}`);
          }
        }
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
