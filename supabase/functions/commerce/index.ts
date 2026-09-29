import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { POS_CATALOG, planRoute, posFailureMessage, squareOrderBody } from "../_shared/commerce.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, cache-control, pragma, x-region",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function log(event: string, fields: Record<string, string | number | boolean | null>) {
  console.info(JSON.stringify({ source: "commerce", event, ...fields }));
}

async function callerId(req: Request, url: string, anonKey: string): Promise<string | null> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!token || token === anonKey) return null;
  const client = createClient(url, anonKey, { global: { headers: { Authorization: header } }, auth: { persistSession: false } });
  const { data } = await client.auth.getUser();
  return data.user?.id ?? null;
}

function squareHost() {
  return Deno.env.get("SQUARE_ENVIRONMENT") === "production" ? "https://connect.squareup.com" : "https://connect.squareupsandbox.com";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Use POST." }, 405);

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "The request could not be read." }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) return json({ ok: false, error: "Commerce is unavailable." }, 500);
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const op = typeof body.op === "string" ? body.op : "";
  const squareConfigured = Boolean(Deno.env.get("SQUARE_APP_ID") && Deno.env.get("SQUARE_APP_SECRET"));
  const stripeConfigured = Boolean(Deno.env.get("STRIPE_SECRET_KEY"));

  if (op === "providers") {
    return json({
      ok: true,
      providers: POS_CATALOG.map((provider) => ({
        ...provider,
        configured: provider.id === "square" ? squareConfigured : false,
      })),
      cardPaymentsConfigured: stripeConfigured,
    });
  }

  const userId = await callerId(req, supabaseUrl, anonKey);
  const slug = typeof body.slug === "string" ? body.slug.trim().toLowerCase() : "";

  if (op === "platform_snapshot") {
    if (!userId) return json({ ok: false, error: "Sign in first." }, 401);
    const { data: profile } = await admin.from("profiles").select("is_platform_admin").eq("id", userId).maybeSingle();
    if (!profile?.is_platform_admin) return json({ ok: false, error: "Not allowed." }, 403);
    const [trucks, jobs] = await Promise.all([
      admin.from("food_trucks").select("id", { count: "exact", head: true }),
      admin.from("job_queue").select("id", { count: "exact", head: true }).eq("status", "failed"),
    ]);
    return json({ ok: true, restaurants: trucks.count ?? 0, failedJobs: jobs.count ?? 0 });
  }

  if (op === "connect_stripe") {
    if (!userId) return json({ ok: false, error: "Sign in first." }, 401);
    if (!stripeConfigured) return json({ ok: false, code: "unconfigured", error: "Card payouts are not turned on for this environment." }, 503);
    const { data: truck } = await admin.from("food_trucks").select("slug, owner_id, stripe_account_id").eq("slug", slug).maybeSingle();
    if (!truck || truck.owner_id !== userId) return json({ ok: false, error: "Restaurant not found." }, 403);
    const secret = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
    let accountId = truck.stripe_account_id as string | null;
    if (!accountId) {
      const created = await fetch("https://api.stripe.com/v1/accounts", {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ type: "express", "metadata[restaurant_slug]": slug }),
      });
      const account = await created.json();
      if (!created.ok || !account.id) {
        log("stripe_account_failed", { slug, status: created.status });
        return json({ ok: false, error: "Stripe could not start the restaurant account." }, 502);
      }
      accountId = account.id as string;
      await admin.from("food_trucks").update({ stripe_account_id: accountId }).eq("slug", slug);
    }
    const origin = typeof body.origin === "string" ? body.origin : Deno.env.get("PUBLIC_APP_URL") ?? "";
    const linkRes = await fetch("https://api.stripe.com/v1/account_links", {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        account: accountId!,
        refresh_url: `${origin}/admin/payments`,
        return_url: `${origin}/admin/payments?connected=1`,
        type: "account_onboarding",
      }),
    });
    const link = await linkRes.json();
    if (!linkRes.ok || !link.url) return json({ ok: false, error: "Stripe did not return an onboarding link." }, 502);
    await admin.from("audit_log").insert({ actor_id: userId, restaurant_slug: slug, action: "payment_connect_started", resource: "stripe" });
    return json({ ok: true, url: link.url });
  }

  if (op === "food_checkout") {
    const orderId = typeof body.orderId === "string" ? body.orderId : "";
    const token = typeof body.token === "string" ? body.token : "";
    const { data: order } = await admin.from("orders").select("id, truck_id, total, payment_status, guest_access_token, order_number, is_test").eq("id", orderId).maybeSingle();
    if (!order || order.truck_id !== slug || order.guest_access_token !== token) {
      return json({ ok: false, error: "That order could not be paid." }, 404);
    }
    if (order.payment_status === "paid") return json({ ok: true, alreadyPaid: true });
    if (order.is_test) {
      await admin.from("orders").update({ payment_status: "paid", payment_provider: "test", status: "received" }).eq("id", orderId);
      return json({ ok: true, test: true });
    }
    const { data: truck } = await admin.from("food_trucks").select("stripe_account_id, card_payments_enabled").eq("slug", slug).maybeSingle();
    if (!stripeConfigured || !truck?.stripe_account_id) {
      return json({ ok: false, code: "unconfigured", error: "Card payment is not ready. Pay at the restaurant if that option is offered." }, 409);
    }
    const secret = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
    const origin = typeof body.origin === "string" ? body.origin : "";
    const amount = Math.round(Number(order.total) * 100);
    const params = new URLSearchParams({
      mode: "payment",
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": "usd",
      "line_items[0][price_data][unit_amount]": String(amount),
      "line_items[0][price_data][product_data][name]": `Restaurant order ${order.order_number}`,
      "payment_intent_data[transfer_data][destination]": truck.stripe_account_id,
      success_url: `${origin}/confirmation/${orderId}?t=${token}`,
      cancel_url: `${origin}/pay/${orderId}?t=${token}&r=${slug}`,
      "metadata[kind]": "food_order",
      "metadata[order_id]": orderId,
      "metadata[restaurant_slug]": slug,
    });
    const sessionRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    });
    const session = await sessionRes.json();
    if (!sessionRes.ok || !session.url) {
      log("food_checkout_failed", { slug, status: sessionRes.status });
      await admin.from("orders").update({ payment_status: "failed" }).eq("id", orderId).eq("payment_status", "pending");
      return json({ ok: false, error: "The card payment could not be started." }, 502);
    }
    return json({ ok: true, url: session.url });
  }

  if (op === "square_start") {
    if (!userId) return json({ ok: false, error: "Sign in first." }, 401);
    if (!squareConfigured) return json({ ok: false, code: "unconfigured", error: "Square is not configured for this environment." }, 503);
    const { data: truck } = await admin.from("food_trucks").select("owner_id").eq("slug", slug).maybeSingle();
    if (!truck || truck.owner_id !== userId) return json({ ok: false, error: "Restaurant not found." }, 403);
    const state = crypto.randomUUID();
    await admin.from("job_queue").insert({ restaurant_slug: slug, kind: "square_oauth_state", payload: { state, userId }, status: "done" });
    const url = new URL(`${squareHost()}/oauth2/authorize`);
    url.searchParams.set("client_id", Deno.env.get("SQUARE_APP_ID") ?? "");
    url.searchParams.set("scope", "ORDERS_WRITE ORDERS_READ ITEMS_READ MERCHANT_PROFILE_READ");
    url.searchParams.set("session", "false");
    url.searchParams.set("state", `${slug}.${state}`);
    return json({ ok: true, url: url.toString() });
  }

  if (op === "square_callback") {
    if (!userId) return json({ ok: false, error: "Sign in first." }, 401);
    const code = typeof body.code === "string" ? body.code : "";
    const state = typeof body.state === "string" ? body.state : "";
    const [stateSlug, nonce] = state.split(".");
    if (!code || stateSlug !== slug || !nonce) return json({ ok: false, error: "Square returned an invalid response." }, 400);
    const { data: truck } = await admin.from("food_trucks").select("owner_id").eq("slug", slug).maybeSingle();
    if (!truck || truck.owner_id !== userId) return json({ ok: false, error: "Restaurant not found." }, 403);
    const tokenRes = await fetch(`${squareHost()}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: Deno.env.get("SQUARE_APP_ID"),
        client_secret: Deno.env.get("SQUARE_APP_SECRET"),
        code,
        grant_type: "authorization_code",
      }),
    });
    const token = await tokenRes.json();
    if (!tokenRes.ok || !token.access_token) {
      log("square_token_failed", { slug, status: tokenRes.status });
      return json({ ok: false, error: "Square did not connect." }, 502);
    }
    const locationsRes = await fetch(`${squareHost()}/v2/locations`, {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    const locationsBody = await locationsRes.json();
    const locations = Array.isArray(locationsBody.locations) ? locationsBody.locations as { id?: string; status?: string }[] : [];
    const locationId = locations.find((location) => location.status === "ACTIVE")?.id ?? locations[0]?.id ?? null;
    const connection = await admin.from("pos_connections").upsert({
      restaurant_slug: slug,
      provider: "square",
      status: locationId ? "connected" : "error",
      external_account_id: token.merchant_id ?? null,
      external_location_id: locationId,
      last_error: locationId ? null : "Square did not return a location.",
      last_health_at: new Date().toISOString(),
    }, { onConflict: "restaurant_slug,provider" }).select("id").single();
    if (connection.error || !connection.data) return json({ ok: false, error: "Could not save the Square connection." }, 500);
    await admin.from("pos_secrets").upsert({
      connection_id: connection.data.id,
      access_token: token.access_token,
      refresh_token: token.refresh_token ?? null,
      expires_at: token.expires_at ?? null,
    });
    await admin.from("audit_log").insert({ actor_id: userId, restaurant_slug: slug, action: "pos_connected", resource: "square" });
    return json({ ok: true });
  }

  if (op === "square_push_order") {
    if (!userId) return json({ ok: false, error: "Sign in first." }, 401);
    const orderId = typeof body.orderId === "string" ? body.orderId : "";
    const { data: truck } = await admin.from("food_trucks").select("owner_id, order_route, require_payment_before_kitchen").eq("slug", slug).maybeSingle();
    if (!truck || truck.owner_id !== userId) return json({ ok: false, error: "Restaurant not found." }, 403);
    const { data: order } = await admin.from("orders").select("id, truck_id, items, total, payment_status, idempotency_key, pos_external_order_id, is_test").eq("id", orderId).eq("truck_id", slug).maybeSingle();
    if (!order) return json({ ok: false, error: "Order not found." }, 404);
    const route = planRoute({
      route: truck.order_route === "pos" || truck.order_route === "both" ? truck.order_route : "kds",
      paymentStatus: order.payment_status ?? "pay_at_pickup",
      requirePaymentBeforeKitchen: truck.require_payment_before_kitchen === true,
      externalOrderId: order.pos_external_order_id,
      idempotencyKey: order.idempotency_key ?? order.id,
      seenKeys: order.pos_external_order_id ? [order.idempotency_key ?? order.id] : [],
    });
    if (route.duplicate || !route.sendToPos) {
      return json({ ok: true, duplicate: route.duplicate, message: route.customerMessage, status: route.status });
    }
    const connection = await admin.from("pos_connections").select("id, external_location_id, status").eq("restaurant_slug", slug).eq("provider", "square").maybeSingle();
    const creds = connection.data
      ? await admin.from("pos_secrets").select("access_token").eq("connection_id", connection.data.id).maybeSingle()
      : { data: null };
    if (!connection.data || connection.data.status !== "connected" || !creds.data?.access_token || !connection.data.external_location_id) {
      const failure = posFailureMessage();
      await admin.from("orders").update({ routing_status: failure.status }).eq("id", orderId);
      log("pos_push_failed", { slug, reason: "not_connected" });
      return json({ ok: false, error: failure.customerMessage, status: failure.status }, 409);
    }
    const items = Array.isArray(order.items) ? order.items as { quantity?: number; menuItem?: { name?: string; price?: number } }[] : [];
    const lines = items.map((item) => ({
      name: item.menuItem?.name || "Item",
      quantity: item.quantity || 1,
      totalCents: Math.round(Number(item.menuItem?.price || 0) * (item.quantity || 1) * 100),
    }));
    const squareBody = squareOrderBody({
      locationId: connection.data.external_location_id,
      idempotencyKey: order.idempotency_key || order.id,
      referenceId: order.id,
      currency: "USD",
      lines,
    });
    const pushed = await fetch(`${squareHost()}/v2/orders`, {
      method: "POST",
      headers: { Authorization: `Bearer ${creds.data.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify(squareBody),
    });
    const payload = await pushed.json();
    if (!pushed.ok || !payload.order?.id) {
      const failure = posFailureMessage();
      await admin.from("orders").update({ routing_status: failure.status }).eq("id", orderId);
      await admin.from("pos_connections").update({ status: "error", last_error: "Order push failed" }).eq("id", connection.data.id);
      log("pos_push_failed", { slug, status: pushed.status });
      return json({ ok: false, error: failure.customerMessage, status: failure.status }, 502);
    }
    await admin.from("orders").update({ routing_status: "submitted", pos_external_order_id: payload.order.id }).eq("id", orderId);
    return json({ ok: true, externalOrderId: payload.order.id, message: "Your order is in the kitchen." });
  }

  if (op === "square_sync") {
    if (!userId) return json({ ok: false, error: "Sign in first." }, 401);
    const { data: truck } = await admin.from("food_trucks").select("owner_id, menu_source").eq("slug", slug).maybeSingle();
    if (!truck || truck.owner_id !== userId) return json({ ok: false, error: "Restaurant not found." }, 403);
    if (truck.menu_source === "kio") {
      return json({ ok: false, error: "This restaurant uses the KioKitchen menu as the source. Switch to POS sync before importing." }, 409);
    }
    await admin.from("job_queue").insert({ restaurant_slug: slug, kind: "square_menu_sync", payload: { requestedBy: userId } });
    return json({ ok: true, queued: true });
  }

  return json({ ok: false, error: "Unknown operation." }, 400);
});
