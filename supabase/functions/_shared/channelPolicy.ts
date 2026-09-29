/**
 * Channel adapters around the shared ordering engine.
 * They decide transport details (greeting, handoff, payment, confidence).
 * They do not price items or invent menu matches.
 */
import {
  type HandoffReason,
  type OrderChannel,
  type ProposedAction,
  normalizeChannel,
} from "./orderingEngine.ts";

export type ChannelStatus = "listening" | "thinking" | "speaking" | "waiting" | "takeover";

export type AudioTransport = "browser" | "sip" | "websocket" | "edge_device" | "headset";

const ANGRY = /\b(this is ridiculous|so frustrated|worst|terrible service|angry|pissed|manager now)\b/i;
const TRANSFER = /\b(speak to|talk to|real person|employee|manager|human|somebody there)\b/i;
const REFUND = /\b(refund|money back|chargeback)\b/i;
const ALLERGY = /\b(allerg|anaphyla|gluten|nut allergy|peanut)\b/i;
const COMPLAINT = /\b(complaint|this is wrong|never coming back)\b/i;
const CATERING = /\b(catering|fifty people|100 people|party of)\b/i;
const HOURS = /\b(hours|what time.*open|are you open|when do you close)\b/i;
const LOCATION = /\b(where are you|address|location|how do i get)\b/i;
const PREP = /\b(how long|ready in|wait time|prep time)\b/i;
const YES = /^(yes|yeah|yep|correct|that's right|that is right|sounds good|go ahead|send it|si|sí)\b/i;
const HANGUP = /\b(never mind|forget it|hang up|goodbye)\b/i;

export function channelGreeting(channel: OrderChannel, restaurantName: string, template: string | null | undefined): string {
  const name = restaurantName.trim() || "the restaurant";
  const fallback = channel === "phone"
    ? `Thanks for calling ${name}. I can help you place an order.`
    : channel === "drive_thru"
    ? `Welcome to ${name}. What can I get started for you?`
    : `Welcome to ${name}. What can I get started for you?`;
  const raw = (template ?? "").trim();
  const text = (raw || fallback).split("{{restaurant_name}}").join(name);
  return text.slice(0, 240);
}

export type PreparedTurn = {
  proposals: ProposedAction[] | null;
  alreadyConfirmed: boolean;
  blockedSay: string | null;
  hangup: boolean;
  handoffReason: HandoffReason | null;
  channelEvent: string | null;
};

/** Safety net that runs before the model. A null proposals list means "ask the model". */
export function prepareChannelTurn(input: {
  channel: unknown;
  utterance: string;
  awaitingConfirmation: boolean;
  misunderstandingCount: number;
}): PreparedTurn {
  const channel = normalizeChannel(input.channel);
  const text = input.utterance.trim();
  const prefix = channel === "phone" ? "phone" : channel === "drive_thru" ? "drive_thru" : "voice";

  if (!text) {
    return { proposals: [], alreadyConfirmed: false, blockedSay: null, hangup: false, handoffReason: null, channelEvent: null };
  }
  if (HANGUP.test(text) && channel === "phone") {
    return {
      proposals: [{ action: "cancel_order" }],
      alreadyConfirmed: false,
      blockedSay: null,
      hangup: true,
      handoffReason: null,
      channelEvent: "phone_call_completed",
    };
  }
  if (input.awaitingConfirmation && YES.test(text)) {
    return {
      proposals: [{ action: "submit_order" }],
      alreadyConfirmed: true,
      blockedSay: null,
      hangup: false,
      handoffReason: null,
      channelEvent: null,
    };
  }

  const reason = handoffReasonFor(text, input.misunderstandingCount);
  if (reason) {
    return {
      proposals: [{ action: "request_handoff", reason }],
      alreadyConfirmed: false,
      blockedSay: null,
      hangup: false,
      handoffReason: reason,
      channelEvent: channel === "phone" ? "phone_handoff" : null,
    };
  }
  if (HOURS.test(text)) {
    return place("hours", prefix);
  }
  if (LOCATION.test(text)) {
    return place("location", prefix);
  }
  if (PREP.test(text)) {
    return place("prep", prefix);
  }
  if (isOffTopic(text)) {
    return {
      proposals: [],
      alreadyConfirmed: false,
      blockedSay: "I can help with the menu, hours, location, and your order.",
      hangup: false,
      handoffReason: null,
      channelEvent: null,
    };
  }
  return {
    proposals: null,
    alreadyConfirmed: false,
    blockedSay: null,
    hangup: false,
    handoffReason: null,
    channelEvent: null,
  };
}

function place(topic: "hours" | "location" | "prep", prefix: string): PreparedTurn {
  return {
    proposals: [{ action: "answer_place", topic }],
    alreadyConfirmed: false,
    blockedSay: null,
    hangup: false,
    handoffReason: null,
    channelEvent: prefix === "phone" ? "phone_clarification" : null,
  };
}

export function handoffReasonFor(text: string, misunderstandingCount: number): HandoffReason | null {
  if (REFUND.test(text)) return "refund";
  if (ALLERGY.test(text)) return "allergy";
  if (CATERING.test(text)) return "catering";
  if (TRANSFER.test(text)) return "requested_employee";
  if (ANGRY.test(text) || COMPLAINT.test(text)) return "complaint";
  if (misunderstandingCount >= 2 && /\b(what|huh|sorry|again|don't understand)\b/i.test(text)) {
    return "repeated_misunderstanding";
  }
  return null;
}

const ORDERISH = /\b(menu|order|burger|fries|drink|combo|add|remove|large|small|pickup|chicken|sandwich|wings|fries|coke|sprite|water|side|sauce)\b/i;

export function isOffTopic(text: string): boolean {
  if (ORDERISH.test(text) || HOURS.test(text) || LOCATION.test(text) || YES.test(text)) return false;
  return /\b(weather|president|homework|write me a poem|who won the game|stock price|python code)\b/i.test(text);
}

export type PaymentDecision =
  | { ok: true; mode: "pay_at_pickup"; orderStatus: "received"; paymentStatus: "pay_at_pickup" }
  | { ok: true; mode: "payment_link"; orderStatus: "pending"; paymentStatus: "link_pending" }
  | { ok: false; say: string };

/** Never collects a card number. Link mode only records that a link is owed. */
export function decidePayment(input: { payAtPickup: boolean; paymentLinkEnabled: boolean }): PaymentDecision {
  if (input.payAtPickup) {
    return { ok: true, mode: "pay_at_pickup", orderStatus: "received", paymentStatus: "pay_at_pickup" };
  }
  if (input.paymentLinkEnabled) {
    return { ok: true, mode: "payment_link", orderStatus: "pending", paymentStatus: "link_pending" };
  }
  return {
    ok: false,
    say: "I can't take payment on this call yet. Please order at the counter or from the menu link.",
  };
}

export function sameRestaurant(sessionSlug: string, requestSlug: string): boolean {
  return sessionSlug.trim().toLowerCase() === requestSlug.trim().toLowerCase();
}

const SLUG = /^[a-z0-9-]{2,63}$/;

export function validSlug(value: unknown): value is string {
  return typeof value === "string" && SLUG.test(value);
}

export function channelAnalytics(channel: OrderChannel, kind: "started" | "completed" | "abandoned" | "clarification" | "upsell_offered" | "upsell_accepted" | "handoff" | "takeover"): string | null {
  if (channel === "phone") {
    if (kind === "started") return "phone_call_started";
    if (kind === "completed") return "phone_order_completed";
    if (kind === "abandoned") return "phone_order_abandoned";
    if (kind === "clarification") return "phone_clarification";
    if (kind === "upsell_offered") return "phone_upsell_offered";
    if (kind === "upsell_accepted") return "phone_upsell_accepted";
    if (kind === "handoff") return "phone_handoff";
    return null;
  }
  if (channel === "drive_thru") {
    if (kind === "started") return "drive_thru_session_started";
    if (kind === "completed") return "drive_thru_order_completed";
    if (kind === "abandoned") return "drive_thru_order_abandoned";
    if (kind === "takeover") return "drive_thru_takeover";
    if (kind === "clarification") return "drive_thru_clarification";
    return null;
  }
  return null;
}

export function lowConfidenceQuestion(transcript: string): string {
  const mild = /\bmild\b/i.test(transcript);
  const hot = /\bhot\b/i.test(transcript);
  if (mild && hot) return "I'm sorry, did you say mild or hot?";
  return "I'm sorry, I didn't catch that clearly. Could you say it again?";
}

/** Carrier webhooks must name a call. Speech is optional on the first ring. */
export function parseProviderWebhook(body: Record<string, unknown>):
  | { ok: true; callId: string; from: string; speech: string }
  | { ok: false; error: string } {
  const callId = typeof body.CallSid === "string" ? body.CallSid.trim() : "";
  if (!/^CA[a-zA-Z0-9]{16,40}$/.test(callId)) {
    return { ok: false, error: "Missing call id" };
  }
  const from = typeof body.From === "string" ? body.From.replace(/[^\d+]/g, "").slice(0, 20) : "";
  const speech = typeof body.SpeechResult === "string" ? body.SpeechResult.trim().slice(0, 500) : "";
  return { ok: true, callId, from, speech };
}
