import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildReport,
  canTransition,
  compareLocations,
  dailyBuckets,
  readOrderLines,
  type ActionStatus,
  type InsightOrder,
  type InsightReport,
} from "../_shared/insights.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, cache-control, pragma, x-region",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function callerId(req: Request, url: string, anonKey: string): Promise<string | null> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!token || token === anonKey) return null;
  const client = createClient(url, anonKey, { global: { headers: { Authorization: header } }, auth: { persistSession: false } });
  const { data } = await client.auth.getUser();
  return data.user?.id ?? null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function allowed(admin: SupabaseClient, userId: string, slug: string): Promise<boolean> {
  const { data: truck } = await admin.from("food_trucks").select("owner_id").eq("slug", slug).maybeSingle();
  if (!truck) return false;
  if (truck.owner_id === userId) return true;
  const { data: staff } = await admin.from("restaurant_staff").select("role").eq("restaurant_slug", slug).eq("user_id", userId).maybeSingle();
  return staff?.role === "owner" || staff?.role === "manager";
}

function asStatus(value: string): ActionStatus | null {
  if (value === "suggested" || value === "approved" || value === "rejected" || value === "scheduled" || value === "active" || value === "completed") return value;
  return null;
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
  if (!supabaseUrl || !serviceKey) return json({ ok: false, error: "Insights are unavailable." }, 500);
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const userId = await callerId(req, supabaseUrl, anonKey);
  const slug = typeof body.slug === "string" ? body.slug.trim().toLowerCase() : "";
  if (!userId) return json({ ok: false, error: "Sign in first." }, 401);
  if (!slug || !(await allowed(admin, userId, slug))) return json({ ok: false, error: "Restaurant not found." }, 403);

  if (body.op === "decide") {
    const dedupeKey = typeof body.dedupeKey === "string" ? body.dedupeKey : "";
    const decision = body.decision === "approve" ? "approved" : body.decision === "reject" ? "rejected" : body.decision === "publish" ? "active" : null;
    if (!dedupeKey || !decision) return json({ ok: false, error: "Choose approve, reject, or publish." }, 400);
    const { data: row } = await admin.from("insight_recommendations").select("id, kind, status, payload").eq("restaurant_slug", slug).eq("dedupe_key", dedupeKey).maybeSingle();
    if (!row) return json({ ok: false, error: "That suggestion is not on file." }, 404);
    const current = asStatus(row.status);
    if (!current || !canTransition(current, decision)) return json({ ok: false, error: "That suggestion cannot move to the requested state." }, 409);
    if (decision === "approved" && row.kind === "upsell") {
      const payload = row.payload as { sourceItemId?: string; suggestedItemId?: string };
      if (!payload.sourceItemId || !payload.suggestedItemId || !isUuid(payload.sourceItemId) || !isUuid(payload.suggestedItemId)) {
        return json({ ok: false, error: "This pair is not on the saved menu, so the rule was not created." }, 409);
      }
      const inserted = await admin.from("menu_upsells").insert({
        restaurant_slug: slug,
        source_item_id: payload.sourceItemId,
        suggested_item_id: payload.suggestedItemId,
      });
      if (inserted.error && !/duplicate|unique/i.test(inserted.error.message)) {
        return json({ ok: false, error: "The upsell rule could not be saved." }, 500);
      }
    }
    const ownerMessage = typeof body.message === "string" ? body.message.slice(0, 280) : null;
    await admin.from("insight_recommendations").update({
      status: decision,
      decided_at: new Date().toISOString(),
      owner_message: ownerMessage,
    }).eq("id", row.id);
    await admin.from("audit_log").insert({
      actor_id: userId,
      restaurant_slug: slug,
      action: `insight_${decision}`,
      resource: dedupeKey,
      metadata: { kind: row.kind, status: decision },
    });
    return json({ ok: true, status: decision });
  }

  const now = new Date();
  const since = new Date(now.getTime() - 120 * 86400000).toISOString();
  const [orderResult, sessionResult, menuResult, upsellResult, eventResult, truckResult] = await Promise.all([
    admin.from("orders").select("id, created_at, total, status, source, payment_status, is_test, routing_status, items").eq("truck_id", slug).gte("created_at", since).order("created_at", { ascending: false }).limit(2000),
    admin.from("conversation_sessions").select("channel, started_at, submitted, customer_phone, order_id").eq("restaurant_slug", slug).gte("started_at", since).limit(1000),
    admin.from("menu_items").select("id, name, category, is_available, price, description").eq("truck_id", slug),
    admin.from("menu_upsells").select("source_item_id, suggested_item_id, enabled").eq("restaurant_slug", slug),
    admin.from("product_events").select("event_name, created_at").eq("restaurant_slug", slug).gte("created_at", since).in("event_name", ["voice_upsell_offered", "voice_upsell_accepted", "phone_upsell_offered", "phone_upsell_accepted"]),
    admin.from("food_trucks").select("owner_id, name").eq("slug", slug).maybeSingle(),
  ]);
  if (orderResult.error) return json({ ok: false, error: "Orders could not be read." }, 500);

  const orders = (orderResult.data ?? []).map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    total: Number(row.total),
    status: row.status,
    paymentStatus: row.payment_status ?? "unpaid",
    source: row.source ?? "manual",
    isTest: row.is_test === true,
    routingStatus: row.routing_status,
    lines: readOrderLines(row.items),
  }));
  const sessions = (sessionResult.data ?? []).map((row) => ({
    channel: row.channel,
    startedAt: row.started_at,
    submitted: row.submitted === true,
    customerPhone: row.customer_phone,
    orderId: row.order_id,
  }));
  const report = buildReport({
    now,
    orders,
    sessions,
    menu: (menuResult.data ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category ?? "",
      available: item.is_available !== false,
      price: Number(item.price) || 0,
      description: item.description ?? "",
    })),
    upsells: (upsellResult.data ?? []).map((rule) => ({
      sourceItemId: rule.source_item_id,
      suggestedItemId: rule.suggested_item_id,
      enabled: rule.enabled !== false,
    })),
    events: (eventResult.data ?? []).map((event) => ({ name: event.event_name, createdAt: event.created_at })),
  });

  let locationNotes: string[] = [];
  if (truckResult.data?.owner_id) {
    const siblings = await admin.from("food_trucks").select("slug, name").eq("owner_id", truckResult.data.owner_id);
    if ((siblings.data ?? []).length > 1) {
      const reports: { name: string; report: InsightReport }[] = [{ name: truckResult.data.name ?? slug, report }];
      for (const sibling of siblings.data ?? []) {
        if (sibling.slug === slug) continue;
        const siblingOrders = await admin.from("orders").select("id, created_at, total, status, source, payment_status, is_test, routing_status, items").eq("truck_id", sibling.slug).gte("created_at", since).limit(2000);
        const siblingSessions = await admin.from("conversation_sessions").select("channel, started_at, submitted, customer_phone, order_id").eq("restaurant_slug", sibling.slug).gte("started_at", since).limit(1000);
        reports.push({
          name: sibling.name,
          report: buildReport({
            now,
            orders: (siblingOrders.data ?? []).map((row) => ({
              id: row.id,
              createdAt: row.created_at,
              total: Number(row.total),
              status: row.status,
              paymentStatus: row.payment_status ?? "unpaid",
              source: row.source ?? "manual",
              isTest: row.is_test === true,
              routingStatus: row.routing_status,
              lines: readOrderLines(row.items),
            })),
            sessions: (siblingSessions.data ?? []).map((row) => ({
              channel: row.channel,
              startedAt: row.started_at,
              submitted: row.submitted === true,
              customerPhone: row.customer_phone,
              orderId: row.order_id,
            })),
            menu: [],
            upsells: [],
            events: [],
          }),
        });
      }
      locationNotes = compareLocations(reports);
    }
  }

  const days = dailyBuckets(orders, now);
  await admin.from("restaurant_insight_snapshots").upsert({
    restaurant_slug: slug,
    payload: { ...report, locationNotes },
    computed_at: report.generatedAt,
  });
  if (days.length) {
    await admin.from("restaurant_metric_days").upsert(days.map((day) => ({
      restaurant_slug: slug,
      day: day.day,
      orders: day.orders,
      revenue: day.revenue,
      cancelled: day.cancelled,
    })));
  }

  const existing = await admin.from("insight_recommendations").select("dedupe_key, status, id").eq("restaurant_slug", slug);
  const byKey = new Map((existing.data ?? []).map((row) => [row.dedupe_key, row]));
  for (const card of report.actions) {
    const prior = byKey.get(card.id);
    if (!prior) {
      const inserted = await admin.from("insight_recommendations").insert({
        restaurant_slug: slug,
        dedupe_key: card.id,
        kind: card.kind,
        title: card.title,
        evidence: card.evidence,
        action: card.action,
        effort: card.effort,
        payload: card.payload,
      }).select("id, status").single();
      if (inserted.data) byKey.set(card.id, { dedupe_key: card.id, status: inserted.data.status, id: inserted.data.id });
    } else if (prior.status === "suggested") {
      await admin.from("insight_recommendations").update({
        title: card.title,
        evidence: card.evidence,
        action: card.action,
        payload: card.payload,
      }).eq("restaurant_slug", slug).eq("dedupe_key", card.id);
    }
  }

  const actions = report.actions
    .map((card) => {
      const prior = byKey.get(card.id);
      return { ...card, status: prior?.status ?? "suggested" };
    })
    .filter((card) => card.status !== "rejected");

  return json({ ok: true, report: { ...report, actions, locationNotes } });
});
