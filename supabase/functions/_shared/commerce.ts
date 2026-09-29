/**
 * Commercial rules shared by the app and Edge Functions.
 * Prices, taxes, and menu identity stay in the ordering engine.
 * This module decides plans, payment release, POS routing, and display language.
 */

export const FEATURES = [
  "menu_scan",
  "digital_menu",
  "qr_code",
  "online_ordering",
  "kds",
  "voice_ordering",
  "upsells",
  "phone_ai",
  "analytics_advanced",
  "pos_integration",
  "multilingual",
  "drive_thru",
] as const;

export type Feature = (typeof FEATURES)[number];
export type PlanCode = "free" | "core" | "ai_cashier" | "pro";

export const PLAN_FEATURES: Record<PlanCode, readonly Feature[]> = {
  free: ["menu_scan", "digital_menu", "qr_code"],
  core: ["menu_scan", "digital_menu", "qr_code", "online_ordering", "kds"],
  ai_cashier: ["menu_scan", "digital_menu", "qr_code", "online_ordering", "kds", "voice_ordering", "upsells"],
  pro: [
    "menu_scan", "digital_menu", "qr_code", "online_ordering", "kds",
    "voice_ordering", "upsells", "phone_ai", "analytics_advanced",
    "pos_integration", "multilingual", "drive_thru",
  ],
};

export function isPlanCode(value: string | null | undefined): value is PlanCode {
  return value === "free" || value === "core" || value === "ai_cashier" || value === "pro";
}

/** Active Stripe subscriptions from before plan codes keep Core ordering. */
export function resolvePlan(status: string | null | undefined, planCode: string | null | undefined): PlanCode {
  if (isPlanCode(planCode) && planCode !== "free") return planCode;
  if (status === "active" || status === "trialing") return "core";
  return "free";
}

export function hasFeature(plan: PlanCode, feature: Feature): boolean {
  return PLAN_FEATURES[plan].includes(feature);
}

export type StaffRole = "owner" | "manager" | "kitchen" | "staff";
export type StaffAction = "manage_billing" | "edit_menu" | "view_analytics" | "manage_staff" | "update_kds" | "view_orders";

const ROLE_ACTIONS: Record<StaffRole, readonly StaffAction[]> = {
  owner: ["manage_billing", "edit_menu", "view_analytics", "manage_staff", "update_kds", "view_orders"],
  manager: ["edit_menu", "view_analytics", "manage_staff", "update_kds", "view_orders"],
  kitchen: ["update_kds", "view_orders"],
  staff: ["view_orders"],
};

export function can(role: StaffRole, action: StaffAction): boolean {
  return ROLE_ACTIONS[role].includes(action);
}

export type PlaceOrderPlan =
  | { action: "send_to_kitchen"; status: "received"; paymentStatus: "pay_at_pickup" | "paid"; test: boolean }
  | { action: "await_card"; status: "pending"; paymentStatus: "pending" }
  | { action: "blocked"; message: string };

export function placeOrderPlan(input: {
  requirePaymentBeforeKitchen: boolean;
  payAtPickupAllowed: boolean;
  cardPaymentsReady: boolean;
  testMode: boolean;
}): PlaceOrderPlan {
  if (input.testMode) {
    return { action: "send_to_kitchen", status: "received", paymentStatus: "paid", test: true };
  }
  if (!input.requirePaymentBeforeKitchen) {
    return { action: "send_to_kitchen", status: "received", paymentStatus: "pay_at_pickup", test: false };
  }
  if (input.cardPaymentsReady) {
    return { action: "await_card", status: "pending", paymentStatus: "pending" };
  }
  if (input.payAtPickupAllowed) {
    return { action: "send_to_kitchen", status: "received", paymentStatus: "pay_at_pickup", test: false };
  }
  return { action: "blocked", message: "This restaurant is not accepting payment for this order yet." };
}

export type OrderRoute = "kds" | "pos" | "both";
export type RoutingStatus = "not_required" | "pending_submission" | "submitted" | "submission_failed" | "requires_staff_attention";

export type RoutePlan = {
  sendToKds: boolean;
  sendToPos: boolean;
  status: RoutingStatus;
  duplicate: boolean;
  customerMessage: string;
};

export function planRoute(input: {
  route: OrderRoute;
  paymentStatus: string;
  requirePaymentBeforeKitchen: boolean;
  externalOrderId?: string | null;
  idempotencyKey: string;
  seenKeys: string[];
}): RoutePlan {
  const paidEnough = input.paymentStatus === "paid" || input.paymentStatus === "pay_at_pickup";
  if (input.requirePaymentBeforeKitchen && !paidEnough) {
    return {
      sendToKds: false,
      sendToPos: false,
      status: "pending_submission",
      duplicate: false,
      customerMessage: "We're holding this order until payment is confirmed.",
    };
  }
  if (input.seenKeys.includes(input.idempotencyKey) || input.externalOrderId) {
    return {
      sendToKds: false,
      sendToPos: false,
      status: "submitted",
      duplicate: true,
      customerMessage: "That order is already in the kitchen.",
    };
  }
  const sendToPos = input.route === "pos" || input.route === "both";
  const sendToKds = input.route === "kds" || input.route === "both";
  return {
    sendToKds,
    sendToPos,
    status: sendToPos ? "pending_submission" : "submitted",
    duplicate: false,
    customerMessage: sendToPos ? "Sending your order." : "Your order is in the kitchen.",
  };
}

/** A failed POS submit must not be described as a successful kitchen send. */
export function posFailureMessage(): { status: "submission_failed"; customerMessage: string } {
  return {
    status: "submission_failed",
    customerMessage: "We could not send this order to the register. The restaurant has been notified.",
  };
}

export type PosProviderName = "square" | "toast" | "clover" | "lightspeed" | "touchbistro" | "ncr";

export type NormalizedPosItem = {
  externalItemId: string;
  name: string;
  priceCents: number;
  available: boolean;
  category: string;
};

export function squareCatalogItem(raw: {
  id?: string;
  item_data?: {
    name?: string;
    category_id?: string;
    variations?: { item_variation_data?: { price_money?: { amount?: number }; sellable?: boolean } }[];
  };
}): NormalizedPosItem | null {
  const id = raw.id?.trim();
  const name = raw.item_data?.name?.trim();
  if (!id || !name) return null;
  const variation = raw.item_data?.variations?.[0]?.item_variation_data;
  const amount = variation?.price_money?.amount;
  return {
    externalItemId: id,
    name: name.slice(0, 120),
    priceCents: Number.isInteger(amount) ? Number(amount) : 0,
    available: variation?.sellable !== false,
    category: raw.item_data?.category_id?.slice(0, 80) || "Menu",
  };
}

export function squareOrderBody(input: {
  locationId: string;
  idempotencyKey: string;
  referenceId: string;
  currency: string;
  lines: { name: string; quantity: number; totalCents: number }[];
}) {
  return {
    idempotency_key: input.idempotencyKey.slice(0, 45),
    order: {
      location_id: input.locationId,
      reference_id: input.referenceId.slice(0, 40),
      line_items: input.lines.map((line) => ({
        name: line.name.slice(0, 120),
        quantity: String(line.quantity),
        base_price_money: {
          amount: Math.round(line.totalCents / line.quantity),
          currency: input.currency,
        },
      })),
    },
  };
}

export type LocaleCode = "en" | "es";

export function detectLocale(utterance: string, preferred: string | null | undefined): LocaleCode {
  if (preferred === "es" || preferred === "en") {
    const text = utterance.trim();
    if (!text) return preferred;
  }
  const text = utterance.toLowerCase();
  if (/[áéíóúñ¿¡]/.test(text) || /\b(quiero|alitas|mitad|picante|limon|limón|por favor|gracias)\b/.test(text)) {
    return "es";
  }
  if (preferred === "es") return "es";
  return "en";
}

/** Translation replaces display text only. Price and id stay on the canonical item. */
export function localizedLabel(canonical: string, translated: string | undefined): string {
  const next = translated?.trim();
  return next ? next : canonical;
}

export type AnalyticsOrder = {
  total: number;
  source: string | null;
  status: string;
  isTest?: boolean;
  createdAt: string;
};

export type AnalyticsSummary = {
  orders: number;
  revenue: number;
  averageTicket: number;
  cancelled: number;
  byChannel: Record<string, { orders: number; revenue: number }>;
};

export function summarizeOrders(rows: AnalyticsOrder[]): AnalyticsSummary {
  const live = rows.filter((row) => !row.isTest);
  const counted = live.filter((row) => row.status !== "cancelled");
  const revenue = counted.reduce((sum, row) => sum + Number(row.total || 0), 0);
  const byChannel: AnalyticsSummary["byChannel"] = {};
  for (const row of counted) {
    const key = row.source || "manual";
    const bucket = byChannel[key] ?? { orders: 0, revenue: 0 };
    bucket.orders += 1;
    bucket.revenue += Number(row.total || 0);
    byChannel[key] = bucket;
  }
  return {
    orders: counted.length,
    revenue,
    averageTicket: counted.length ? revenue / counted.length : 0,
    cancelled: live.filter((row) => row.status === "cancelled").length,
    byChannel,
  };
}

export type SetupFlags = {
  profile: boolean;
  menuImported: boolean;
  menuReviewed: boolean;
  payments: boolean;
  qr: boolean;
  ordering: boolean;
  kitchen: boolean;
  testOrder: boolean;
};

export function setupProgress(flags: SetupFlags): { percent: number; next: string } {
  const steps: { done: boolean; label: string }[] = [
    { done: flags.profile, label: "Finish the restaurant profile" },
    { done: flags.menuImported, label: "Import the menu" },
    { done: flags.menuReviewed, label: "Review the menu" },
    { done: flags.payments, label: "Choose how customers pay" },
    { done: flags.qr, label: "Download the QR code" },
    { done: flags.ordering, label: "Turn ordering on" },
    { done: flags.kitchen, label: "Open the kitchen display once" },
    { done: flags.testOrder, label: "Place a test order" },
  ];
  const done = steps.filter((step) => step.done).length;
  const next = steps.find((step) => !step.done)?.label ?? "Setup is complete";
  return { percent: Math.round((done / steps.length) * 100), next };
}

export function readCampaign(search: string): string | null {
  const value = new URLSearchParams(search).get("campaign") ?? "";
  const cleaned = value.trim().toLowerCase();
  if (!/^[a-z0-9-]{2,40}$/.test(cleaned)) return null;
  return cleaned;
}

export const POS_CATALOG: { id: PosProviderName; name: string; implemented: boolean }[] = [
  { id: "square", name: "Square", implemented: true },
  { id: "toast", name: "Toast", implemented: false },
  { id: "clover", name: "Clover", implemented: false },
  { id: "lightspeed", name: "Lightspeed", implemented: false },
  { id: "touchbistro", name: "TouchBistro", implemented: false },
  { id: "ncr", name: "NCR / Aloha", implemented: false },
];
