/**
 * Deterministic restaurant insights.
 * Numbers come from the orders, sessions, and menu rows passed in.
 * Language below only describes those numbers. It does not estimate revenue.
 */

export const HEALTH_WEIGHTS = {
  sales: 25,
  ordering: 20,
  menu: 15,
  retention: 15,
  ai: 15,
  operations: 10,
} as const;

export const ACTION_STATES = ["suggested", "approved", "rejected", "scheduled", "active", "completed"] as const;
export type ActionStatus = (typeof ACTION_STATES)[number];

const RECENT_MS = 7 * 24 * 60 * 60 * 1000;
const BASE_MS = 30 * 24 * 60 * 60 * 1000;
const INACTIVE_MS = 45 * 24 * 60 * 60 * 1000;
const MIN_COMPARE = 5;
const MIN_PAIR_ORDERS = 10;
const MIN_PAIR_RATE = 0.3;
const MIN_HOUR_ORDERS = 20;
const MIN_SESSIONS = 5;
const MIN_CAMPAIGN = 5;

export type InsightLine = { id: string; name: string; quantity: number; category: string };

export type InsightOrder = {
  id: string;
  createdAt: string;
  total: number;
  status: string;
  paymentStatus: string;
  source: string;
  isTest?: boolean;
  routingStatus?: string | null;
  lines: InsightLine[];
};

export type InsightSession = {
  channel: string;
  startedAt: string;
  submitted: boolean;
  customerPhone?: string | null;
  orderId?: string | null;
};

export type InsightMenuItem = {
  id: string;
  name: string;
  category: string;
  available: boolean;
  price: number;
  description: string;
};

export type InsightUpsell = { sourceItemId: string; suggestedItemId: string; enabled: boolean };
export type InsightEvent = { name: string; createdAt: string };

export type HealthPart = {
  key: keyof typeof HEALTH_WEIGHTS;
  label: string;
  weight: number;
  score: number | null;
  reason: string;
};

export type ActionCard = {
  id: string;
  priority: "high" | "medium" | "low";
  title: string;
  issue: string;
  evidence: string;
  action: string;
  effort: "low" | "medium";
  impact: string | null;
  kind: "upsell" | "promotion" | "menu" | "operations" | "retention" | "campaign";
  canApply: boolean;
  payload: Record<string, string | number | boolean | null>;
};

export type UpsellRecommendation = {
  id: string;
  sourceItemId: string;
  suggestedItemId: string;
  sourceName: string;
  suggestedName: string;
  withBoth: number;
  withSource: number;
  evidence: string;
  canApply: boolean;
};

export type PromotionRecommendation = {
  id: string;
  evidence: string;
  startHourUtc: number;
  endHourUtc: number;
  ordersInBlock: number;
  busiestOrders: number;
  discount: null;
};

export type InsightReport = {
  generatedAt: string;
  ordersIn30Days: number;
  revenueIn30Days: number;
  averageTicket30Days: number | null;
  health: { overall: number | null; parts: HealthPart[] };
  briefing: string[];
  actions: ActionCard[];
  topItems: { name: string; quantity: number; orders: number }[];
  lowItems: { name: string; id: string }[];
  pairs: { sourceName: string; suggestedName: string; withBoth: number; withSource: number }[];
  categories: { name: string; quantity: number }[];
  upsells: UpsellRecommendation[];
  promotions: PromotionRecommendation[];
  retention: {
    available: boolean;
    reason: string;
    repeatCustomers: number;
    customers: number;
    inactiveAtLeast3: number;
  };
  missingDescriptions: { id: string; name: string }[];
  gaps: string[];
  yesterday: { orders: number; revenue: number; averageTicket: number | null };
  phone: { sessions: number; submitted: number } | null;
  voice: { sessions: number; submitted: number } | null;
};

type Input = {
  now: Date;
  orders: InsightOrder[];
  sessions: InsightSession[];
  menu: InsightMenuItem[];
  upsells: InsightUpsell[];
  events: InsightEvent[];
};

function money(value: number): string {
  return `$${value.toFixed(2)}`;
}

function pct(part: number, whole: number): string {
  if (whole <= 0) return "0%";
  return `${Math.round((part / whole) * 100)}%`;
}

function deltaPct(current: number, baseline: number): number | null {
  if (baseline === 0) return null;
  return ((current - baseline) / baseline) * 100;
}

function avg(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function inRange(iso: string, start: number, end: number): boolean {
  const time = new Date(iso).getTime();
  return time >= start && time < end;
}

export function readOrderLines(items: unknown): InsightLine[] {
  if (!Array.isArray(items)) return [];
  const lines: InsightLine[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const menu = row.menuItem && typeof row.menuItem === "object" ? row.menuItem as Record<string, unknown> : row;
    const id = typeof menu.id === "string" ? menu.id : "";
    const name = typeof menu.name === "string" ? menu.name.trim() : "";
    if (!id && !name) continue;
    const quantity = typeof row.quantity === "number" && row.quantity > 0 ? Math.round(row.quantity) : 1;
    const category = typeof menu.category === "string" ? menu.category : "";
    lines.push({ id: id || name, name: name || id, quantity, category });
  }
  return lines;
}

function maskPhone(phone: string | null | undefined): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 10) return "";
  return digits.slice(-10);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function canTransition(from: ActionStatus, to: ActionStatus): boolean {
  const next: Record<ActionStatus, ActionStatus[]> = {
    suggested: ["approved", "rejected"],
    approved: ["scheduled", "active", "rejected"],
    scheduled: ["active", "rejected"],
    active: ["completed"],
    rejected: [],
    completed: [],
  };
  return next[from].includes(to);
}

export function buildReport(input: Input): InsightReport {
  const now = input.now.getTime();
  const recentStart = now - RECENT_MS;
  const windowStart = now - BASE_MS;
  const live = input.orders.filter((order) => !order.isTest && new Date(order.createdAt).getTime() >= windowStart && new Date(order.createdAt).getTime() <= now);
  const counted = live.filter((order) => order.status !== "cancelled");
  const recent = counted.filter((order) => inRange(order.createdAt, recentStart, now + 1));
  const baseline = counted.filter((order) => inRange(order.createdAt, windowStart, recentStart));
  const recentAvg = avg(recent.map((order) => Number(order.total) || 0));
  const baselineAvg = avg(baseline.map((order) => Number(order.total) || 0));
  const revenue = counted.reduce((sum, order) => sum + (Number(order.total) || 0), 0);
  const averageTicket = avg(counted.map((order) => Number(order.total) || 0));

  const dayStart = new Date(input.now);
  dayStart.setUTCHours(0, 0, 0, 0);
  const yesterdayStart = dayStart.getTime() - 24 * 60 * 60 * 1000;
  const yesterdayOrders = counted.filter((order) => inRange(order.createdAt, yesterdayStart, dayStart.getTime()));
  const yesterdayRevenue = yesterdayOrders.reduce((sum, order) => sum + (Number(order.total) || 0), 0);

  const gaps = [
    "Item views are not tracked, so this report does not say which dishes were viewed but not ordered.",
    "Food cost is not stored, so there is no margin ranking.",
    "Comparisons are against this restaurant's own orders, not other restaurants.",
  ];

  const parts: HealthPart[] = [
    salesPart(recent, baseline, recentAvg, baselineAvg),
    orderingPart(live),
    menuPart(input.menu),
    retentionPart(input, counted, windowStart),
    aiPart(input, windowStart, now),
    operationsPart(live),
  ];
  const scored = parts.filter((part) => part.score !== null);
  const weight = scored.reduce((sum, part) => sum + part.weight, 0);
  const overall = counted.length < MIN_COMPARE || weight === 0
    ? null
    : Math.round(scored.reduce((sum, part) => sum + (part.score ?? 0) * part.weight, 0) / weight);

  const actions: ActionCard[] = [];
  const ticket = ticketAction(recent, baseline, recentAvg, baselineAvg);
  if (ticket) actions.push(ticket);
  const cancels = cancelAction(live, recentStart);
  if (cancels) actions.push(cancels);
  const payments = paymentAction(live, recentStart);
  if (payments) actions.push(payments);
  const unavailable = unavailableAction(counted, input.menu);
  if (unavailable) actions.push(unavailable);
  const upsells = pairUpsells(counted, input.menu, input.upsells);
  for (const upsell of upsells) {
    actions.push({
      id: upsell.id,
      priority: "medium",
      title: `Offer ${upsell.suggestedName} when someone orders ${upsell.sourceName}`,
      issue: "These two items already show up on the same tickets.",
      evidence: upsell.evidence,
      action: "Accept adds an upsell rule. Ignore leaves the menu unchanged.",
      effort: "low",
      impact: `${upsell.withBoth} of ${upsell.withSource} ${upsell.sourceName} orders also included ${upsell.suggestedName}.`,
      kind: "upsell",
      canApply: upsell.canApply,
      payload: {
        sourceItemId: upsell.sourceItemId,
        suggestedItemId: upsell.suggestedItemId,
        withBoth: upsell.withBoth,
        withSource: upsell.withSource,
      },
    });
  }
  const promotions = slowBlock(counted);
  for (const promotion of promotions) {
    actions.push({
      id: promotion.id,
      priority: "medium",
      title: `Look at ${promotion.startHourUtc}:00–${promotion.endHourUtc}:00 UTC`,
      issue: "This two-hour block has fewer orders than the busiest block.",
      evidence: promotion.evidence,
      action: "Approving saves a promotion draft. It does not discount orders or notify customers.",
      effort: "medium",
      impact: null,
      kind: "promotion",
      canApply: false,
      payload: {
        startHourUtc: promotion.startHourUtc,
        endHourUtc: promotion.endHourUtc,
        ordersInBlock: promotion.ordersInBlock,
        busiestOrders: promotion.busiestOrders,
        discount: null,
      },
    });
  }
  const sessions = sessionAction(input, windowStart, now);
  if (sessions) actions.push(sessions);
  const phoneCard = phoneAction(input, windowStart, now);
  if (phoneCard) actions.push(phoneCard);

  const itemStats = itemQuantities(counted);
  const topItems = [...itemStats.values()]
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 5)
    .map(({ name, quantity, orders }) => ({ name, quantity, orders }));
  const lowItems = input.menu
    .filter((item) => item.available && counted.length >= MIN_HOUR_ORDERS && !itemStats.has(item.id) && ![...itemStats.values()].some((row) => row.name === item.name))
    .slice(0, 5)
    .map((item) => ({ id: item.id, name: item.name }));
  if (lowItems.length) {
    actions.push({
      id: "low_sellers",
      priority: "low",
      title: "Some available items had no orders",
      issue: `${lowItems.map((item) => item.name).join(", ")} had no orders in the last 30 days.`,
      evidence: `This uses ${counted.length} non-cancelled orders. It is not a view count.`,
      action: "Review the items. Nothing is hidden or repriced automatically.",
      effort: "low",
      impact: null,
      kind: "menu",
      canApply: false,
      payload: { count: lowItems.length },
    });
  }
  const missingDescriptions = input.menu.filter((item) => item.available && item.description.trim().length < 12).slice(0, 5).map((item) => ({ id: item.id, name: item.name }));
  if (missingDescriptions.length) {
    actions.push({
      id: "missing_description",
      priority: "low",
      title: "Some items have no usable description",
      issue: `${missingDescriptions.map((item) => item.name).join(", ")} ${missingDescriptions.length === 1 ? "has" : "have"} no description of at least 12 characters.`,
      evidence: "The menu row is blank or very short. No new marketing copy was written.",
      action: "Edit the description yourself. Health or nutrition claims are not generated.",
      effort: "low",
      impact: null,
      kind: "menu",
      canApply: false,
      payload: { count: missingDescriptions.length },
    });
  }

  const retention = retentionSummary(input, counted, windowStart, now);
  if (!retention.available) gaps.push(retention.reason);
  if (retention.inactiveAtLeast3 >= MIN_CAMPAIGN) {
    actions.push({
      id: "inactive_customers",
      priority: "medium",
      title: `${retention.inactiveAtLeast3} phone-linked customers have not ordered in 45 days`,
      issue: "Each of these phone numbers has at least 3 past orders, and the latest is older than 45 days.",
      evidence: retention.reason,
      action: "Approving saves a campaign draft. No SMS or email is sent.",
      effort: "medium",
      impact: null,
      kind: "campaign",
      canApply: false,
      payload: { customers: retention.inactiveAtLeast3, discount: null },
    });
  }

  const priorityRank = { high: 0, medium: 1, low: 2 };
  actions.sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority]);
  const briefing = actions.filter((action) => action.priority !== "low").slice(0, 3).map((action) => action.evidence);
  if (briefing.length === 0) {
    briefing.push(counted.length < MIN_COMPARE
      ? `There are ${counted.length} non-cancelled orders in the last 30 days. That is not enough to call out a trend.`
      : "No ticket, cancellation, pairing, or hour pattern cleared the minimum sample size.");
  }

  const categories = new Map<string, number>();
  for (const order of counted) {
    for (const line of order.lines) {
      const name = line.category || "Uncategorized";
      categories.set(name, (categories.get(name) ?? 0) + line.quantity);
    }
  }

  return {
    generatedAt: input.now.toISOString(),
    ordersIn30Days: counted.length,
    revenueIn30Days: revenue,
    averageTicket30Days: averageTicket,
    health: { overall, parts },
    briefing,
    actions,
    topItems,
    lowItems,
    pairs: upsells.map((row) => ({ sourceName: row.sourceName, suggestedName: row.suggestedName, withBoth: row.withBoth, withSource: row.withSource })),
    categories: [...categories.entries()].map(([name, quantity]) => ({ name, quantity })).sort((a, b) => b.quantity - a.quantity),
    upsells,
    promotions,
    retention,
    missingDescriptions,
    gaps,
    yesterday: {
      orders: yesterdayOrders.length,
      revenue: yesterdayRevenue,
      averageTicket: avg(yesterdayOrders.map((order) => Number(order.total) || 0)),
    },
    phone: channelStats(input.sessions, "phone", windowStart, now),
    voice: channelStats(input.sessions, "mobile_voice", windowStart, now),
  };
}

function salesPart(recent: InsightOrder[], baseline: InsightOrder[], recentAvg: number | null, baselineAvg: number | null): HealthPart {
  if (recent.length < MIN_COMPARE || baseline.length < MIN_COMPARE || recentAvg === null || baselineAvg === null) {
    return { key: "sales", label: "Sales", weight: HEALTH_WEIGHTS.sales, score: null, reason: `Ticket trend needs at least ${MIN_COMPARE} orders this week and ${MIN_COMPARE} in the prior 23 days. This week has ${recent.length}. The prior window has ${baseline.length}.` };
  }
  const change = deltaPct(recentAvg, baselineAvg) ?? 0;
  const score = change >= -5 ? 100 : change >= -15 ? 70 : 40;
  const direction = change >= 0 ? "higher" : "lower";
  return {
    key: "sales",
    label: "Sales",
    weight: HEALTH_WEIGHTS.sales,
    score,
    reason: `Average ticket this week is ${money(recentAvg)} across ${recent.length} orders. The prior 23 days averaged ${money(baselineAvg)} across ${baseline.length} orders, which is ${Math.abs(Math.round(change))}% ${direction}.`,
  };
}

function orderingPart(live: InsightOrder[]): HealthPart {
  if (live.length < MIN_COMPARE) {
    return { key: "ordering", label: "Ordering", weight: HEALTH_WEIGHTS.ordering, score: null, reason: `Cancellation rate needs at least ${MIN_COMPARE} orders. There are ${live.length}.` };
  }
  const cancelled = live.filter((order) => order.status === "cancelled").length;
  const failed = live.filter((order) => order.paymentStatus === "failed").length;
  const rate = cancelled / live.length;
  let score = clamp(Math.round(100 - rate * 400), 20, 100);
  if (failed >= 2) score = clamp(score - 15, 20, 100);
  return {
    key: "ordering",
    label: "Ordering",
    weight: HEALTH_WEIGHTS.ordering,
    score,
    reason: `${cancelled} of ${live.length} orders were cancelled (${pct(cancelled, live.length)}). ${failed} payments failed.`,
  };
}

function menuPart(menu: InsightMenuItem[]): HealthPart {
  if (!menu.length) {
    return { key: "menu", label: "Menu", weight: HEALTH_WEIGHTS.menu, score: null, reason: "No menu items are stored, so availability cannot be scored." };
  }
  const unavailable = menu.filter((item) => !item.available).length;
  const score = clamp(Math.round(100 - (unavailable / menu.length) * 100), 0, 100);
  return {
    key: "menu",
    label: "Menu",
    weight: HEALTH_WEIGHTS.menu,
    score,
    reason: `${unavailable} of ${menu.length} menu items are marked unavailable.`,
  };
}

function retentionPart(input: Input, counted: InsightOrder[], windowStart: number): HealthPart {
  const summary = retentionSummary(input, counted, windowStart, input.now?.getTime?.() ?? Date.now());
  if (!summary.available) {
    return { key: "retention", label: "Customer retention", weight: HEALTH_WEIGHTS.retention, score: null, reason: summary.reason };
  }
  const rate = summary.customers === 0 ? 0 : summary.repeatCustomers / summary.customers;
  return {
    key: "retention",
    label: "Customer retention",
    weight: HEALTH_WEIGHTS.retention,
    score: Math.round(rate * 100),
    reason: summary.reason,
  };
}

function aiPart(input: Input, windowStart: number, now: number): HealthPart {
  const sessions = input.sessions.filter((session) => inRange(session.startedAt, windowStart, now + 1));
  const offered = input.events.filter((event) => event.name.endsWith("_upsell_offered") && inRange(event.createdAt, windowStart, now + 1)).length;
  const accepted = input.events.filter((event) => event.name.endsWith("_upsell_accepted") && inRange(event.createdAt, windowStart, now + 1)).length;
  if (sessions.length < MIN_SESSIONS && offered < MIN_SESSIONS) {
    return { key: "ai", label: "AI performance", weight: HEALTH_WEIGHTS.ai, score: null, reason: `AI completion needs at least ${MIN_SESSIONS} voice, phone, or drive-thru sessions, or ${MIN_SESSIONS} upsell offers. There are ${sessions.length} sessions and ${offered} offers.` };
  }
  if (sessions.length >= MIN_SESSIONS) {
    const done = sessions.filter((session) => session.submitted).length;
    return { key: "ai", label: "AI performance", weight: HEALTH_WEIGHTS.ai, score: Math.round((done / sessions.length) * 100), reason: `${done} of ${sessions.length} AI sessions were submitted.` };
  }
  return { key: "ai", label: "AI performance", weight: HEALTH_WEIGHTS.ai, score: Math.round((accepted / offered) * 100), reason: `${accepted} of ${offered} recorded upsell offers were accepted.` };
}

function operationsPart(live: InsightOrder[]): HealthPart {
  const failed = live.filter((order) => order.routingStatus === "submission_failed" || order.routingStatus === "requires_staff_attention").length;
  if (failed === 0) {
    return { key: "operations", label: "Operations", weight: HEALTH_WEIGHTS.operations, score: null, reason: "Kitchen ticket timing is not stored. No POS submission failures were on these orders, so operations is left unscored." };
  }
  return {
    key: "operations",
    label: "Operations",
    weight: HEALTH_WEIGHTS.operations,
    score: clamp(100 - failed * 20, 20, 100),
    reason: `${failed} orders have a failed or unsent POS submission. Ticket cook time is not stored, so it is not part of this score.`,
  };
}

function ticketAction(recent: InsightOrder[], baseline: InsightOrder[], recentAvg: number | null, baselineAvg: number | null): ActionCard | null {
  if (recent.length < MIN_COMPARE || baseline.length < MIN_COMPARE || recentAvg === null || baselineAvg === null) return null;
  const change = deltaPct(recentAvg, baselineAvg);
  if (change === null || change > -10) return null;
  return {
    id: "ticket_drop",
    priority: "high",
    title: "Average ticket is below your recent baseline",
    issue: "This week's tickets are at least 10% below the prior 23 days.",
    evidence: `Average ticket this week is ${money(recentAvg)} across ${recent.length} orders. The prior 23 days averaged ${money(baselineAvg)} across ${baseline.length} orders (${Math.abs(Math.round(change))}% lower).`,
    action: "Review what changed in the mix. No price is changed automatically.",
    effort: "medium",
    impact: null,
    kind: "operations",
    canApply: false,
    payload: { recentOrders: recent.length, baselineOrders: baseline.length, changePct: Math.round(change) },
  };
}

function cancelAction(live: InsightOrder[], recentStart: number): ActionCard | null {
  const recent = live.filter((order) => new Date(order.createdAt).getTime() >= recentStart);
  const prior = live.filter((order) => new Date(order.createdAt).getTime() < recentStart);
  if (recent.length < MIN_COMPARE || prior.length < MIN_COMPARE) return null;
  const recentCancelled = recent.filter((order) => order.status === "cancelled").length;
  const priorCancelled = prior.filter((order) => order.status === "cancelled").length;
  const recentRate = recentCancelled / recent.length;
  const priorRate = priorCancelled / prior.length;
  if (recentCancelled < 3 || recentRate < priorRate + 0.08) return null;
  return {
    id: "cancel_spike",
    priority: "high",
    title: "Cancellations are higher than your prior window",
    issue: "Cancelled orders rose by at least 8 percentage points.",
    evidence: `${recentCancelled} of ${recent.length} orders this week were cancelled (${pct(recentCancelled, recent.length)}). The prior 23 days were ${priorCancelled} of ${prior.length} (${pct(priorCancelled, prior.length)}).`,
    action: "Review cancelled tickets. No orders are reopened automatically.",
    effort: "medium",
    impact: null,
    kind: "operations",
    canApply: false,
    payload: { recentCancelled, recentOrders: recent.length, priorCancelled, priorOrders: prior.length },
  };
}

function paymentAction(live: InsightOrder[], recentStart: number): ActionCard | null {
  const failed = live.filter((order) => order.paymentStatus === "failed" && new Date(order.createdAt).getTime() >= recentStart);
  if (failed.length < 2) return null;
  return {
    id: "payment_failures",
    priority: "high",
    title: "Card payments failed this week",
    issue: "Failed payments are counted. The orders were not treated as paid.",
    evidence: `${failed.length} orders this week have payment status failed.`,
    action: "Check the payments page. No charge is retried from this screen.",
    effort: "low",
    impact: null,
    kind: "operations",
    canApply: false,
    payload: { failed: failed.length },
  };
}

function unavailableAction(counted: InsightOrder[], menu: InsightMenuItem[]): ActionCard | null {
  const stats = itemQuantities(counted);
  const ranked = [...stats.entries()].sort((a, b) => b[1].quantity - a[1].quantity).slice(0, 5);
  const hits = ranked.flatMap(([id, stat]) => {
    const item = menu.find((row) => row.id === id || row.name === stat.name);
    if (!item || item.available) return [];
    return [`${item.name} is unavailable and was ordered ${stat.quantity} times in ${stat.orders} orders.`];
  });
  if (!hits.length) return null;
  return {
    id: "unavailable_popular",
    priority: "high",
    title: "A frequently ordered item is unavailable",
    issue: "Availability is the current menu flag. Past hours when it sold out are not stored.",
    evidence: hits.join(" "),
    action: "Turn the item back on, or leave it unavailable. The menu is not edited from here.",
    effort: "low",
    impact: null,
    kind: "menu",
    canApply: false,
    payload: { items: hits.length },
  };
}

function itemQuantities(orders: InsightOrder[]): Map<string, { name: string; quantity: number; orders: number }> {
  const stats = new Map<string, { name: string; quantity: number; orders: number }>();
  for (const order of orders) {
    const seen = new Set<string>();
    for (const line of order.lines) {
      const current = stats.get(line.id) ?? { name: line.name, quantity: 0, orders: 0 };
      current.quantity += line.quantity;
      if (!seen.has(line.id)) current.orders += 1;
      seen.add(line.id);
      stats.set(line.id, current);
    }
  }
  return stats;
}

function pairUpsells(orders: InsightOrder[], menu: InsightMenuItem[], rules: InsightUpsell[]): UpsellRecommendation[] {
  const containing = new Map<string, Set<string>>();
  const names = new Map<string, string>();
  for (const order of orders) {
    const ids = [...new Set(order.lines.map((line) => line.id))];
    for (const line of order.lines) names.set(line.id, line.name);
    for (const id of ids) {
      const set = containing.get(id) ?? new Set<string>();
      set.add(order.id);
      containing.set(id, set);
    }
  }
  const found: UpsellRecommendation[] = [];
  for (const [sourceId, sourceOrders] of containing) {
    if (sourceOrders.size < MIN_PAIR_ORDERS) continue;
    const companions = new Map<string, number>();
    for (const order of orders) {
      if (!sourceOrders.has(order.id)) continue;
      for (const id of new Set(order.lines.map((line) => line.id))) {
        if (id === sourceId) continue;
        companions.set(id, (companions.get(id) ?? 0) + 1);
      }
    }
    for (const [suggestedId, withBoth] of companions) {
      if (withBoth / sourceOrders.size < MIN_PAIR_RATE) continue;
      const enabled = rules.some((rule) => rule.enabled && rule.sourceItemId === sourceId && rule.suggestedItemId === suggestedId);
      if (enabled) continue;
      const sourceItem = menu.find((item) => item.id === sourceId);
      const suggestedItem = menu.find((item) => item.id === suggestedId);
      const sourceName = sourceItem?.name ?? names.get(sourceId) ?? sourceId;
      const suggestedName = suggestedItem?.name ?? names.get(suggestedId) ?? suggestedId;
      found.push({
        id: `pair:${sourceId}:${suggestedId}`,
        sourceItemId: sourceId,
        suggestedItemId: suggestedId,
        sourceName,
        suggestedName,
        withBoth,
        withSource: sourceOrders.size,
        evidence: `In ${withBoth} of ${sourceOrders.size} orders that included ${sourceName}, customers also ordered ${suggestedName} (${pct(withBoth, sourceOrders.size)}).`,
        canApply: Boolean(sourceItem && suggestedItem && isUuid(sourceItem.id) && isUuid(suggestedItem.id)),
      });
    }
  }
  return found.sort((a, b) => b.withBoth / b.withSource - a.withBoth / a.withSource).slice(0, 3);
}

function slowBlock(orders: InsightOrder[]): PromotionRecommendation[] {
  if (orders.length < MIN_HOUR_ORDERS) return [];
  const blocks = Array.from({ length: 12 }, (_, index) => ({ hour: index * 2, orders: 0 }));
  for (const order of orders) {
    const hour = new Date(order.createdAt).getUTCHours();
    const block = blocks[Math.floor(hour / 2)];
    if (block) block.orders += 1;
  }
  const busiest = blocks.reduce((best, block) => (block.orders > best.orders ? block : best), blocks[0]);
  if (!busiest || busiest.orders < MIN_COMPARE) return [];
  const quiet = blocks
    .filter((block) => block.orders > 0 && block.hour !== busiest.hour && block.orders <= busiest.orders * 0.5)
    .sort((a, b) => a.orders - b.orders)[0];
  if (!quiet) return [];
  const end = quiet.hour + 2;
  return [{
    id: `slow:${quiet.hour}`,
    startHourUtc: quiet.hour,
    endHourUtc: end,
    ordersInBlock: quiet.orders,
    busiestOrders: busiest.orders,
    discount: null,
    evidence: `From ${quiet.hour}:00–${end}:00 UTC there were ${quiet.orders} orders. The busiest block, ${busiest.hour}:00–${busiest.hour + 2}:00 UTC, had ${busiest.orders}. No discount was created.`,
  }];
}

function sessionAction(input: Input, windowStart: number, now: number): ActionCard | null {
  const sessions = input.sessions.filter((session) => inRange(session.startedAt, windowStart, now + 1));
  if (sessions.length < MIN_SESSIONS) return null;
  const done = sessions.filter((session) => session.submitted).length;
  if (done / sessions.length >= 0.5) return null;
  return {
    id: "session_completion",
    priority: "medium",
    title: "Most AI sessions did not become orders",
    issue: "A session counts as completed only when it was submitted.",
    evidence: `${done} of ${sessions.length} voice, phone, or drive-thru sessions were submitted (${pct(done, sessions.length)}).`,
    action: "Review the greeting and the ordering lab. No setting is changed automatically.",
    effort: "medium",
    impact: null,
    kind: "operations",
    canApply: false,
    payload: { submitted: done, sessions: sessions.length },
  };
}

function phoneAction(input: Input, windowStart: number, now: number): ActionCard | null {
  const stats = channelStats(input.sessions, "phone", windowStart, now);
  if (!stats || stats.sessions < MIN_SESSIONS) return null;
  return {
    id: "phone_conversion",
    priority: "medium",
    title: "Phone sessions and submitted orders",
    issue: "Conversion here is submitted phone sessions divided by started phone sessions.",
    evidence: `${stats.submitted} of ${stats.sessions} phone sessions were submitted (${pct(stats.submitted, stats.sessions)}).`,
    action: "Listen to the greeting in phone settings if this is lower than you want. It is not changed here.",
    effort: "low",
    impact: null,
    kind: "operations",
    canApply: false,
    payload: { submitted: stats.submitted, sessions: stats.sessions },
  };
}

function channelStats(sessions: InsightSession[], channel: string, windowStart: number, now: number): { sessions: number; submitted: number } | null {
  const rows = sessions.filter((session) => session.channel === channel && inRange(session.startedAt, windowStart, now + 1));
  if (!rows.length) return null;
  return { sessions: rows.length, submitted: rows.filter((session) => session.submitted).length };
}

function retentionSummary(input: Input, counted: InsightOrder[], windowStart: number, now: number): InsightReport["retention"] {
  const phones = new Map<string, number[]>();
  const orderTime = new Map(counted.map((order) => [order.id, new Date(order.createdAt).getTime()]));
  for (const session of input.sessions) {
    const phone = maskPhone(session.customerPhone);
    if (!phone || !session.orderId) continue;
    const time = orderTime.get(session.orderId);
    if (time === undefined) continue;
    const list = phones.get(phone) ?? [];
    list.push(time);
    phones.set(phone, list);
  }
  if (phones.size < MIN_COMPARE) {
    return { available: false, reason: `Repeat rate needs at least ${MIN_COMPARE} phone numbers tied to orders. ${phones.size} qualify. QR orders without a phone are not treated as repeat customers.`, repeatCustomers: 0, customers: phones.size, inactiveAtLeast3: 0 };
  }
  const oldest = Math.min(...[...phones.values()].flat());
  if (now - oldest < BASE_MS) {
    return { available: false, reason: "Phone-linked orders do not cover 30 days yet, so repeat rate is not scored.", repeatCustomers: phones.size ? [...phones.values()].filter((times) => times.length >= 2).length : 0, customers: phones.size, inactiveAtLeast3: 0 };
  }
  let repeatCustomers = 0;
  let inactive = 0;
  for (const times of phones.values()) {
    if (times.length >= 2) repeatCustomers += 1;
    const last = Math.max(...times);
    if (times.length >= 3 && now - last >= INACTIVE_MS) inactive += 1;
  }
  return {
    available: true,
    reason: `${repeatCustomers} of ${phones.size} phone numbers ordered more than once. ${inactive} of those numbers have at least 3 orders and none in the last 45 days. Phone numbers are not shown in full.`,
    repeatCustomers,
    customers: phones.size,
    inactiveAtLeast3: inactive,
  };
}

export function visibleActions(actions: ActionCard[], decisions: Record<string, ActionStatus | undefined>): ActionCard[] {
  return actions.filter((action) => (decisions[action.id] ?? "suggested") !== "rejected");
}

export function compareLocations(locations: { name: string; report: InsightReport }[]): string[] {
  if (locations.length < 2) return ["Add another location before comparing restaurants."];
  const lines: string[] = ["Each figure is that location's own last 30 days. Locations are not ranked."];
  for (const location of locations) {
    const ticket = location.report.averageTicket30Days;
    lines.push(ticket === null
      ? `${location.name}: no non-cancelled orders in the last 30 days.`
      : `${location.name}: average ticket ${money(ticket)} across ${location.report.ordersIn30Days} orders.`);
    if (location.report.phone && location.report.phone.sessions >= MIN_SESSIONS) {
      lines.push(`${location.name}: ${location.report.phone.submitted} of ${location.report.phone.sessions} phone sessions were submitted.`);
    }
  }
  return lines;
}

export function answerQuestion(question: string, report: InsightReport): string {
  const text = question.trim().toLowerCase();
  if (!text) return "Ask about sales, top items, upsells, slow hours, or phone sessions.";
  if (report.ordersIn30Days < MIN_COMPARE && /sale|ticket|revenue|yesterday|top|upsell|slow|hour|focus|week/.test(text) && !/phone/.test(text)) {
    return `I don't have enough data. There are ${report.ordersIn30Days} non-cancelled orders in the last 30 days, and trends start at ${MIN_COMPARE}.`;
  }
  if (/profit|margin|cost|save|roi/.test(text)) {
    return "I don't have food cost, so I can't talk about margin or money saved.";
  }
  if (/view|looked at|clicked/.test(text)) {
    return "I don't have item view counts, so I can't say what people opened but did not order.";
  }
  if (/yesterday|sales down|why were sales|revenue/.test(text)) {
    const ticket = report.yesterday.averageTicket;
    const base = report.health.parts.find((part) => part.key === "sales");
    return `Yesterday had ${report.yesterday.orders} non-cancelled orders totaling ${money(report.yesterday.revenue)}${ticket === null ? "" : `, average ticket ${money(ticket)}`}. ${base?.reason ?? ""}`.trim();
  }
  if (/top|best.?sell/.test(text)) {
    if (!report.topItems.length) return "I don't have enough item lines on recent orders to name a top item.";
    return `Top items by quantity in the last 30 days: ${report.topItems.map((item) => `${item.name} (${item.quantity})`).join(", ")}.`;
  }
  if (/upsell/.test(text)) {
    if (!report.upsells.length) return "No item pair cleared 10 orders and a 30% add-on rate, or that pair is already an upsell rule.";
    return report.upsells.map((row) => row.evidence).join(" ");
  }
  if (/slow|time of day|hour|lunch/.test(text)) {
    if (!report.promotions.length) return `I don't have a slow block to report. That needs at least ${MIN_HOUR_ORDERS} orders and a two-hour UTC block at or below half of the busiest block.`;
    return report.promotions.map((row) => row.evidence).join(" ");
  }
  if (/phone/.test(text)) {
    if (!report.phone || report.phone.sessions < MIN_SESSIONS) {
      return `I don't have enough phone sessions. ${report.phone?.sessions ?? 0} started in the last 30 days, and ${MIN_SESSIONS} are required.`;
    }
    return `${report.phone.submitted} of ${report.phone.sessions} phone sessions were submitted.`;
  }
  if (/focus|this week|attention|health/.test(text)) {
    return report.briefing.join(" ");
  }
  return "I don't have a data-backed answer for that. I can answer sales, top items, upsells, slow hours, phone sessions, and what needs attention.";
}

export type Decision = "approve" | "reject" | "publish";

export type Recommendation = {
  dedupeKey: string;
  kind: "upsell" | "promotion" | "retention" | "menu" | "ordering";
  severity: "high" | "medium" | "low";
  effort: string;
  title: string;
  evidence: string;
  action: string;
  payload: Record<string, string | number | boolean | null>;
};

export type InsightSnapshot = InsightReport & {
  health: InsightReport["health"] & {
    score: number | null;
    summary: string;
    parts: (HealthPart & { id: string; unavailable: string | null; reasons: string[] })[];
  };
  recommendations: Recommendation[];
  menuNotes: string[];
  locationNotes: string[];
  daily: { day: string; orders: number; revenue: number; cancelled: number }[];
};

export type LocationFacts = {
  name: string;
  orders: number;
  averageTicket: number | null;
  phoneStarted: number;
  phoneCompleted: number;
  cancelled: number;
  counted: number;
};

export function nextRecommendationStatus(status: string, decision: Decision, kind: string): ActionStatus | null {
  if (decision === "reject" && status === "suggested") return "rejected";
  if (decision === "approve" && status === "suggested") return "approved";
  if (decision === "publish" && status === "approved" && (kind === "promotion" || kind === "retention")) return "active";
  return null;
}

export function buildInsights(input: {
  now: string;
  orders: {
    id: string;
    createdAt: string;
    total: number;
    status: string;
    source: string;
    paymentStatus: string;
    isTest?: boolean;
    items: { id: string; name: string; quantity: number }[];
  }[];
  sessions: InsightSession[];
  menu: { id: string; name: string; available: boolean; description?: string | null }[];
  upsells: { sourceId: string; suggestedId: string }[];
  upsellEvents?: { offered: number; accepted: number };
  abandonedItems?: { name: string; count: number }[];
  locations?: LocationFacts[];
}): InsightSnapshot {
  const now = new Date(input.now);
  const events: InsightEvent[] = [];
  for (let index = 0; index < (input.upsellEvents?.offered ?? 0); index += 1) {
    events.push({ name: "voice_upsell_offered", createdAt: input.now });
  }
  for (let index = 0; index < (input.upsellEvents?.accepted ?? 0); index += 1) {
    events.push({ name: "voice_upsell_accepted", createdAt: input.now });
  }
  const report = buildReport({
    now,
    orders: input.orders.map((order) => ({
      ...order,
      lines: order.items.map((item) => ({ id: item.id, name: item.name, quantity: item.quantity, category: "" })),
    })),
    sessions: input.sessions,
    menu: input.menu.map((item) => ({
      id: item.id,
      name: item.name,
      category: "",
      available: item.available,
      price: 0,
      description: item.description ?? "",
    })),
    upsells: input.upsells.map((rule) => ({ sourceItemId: rule.sourceId, suggestedItemId: rule.suggestedId, enabled: true })),
    events,
  });
  const recommendations: Recommendation[] = report.actions.map((action) => ({
    dedupeKey: action.id,
    kind: action.kind === "campaign" ? "retention" : action.kind === "operations" ? "ordering" : action.kind,
    severity: action.priority,
    effort: action.effort,
    title: action.title,
    evidence: action.evidence,
    action: action.action,
    payload: action.kind === "upsell"
      ? { sourceId: String(action.payload.sourceItemId ?? ""), suggestedId: String(action.payload.suggestedItemId ?? "") }
      : action.payload,
  }));
  const menuNotes = [
    ...report.gaps,
    report.topItems.length ? `Top items by quantity: ${report.topItems.map((item) => `${item.name} (${item.quantity} in ${item.orders} orders)`).join(", ")}.` : "No item quantities were found on recent orders.",
    ...report.pairs.map((pair) => `${pair.suggestedName} was on ${pair.withBoth} of ${pair.withSource} ${pair.sourceName} orders.`),
    ...(input.abandonedItems ?? []).filter((item) => item.count >= 3).map((item) => `${item.name} was still in ${item.count} unfinished AI sessions.`),
  ];
  const locationNotes = (input.locations ?? []).length < 2 ? [] : [
    "Each figure is that location's own recent orders. Locations are not ranked.",
    ...(input.locations ?? []).map((location) => location.averageTicket === null
      ? `${location.name}: no non-cancelled orders in this window.`
      : `${location.name}: average ticket ${money(location.averageTicket)} across ${location.orders} orders.`),
  ];
  const parts = report.health.parts.map((part) => ({
    ...part,
    id: part.key,
    unavailable: part.score === null ? part.reason : null,
    reasons: [part.reason],
  }));
  return {
    ...report,
    health: {
      ...report.health,
      score: report.health.overall,
      summary: report.health.overall === null
        ? `Not enough comparable orders to score the restaurant. ${parts.find((part) => part.score === null)?.reason ?? ""}`.trim()
        : `Overall ${report.health.overall}. Only sections with enough of this restaurant's own data are included.`,
      parts,
    },
    recommendations,
    menuNotes,
    locationNotes,
    daily: dailyBuckets(input.orders.map((order) => ({
      ...order,
      lines: [],
    })), now).map((day) => ({ day: day.day, orders: day.orders, revenue: day.revenue, cancelled: day.cancelled })),
  };
}

export function dailyBuckets(orders: InsightOrder[], now: Date): { day: string; orders: number; revenue: number; cancelled: number; paymentFailed: number; aiOrders: number }[] {
  const buckets = new Map<string, { day: string; orders: number; revenue: number; cancelled: number; paymentFailed: number; aiOrders: number }>();
  const start = now.getTime() - BASE_MS;
  for (const order of orders) {
    if (order.isTest || new Date(order.createdAt).getTime() < start) continue;
    const day = order.createdAt.slice(0, 10);
    const bucket = buckets.get(day) ?? { day, orders: 0, revenue: 0, cancelled: 0, paymentFailed: 0, aiOrders: 0 };
    if (order.status === "cancelled") bucket.cancelled += 1;
    else {
      bucket.orders += 1;
      bucket.revenue += Number(order.total) || 0;
    }
    if (order.paymentStatus === "failed") bucket.paymentFailed += 1;
    if (order.source === "phone" || order.source === "mobile_voice" || order.source === "voice_qr" || order.source === "drive_thru") bucket.aiOrders += 1;
    buckets.set(day, bucket);
  }
  return [...buckets.values()].sort((a, b) => a.day.localeCompare(b.day));
}

export function dailyMetrics(orders: InsightOrder[], now: Date) {
  return dailyBuckets(orders, now);
}

export type ScorePart = HealthPart;
export type InsightInput = Parameters<typeof buildInsights>[0];
