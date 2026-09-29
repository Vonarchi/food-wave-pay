import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  channelAnalytics,
  channelGreeting,
  decidePayment,
  parseProviderWebhook,
  prepareChannelTurn,
  sameRestaurant,
  validSlug,
} from "../_shared/channelPolicy.ts";
import { DEMO_CATALOG, DEMO_UPSELLS } from "../_shared/demoCatalog.ts";
import {
  aiFailureTurn,
  applyOrderTurn,
  catalogItemFromRow,
  normalizeChannel,
  parseModelActions,
  type CartLine,
  type CartSelection,
  type CatalogItem,
  type OrderChannel,
  type OrderTurnResult,
  type PricedLine,
  type ProposedAction,
  type UpsellRule,
} from "../_shared/orderingEngine.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, cache-control, pragma, x-region, x-device-secret, x-phone-webhook-secret",
};

const MAX_BODY = 24_000;
const MAX_TURNS = 40;
const MODEL_FALLBACK = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"];

type SessionRecord = {
  id: string;
  slug: string;
  channel: OrderChannel;
  status: string;
  cart: CartLine[];
  transcript: { role: string; text: string }[];
  awaiting: boolean;
  misses: number;
  pickupName: string | null;
  orderId: string | null;
  submitted: boolean;
  takeover: boolean;
  handoffReason: string | null;
  startedAt: number;
  applied: string[];
  provider: string | null;
  externalCallId: string | null;
  stored: boolean;
};

const memory = new Map<string, SessionRecord>();

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function log(event: string, fields: Record<string, string | number | boolean | null>) {
  console.info(JSON.stringify({ source: "channel-order", event, ...fields }));
}

function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  return forwarded.replace(/[^0-9a-fA-F:.]/g, "").slice(0, 64) || "unknown";
}

function readCart(value: unknown): CartLine[] {
  if (!Array.isArray(value)) return [];
  const lines: CartLine[] = [];
  for (const entry of value.slice(0, 30)) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    if (typeof row.lineId !== "string" || typeof row.itemId !== "string") continue;
    const quantity = Number(row.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) continue;
    const selections: CartSelection[] = [];
    if (Array.isArray(row.selections)) {
      for (const selection of row.selections.slice(0, 12)) {
        if (!selection || typeof selection !== "object") continue;
        const group = selection as Record<string, unknown>;
        if (typeof group.groupId !== "string" || !Array.isArray(group.optionIds)) continue;
        const optionIds = group.optionIds.filter((id): id is string => typeof id === "string").slice(0, 8);
        if (optionIds.length) selections.push({ groupId: group.groupId.slice(0, 80), optionIds });
      }
    }
    lines.push({
      lineId: row.lineId.slice(0, 40),
      itemId: row.itemId.slice(0, 80),
      quantity,
      selections,
    });
  }
  return lines;
}

function readProposals(value: unknown): ProposedAction[] {
  return parseModelActions(Array.isArray(value) ? value : { actions: value });
}

function kitchenItems(lines: PricedLine[]) {
  return lines.map((line) => {
    const groups = new Map<string, { groupId: string; groupName: string; options: { id: string; name: string; price: number }[] }>();
    for (const mod of line.modifiers) {
      const option = { id: mod.optionId, name: mod.optionName, price: mod.price };
      const existing = groups.get(mod.groupId);
      if (existing) existing.options.push(option);
      else groups.set(mod.groupId, { groupId: mod.groupId, groupName: mod.groupName, options: [option] });
    }
    return {
      id: line.lineId,
      menuItem: {
        id: line.itemId,
        name: line.name,
        description: line.description,
        price: line.basePrice,
        category: line.category,
        available: true,
      },
      quantity: line.quantity,
      selectedModifiers: [...groups.values()],
      specialInstructions: line.note,
    };
  });
}

async function callerId(req: Request, url: string, anonKey: string): Promise<string | null> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!token || token === anonKey) return null;
  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: header } },
    auth: { persistSession: false },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return data.user.id;
}

function deviceOk(req: Request): boolean {
  const expected = Deno.env.get("DRIVE_THRU_DEVICE_SECRET") ?? "";
  const given = req.headers.get("x-device-secret") ?? "";
  return expected.length >= 16 && given === expected;
}

async function loadCatalog(admin: SupabaseClient, slug: string, upsellsEnabled: boolean) {
  const catalog: CatalogItem[] = [];
  let upsells: UpsellRule[] = [];
  if (slug === "demo") {
    catalog.push(...DEMO_CATALOG);
    if (upsellsEnabled) upsells = DEMO_UPSELLS;
    return { catalog, upsells };
  }
  const { data: rows, error } = await admin
    .from("menu_items")
    .select("id, name, description, price, category, is_available, modifiers")
    .eq("truck_id", slug);
  if (error) throw new Error(error.message);
  for (const row of rows ?? []) {
    const item = catalogItemFromRow(row);
    if (item) catalog.push(item);
  }
  if (upsellsEnabled) {
    const { data: rules } = await admin
      .from("menu_upsells")
      .select("source_item_id, suggested_item_id")
      .eq("restaurant_slug", slug)
      .eq("enabled", true);
    upsells = (rules ?? []).map((rule) => ({
      sourceItemId: rule.source_item_id,
      suggestedItemId: rule.suggested_item_id,
    }));
  }
  return { catalog, upsells };
}

function rowToSession(row: Record<string, unknown>, stored: boolean): SessionRecord {
  return {
    id: String(row.id),
    slug: String(row.restaurant_slug),
    channel: normalizeChannel(row.channel),
    status: String(row.status ?? "active"),
    cart: readCart(row.current_cart),
    transcript: Array.isArray(row.transcript) ? row.transcript.slice(-40) as SessionRecord["transcript"] : [],
    awaiting: row.awaiting_confirmation === true,
    misses: Number(row.misunderstanding_count) || 0,
    pickupName: typeof row.pickup_name === "string" ? row.pickup_name : null,
    orderId: typeof row.order_id === "string" ? row.order_id : null,
    submitted: row.submitted === true,
    takeover: row.status === "takeover",
    handoffReason: typeof row.handoff_reason === "string" ? row.handoff_reason : null,
    startedAt: Date.parse(String(row.started_at ?? "")) || Date.now(),
    applied: Array.isArray(row.applied_turn_ids) ? row.applied_turn_ids.filter((id): id is string => typeof id === "string") : [],
    provider: typeof row.provider === "string" ? row.provider : null,
    externalCallId: typeof row.external_call_id === "string" ? row.external_call_id : null,
    stored,
  };
}

async function saveSession(admin: SupabaseClient, session: SessionRecord) {
  const patch = {
    status: session.status,
    transcript: session.transcript.slice(-40),
    current_cart: session.cart,
    order_id: session.orderId,
    handoff_reason: session.handoffReason,
    duration_seconds: Math.max(0, Math.round((Date.now() - session.startedAt) / 1000)),
    awaiting_confirmation: session.awaiting,
    submitted: session.submitted,
    applied_turn_ids: session.applied.slice(-80),
    pickup_name: session.pickupName,
    misunderstanding_count: session.misses,
    ended_at: session.status === "ended" || session.status === "expired" ? new Date().toISOString() : null,
    metadata: { takeover_status: session.takeover ? "staff" : "ai" },
  };
  if (!session.stored) {
    memory.set(session.id, session);
    return;
  }
  const { error } = await admin.from("conversation_sessions").update(patch).eq("id", session.id);
  if (error) {
    log("session_save_failed", { id: session.id, message: error.message });
    session.stored = false;
    memory.set(session.id, session);
  }
}

async function record(admin: SupabaseClient, slug: string, name: string | null) {
  if (!name) return;
  const { error } = await admin.from("product_events").insert({ event_name: name, restaurant_slug: slug, properties: { channel: name.split("_")[0] } });
  if (error) log("event_failed", { name, message: error.message });
}

async function interpret(apiKey: string, catalog: CatalogItem[], cart: CartLine[], utterance: string, channel: OrderChannel): Promise<ProposedAction[] | null> {
  const system = [
    "You map a customer's words onto this restaurant only. Return JSON {\"actions\":[...]}.",
    "Never include a price. Never invent an id. Never answer questions outside the menu, hours, location, and this order.",
    "If you are unsure, use ask_clarification. Do not guess.",
    "Allowed: add_item, remove_item, update_quantity, update_modifier, ask_clarification, answer_menu_question, recommend_item, show_cart, confirm_order, cancel_order, accept_upsell, reject_upsell, set_pickup_name, answer_place, request_handoff.",
    "Do not emit submit_order. The channel submits only after the customer says yes.",
    "request_handoff reasons: repeated_misunderstanding, upset_customer, allergy, refund, complaint, catering, payment, requested_employee.",
    "answer_place topic is hours, location, or prep.",
  ].join(" ");
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ parts: [{ text: JSON.stringify({ channel, menu: catalog.slice(0, 200).map((item) => ({ id: item.id, name: item.name, available: item.available, modifiers: item.modifiers })), cart, utterance }) }] }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 700, responseMimeType: "application/json" },
  });
  for (const model of MODEL_FALLBACK) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body, signal: controller.signal },
      );
      if (!response.ok) {
        log("provider_failed", { model, status: response.status });
        continue;
      }
      const payload = await response.json();
      const text = payload?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? "").join("") ?? "";
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      if (start < 0 || end <= start) return [];
      return parseModelActions(JSON.parse(text.slice(start, end + 1)));
    } catch (error) {
      log("provider_failed", { model, status: error instanceof Error ? error.name : "error" });
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

function publicResult(session: SessionRecord, result: OrderTurnResult, extra: Record<string, unknown> = {}) {
  return {
    ok: true,
    sessionId: session.id,
    say: result.say,
    cart: result.cart,
    lines: result.lines,
    subtotal: result.subtotal,
    tax: result.tax,
    total: result.total,
    awaitingConfirmation: result.awaitingConfirmation,
    readyToSubmit: result.readyToSubmit,
    clarification: result.clarification,
    handoff: result.handoff,
    pickupName: result.pickupName ?? session.pickupName,
    status: session.takeover ? "takeover" : session.status,
    transcript: session.transcript,
    duplicate: result.duplicate,
    ...extra,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, code: "method", error: "Use POST." }, 405);

  const raw = await req.text();
  if (raw.length > MAX_BODY) return json({ ok: false, code: "too_large", error: "That request is too long." }, 413);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ ok: false, code: "bad_request", error: "The request could not be read." }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) return json({ ok: false, code: "unavailable", error: "Ordering is unavailable right now." }, 500);
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  if (body.op === "webhook") {
    const secret = Deno.env.get("PHONE_WEBHOOK_SECRET") ?? "";
    if (secret.length < 16) return json({ ok: false, code: "unconfigured", error: "Phone provider is not connected." }, 503);
    if ((req.headers.get("x-phone-webhook-secret") ?? "") !== secret) {
      return json({ ok: false, code: "unauthorized", error: "Provider authentication failed." }, 401);
    }
    const parsed = parseProviderWebhook(body);
    if (!parsed.ok) return json({ ok: false, code: "bad_request", error: parsed.error }, 400);
    body = {
      ...body,
      op: parsed.speech ? "turn" : "start",
      utterance: parsed.speech,
      externalCallId: parsed.callId,
      customerPhone: parsed.from,
      channel: "phone",
      provider: "webhook",
    };
  }

  const slug = typeof body.slug === "string" ? body.slug.trim().toLowerCase() : "";
  if (!validSlug(slug)) return json({ ok: false, code: "bad_request", error: "Unknown restaurant." }, 400);
  const channel = normalizeChannel(body.channel);
  if (channel !== "phone" && channel !== "drive_thru") {
    return json({ ok: false, code: "bad_request", error: "This channel is not served here." }, 400);
  }

  const userId = await callerId(req, supabaseUrl, anonKey);
  const { data: truckRow, error: truckError } = await admin.from("food_trucks").select("*").eq("slug", slug).maybeSingle();
  if (truckError || !truckRow) return json({ ok: false, code: "not_found", error: "Restaurant not found." }, 404);
  const truck = truckRow as Record<string, unknown>;
  const owner = Boolean(userId && truck.owner_id === userId);
  const staff = owner || deviceOk(req);
  const phoneOn = truck.phone_ordering_enabled === true;
  const driveOn = truck.drive_thru_enabled === true;
  const acceptOrders = truck.phone_accept_orders !== false;
  const upsellsEnabled = truck.upsells_enabled !== false;
  const speakPrices = channel === "phone" ? truck.phone_speak_prices !== false : true;
  const payAtPickup = truck.phone_pay_at_pickup !== false;
  const paymentLink = truck.phone_payment_link_enabled === true;
  const fallback = typeof truck.phone_fallback_number === "string" ? truck.phone_fallback_number : "";
  const restaurantName = typeof truck.name === "string" ? truck.name : "the restaurant";
  const greetingTemplate = channel === "phone"
    ? (typeof truck.phone_greeting === "string" ? truck.phone_greeting : null)
    : (typeof truck.voice_greeting === "string" ? truck.voice_greeting : null);

  if (body.op === "payment_lookup") {
    const orderId = typeof body.orderId === "string" ? body.orderId : "";
    const token = typeof body.token === "string" ? body.token : "";
    if (!/^[0-9a-f-]{36}$/i.test(orderId) || !/^[0-9a-f-]{36}$/i.test(token)) {
      return json({ ok: false, code: "bad_request", error: "That payment link is not valid." }, 400);
    }
    const { data: order } = await admin.from("orders").select("id, truck_id, total, status, payment_status, guest_access_token").eq("id", orderId).maybeSingle();
    if (!order || order.truck_id !== slug || order.guest_access_token !== token) {
      return json({ ok: false, code: "not_found", error: "That payment link is not valid." }, 404);
    }
    return json({
      ok: true,
      total: order.total,
      status: order.status,
      paymentStatus: order.payment_status,
      message: "Card entry is not connected on this page. Pay when you pick up, or ask the restaurant to confirm payment.",
    });
  }

  let catalog: CatalogItem[] = [];
  let upsells: UpsellRule[] = [];
  try {
    const loaded = await loadCatalog(admin, slug, upsellsEnabled);
    catalog = loaded.catalog;
    upsells = loaded.upsells;
  } catch (error) {
    log("menu_failed", { slug, message: error instanceof Error ? error.message : "error" });
    return json({ ok: false, code: "unavailable", error: "The menu couldn't be loaded." }, 500);
  }
  if (catalog.length === 0) return json({ ok: false, code: "unavailable", error: "This menu has no items yet." }, 409);

  const op = typeof body.op === "string" ? body.op : "turn";
  const staffOps = new Set(["takeover", "release", "next", "staff_message", "mark_paid", "simulate"]);
  if (staffOps.has(op) && !staff) return json({ ok: false, code: "unauthorized", error: "Only the restaurant can do that." }, 401);
  if (channel === "drive_thru" && !staff) {
    return json({ ok: false, code: "unauthorized", error: "Drive-thru has to be opened by the restaurant." }, 401);
  }
  if (channel === "phone" && !phoneOn && !(owner && body.provider === "test")) {
    return json({ ok: false, code: "disabled", error: "Phone ordering is turned off." }, 403);
  }
  if (channel === "drive_thru" && !driveOn && !owner) {
    return json({ ok: false, code: "disabled", error: "Drive-thru is turned off." }, 403);
  }
  if (channel === "phone" && !acceptOrders && op === "start" && !owner) {
    return json({ ok: false, code: "closed", error: "This restaurant is not taking phone orders right now." }, 403);
  }

  if (op === "start") {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await admin.from("conversation_sessions").select("id", { count: "exact", head: true }).eq("restaurant_slug", slug).gte("started_at", since);
    if ((count ?? 0) > 80) return json({ ok: false, code: "rate_limited", error: "Too many conversations. Try again later." }, 429);
    const external = typeof body.externalCallId === "string" ? body.externalCallId.slice(0, 64) : null;
    const inserted = await admin.from("conversation_sessions").insert({
      restaurant_slug: slug,
      channel,
      external_call_id: external,
      customer_phone: typeof body.customerPhone === "string" ? body.customerPhone.slice(0, 20) : null,
      provider: typeof body.provider === "string" ? body.provider.slice(0, 40) : channel,
      language: typeof truck.phone_language === "string" ? truck.phone_language : "en",
      metadata: { lane: typeof body.lane === "string" ? body.lane.slice(0, 20) : null, audio_transport: "browser" },
    }).select("*").single();
    let session: SessionRecord;
    if (inserted.error || !inserted.data) {
      log("session_insert_failed", { slug, message: inserted.error?.message ?? "none" });
      session = {
        id: crypto.randomUUID(),
        slug,
        channel,
        status: "active",
        cart: [],
        transcript: [],
        awaiting: false,
        misses: 0,
        pickupName: null,
        orderId: null,
        submitted: false,
        takeover: false,
        handoffReason: null,
        startedAt: Date.now(),
        applied: [],
        provider: channel,
        externalCallId: external,
        stored: false,
      };
      memory.set(session.id, session);
    } else {
      session = rowToSession(inserted.data as Record<string, unknown>, true);
    }
    const greeting = channelGreeting(channel, restaurantName, greetingTemplate);
    session.transcript.push({ role: "ai", text: greeting });
    await saveSession(admin, session);
    await record(admin, slug, channelAnalytics(channel, "started"));
    const usageKind = channel === "phone" ? "phone_session" : channel === "drive_thru" ? "drive_thru_session" : "ai_session";
    const usage = await admin.from("usage_events").insert({ restaurant_slug: slug, kind: usageKind, quantity: 1 });
    if (usage.error) log("usage_insert_failed", { slug, message: usage.error.message });
    log("session_started", { slug, channel, id: session.id });
    return json({ ok: true, sessionId: session.id, greeting, status: "listening", speakPrices });
  }

  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return json({ ok: false, code: "bad_request", error: "Start a conversation first." }, 400);
  const loaded = await admin.from("conversation_sessions").select("*").eq("id", sessionId).maybeSingle();
  const fromDb = loaded.data ? rowToSession(loaded.data as Record<string, unknown>, true) : null;
  const session = fromDb ?? memory.get(sessionId) ?? null;
  if (!session || !sameRestaurant(session.slug, slug) || session.channel !== channel) {
    return json({ ok: false, code: "forbidden", error: "That conversation does not belong to this restaurant." }, 403);
  }
  const maxAge = channel === "phone" ? 30 * 60 * 1000 : 20 * 60 * 1000;
  if (Date.now() - session.startedAt > maxAge) {
    session.status = "expired";
    await saveSession(admin, session);
    log("session_ended", { slug, channel, id: session.id, reason: "expired" });
    return json({ ok: false, code: "expired", error: "This conversation has expired." }, 410);
  }

  if (op === "takeover") {
    session.takeover = true;
    session.status = "takeover";
    session.handoffReason = typeof body.reason === "string" ? body.reason.slice(0, 80) : "staff_takeover";
    await saveSession(admin, session);
    await record(admin, slug, channelAnalytics(channel, "takeover"));
    log("takeover", { slug, channel, id: session.id });
    return json({ ok: true, status: "takeover", cart: session.cart, transcript: session.transcript });
  }
  if (op === "release") {
    session.takeover = false;
    session.status = "active";
    await saveSession(admin, session);
    log("takeover_released", { slug, channel, id: session.id });
    return json({ ok: true, status: "listening", cart: session.cart, transcript: session.transcript });
  }
  if (op === "staff_message") {
    const text = typeof body.text === "string" ? body.text.replace(/[\r\n]/g, " ").trim().slice(0, 240) : "";
    if (!text) return json({ ok: false, code: "bad_request", error: "Type a message first." }, 400);
    session.transcript.push({ role: "staff", text });
    await saveSession(admin, session);
    return json({ ok: true, say: text, status: session.takeover ? "takeover" : "speaking", transcript: session.transcript, cart: session.cart });
  }
  if (op === "next") {
    session.status = "ended";
    await saveSession(admin, session);
    log("session_ended", { slug, channel, id: session.id, reason: "next_customer" });
    return json({ ok: true, status: "ended" });
  }
  if (op === "mark_paid") {
    if (!session.orderId) return json({ ok: false, code: "bad_request", error: "There is no order to mark paid." }, 400);
    const { error } = await admin.from("orders").update({ payment_status: "paid", status: "received" }).eq("id", session.orderId).eq("truck_id", slug);
    if (error) return json({ ok: false, code: "unavailable", error: "Could not update payment." }, 500);
    return json({ ok: true, orderId: session.orderId, paymentStatus: "paid" });
  }

  if (session.takeover && op !== "simulate") {
    return json({ ok: true, say: "A teammate has the speaker.", cart: session.cart, transcript: session.transcript, status: "takeover", awaitingConfirmation: session.awaiting });
  }
  if (session.transcript.length >= MAX_TURNS * 2) {
    return json({ ok: false, code: "rate_limited", error: "This conversation has ended." }, 429);
  }

  const turnId = typeof body.turnId === "string" && /^[0-9a-f-]{36}$/i.test(body.turnId) ? body.turnId : crypto.randomUUID();
  const utterance = typeof body.utterance === "string" ? body.utterance.trim().slice(0, 500) : "";
  const confidence = typeof body.transcriptConfidence === "number" ? body.transcriptConfidence : null;
  let proposals: ProposedAction[] | null = null;
  let alreadyConfirmed = false;
  let blockedSay: string | null = null;
  let hangup = false;

  if (op === "simulate") {
    proposals = readProposals(body.proposals);
  } else if (op === "confirm") {
    proposals = [{ action: "confirm_order" }];
  } else if (op === "submit") {
    proposals = [{ action: "submit_order" }];
    alreadyConfirmed = body.confirmed === true || session.awaiting;
  } else {
    const prepared = prepareChannelTurn({
      channel,
      utterance,
      awaitingConfirmation: session.awaiting,
      misunderstandingCount: session.misses,
    });
    proposals = prepared.proposals;
    alreadyConfirmed = prepared.alreadyConfirmed;
    blockedSay = prepared.blockedSay;
    hangup = prepared.hangup;
    if (prepared.channelEvent) await record(admin, slug, prepared.channelEvent);
  }

  const base = {
    channel,
    locale: typeof body.locale === "string" ? body.locale.slice(0, 12) : "en",
    catalog,
    upsells,
    upsellsEnabled,
    cart: session.cart,
    turnId,
    seenTurnIds: session.applied,
    transcriptConfidence: confidence,
    utterance,
    facts: {
      name: restaurantName,
      hours: typeof truck.hours === "string" ? truck.hours : (typeof truck.phone_hours === "string" ? truck.phone_hours : null),
      location: typeof truck.location === "string" ? truck.location : null,
      prepMinutes: typeof truck.phone_prep_minutes === "number" ? truck.phone_prep_minutes : null,
    },
    handoffAvailable: fallback.trim().length >= 7,
    alreadyConfirmed,
    speakPrices,
    confirmStyle: "spoken" as const,
  };

  let result: OrderTurnResult;
  if (blockedSay) {
    result = applyOrderTurn({ ...base, proposals: [] });
    result = { ...result, say: blockedSay, messages: [blockedSay] };
  } else if (proposals) {
    result = applyOrderTurn({ ...base, proposals });
  } else if (!utterance) {
    result = applyOrderTurn({ ...base, proposals: [] });
  } else {
    const apiKey = Deno.env.get("GOOGLE_GEMINI_API_KEY") ?? Deno.env.get("GEMINI_API_KEY") ?? "";
    const interpreted = apiKey ? await interpret(apiKey, catalog, session.cart, utterance, channel) : null;
    if (!interpreted) {
      log("interpretation_failed", { slug, channel, chars: utterance.length });
      result = aiFailureTurn({ locale: base.locale, catalog, cart: session.cart });
    } else {
      result = applyOrderTurn({ ...base, proposals: interpreted });
    }
  }

  if (!result.duplicate) session.applied.push(turnId);
  session.cart = result.cart;
  session.awaiting = result.awaitingConfirmation;
  if (result.pickupName) session.pickupName = result.pickupName;
  if (result.clarification) session.misses += 1;
  else if (result.lines.length) session.misses = 0;
  if (utterance) session.transcript.push({ role: "customer", text: utterance });
  if (result.say) session.transcript.push({ role: "ai", text: result.say });
  if (result.handoff) session.handoffReason = result.handoff.reason;
  if (hangup) session.status = "ended";

  for (const event of result.events) {
    if (channel === "phone" && event === "voice_clarification_requested") await record(admin, slug, "phone_clarification");
    if (channel === "phone" && event === "voice_upsell_offered") await record(admin, slug, "phone_upsell_offered");
    if (channel === "phone" && event === "voice_upsell_accepted") await record(admin, slug, "phone_upsell_accepted");
    if (channel === "phone" && event === "voice_order_item_added") await record(admin, slug, "phone_order_started");
    if (channel === "drive_thru" && event === "voice_clarification_requested") await record(admin, slug, "drive_thru_clarification");
    if (event === "voice_order_abandoned") await record(admin, slug, channelAnalytics(channel, "abandoned"));
  }
  if (result.rejected.length) log("validation_failed", { slug, channel, count: result.rejected.length });

  let orderId = session.orderId;
  let payment: Record<string, unknown> | null = null;
  if (result.readyToSubmit && !session.submitted) {
    const decision = channel === "drive_thru"
      ? { ok: true as const, mode: "pay_at_pickup" as const, orderStatus: "received" as const, paymentStatus: "pay_at_pickup" as const }
      : decidePayment({ payAtPickup, paymentLinkEnabled: paymentLink });
    if (!decision.ok) {
      result = { ...result, readyToSubmit: false, say: decision.say };
    } else {
      const token = crypto.randomUUID();
      const inserted = await admin.from("orders").insert({
        order_number: Date.now().toString().slice(-8),
        truck_id: slug,
        customer_name: session.pickupName,
        items: kitchenItems(result.lines),
        subtotal: result.subtotal,
        tax: result.tax,
        total: result.total,
        status: decision.orderStatus,
        guest_access_token: token,
        source: channel,
        payment_status: decision.paymentStatus,
      }).select("id").single();
      if (inserted.error || !inserted.data) {
        log("submit_failed", { slug, channel, message: inserted.error?.message ?? "none" });
        result = { ...result, readyToSubmit: false, say: "I couldn't send that to the kitchen. Please try again." };
      } else {
        session.submitted = true;
        session.orderId = inserted.data.id as string;
        orderId = session.orderId;
        session.status = "ordered";
        await record(admin, slug, channelAnalytics(channel, "completed"));
        const appUrl = (Deno.env.get("PUBLIC_APP_URL") ?? "").replace(/\/$/, "");
        const path = `/pay/${orderId}?t=${token}&r=${encodeURIComponent(slug)}`;
        payment = {
          mode: decision.mode,
          orderId,
          payPath: path,
          payUrl: appUrl ? `${appUrl}${path}` : null,
          smsSent: false,
        };
        if (decision.mode === "payment_link") {
          result = {
            ...result,
            say: "Your order is held until payment is confirmed. The restaurant has a secure payment link. I can't take a card number on this call.",
          };
        }
        log("order_submitted", { slug, channel, orderId });
      }
    }
  } else if (result.readyToSubmit && session.submitted) {
    result = { ...result, readyToSubmit: false, duplicate: true, say: "That order is already in the kitchen." };
    orderId = session.orderId;
  }

  await saveSession(admin, session);
  return json(publicResult(session, result, { orderId, payment, hangup, status: session.takeover ? "takeover" : session.status === "ordered" ? "waiting" : "listening" }));
});
