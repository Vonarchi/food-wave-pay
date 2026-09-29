/**
 * Restaurant ordering engine.
 *
 * The model may only propose item ids and modifier option ids.
 * Prices, availability, taxes, and whether an option exists come from the catalog
 * the caller loaded from the database (or the built-in demo catalog).
 * This module never places an order.
 */

export const ORDER_TAX_RATE = 0.0825;
export const MAX_ITEM_QUANTITY = 50;
export const MAX_ACTIONS = 12;

export type OrderChannel = "mobile_web" | "mobile_voice" | "phone" | "kiosk" | "drive_thru";

export function isOrderChannel(value: unknown): value is OrderChannel {
  return value === "mobile_web" || value === "mobile_voice" || value === "phone" || value === "kiosk" || value === "drive_thru";
}

/** QR voice stays on mobile_web. "mobile" from the test harness maps there too. */
export function normalizeChannel(value: unknown): OrderChannel {
  if (value === "mobile" || value === "mobile_voice") return value === "mobile" ? "mobile_web" : "mobile_voice";
  return isOrderChannel(value) ? value : "mobile_web";
}

export type CatalogModifierOption = { id: string; name: string; price: number };
export type CatalogModifierGroup = {
  id: string;
  name: string;
  required: boolean;
  maxSelections: number;
  options: CatalogModifierOption[];
};
export type CatalogItem = {
  id: string;
  name: string;
  description: string;
  price: number;
  available: boolean;
  category: string;
  modifiers: CatalogModifierGroup[];
};
export type UpsellRule = { sourceItemId: string; suggestedItemId: string };

export type CartSelection = { groupId: string; optionIds: string[] };
export type CartLine = {
  lineId: string;
  itemId: string;
  quantity: number;
  selections: CartSelection[];
  note?: string;
};

export type ProposedModifier = { modifier_group_id: string; option_id: string };

export type ClarificationReason =
  | "unclear_item"
  | "unclear_quantity"
  | "missing_modifier"
  | "ambiguous_item"
  | "unavailable"
  | "unknown_item"
  | "not_offered"
  | "modifier_conflict";

export const HANDOFF_REASONS = [
  "repeated_misunderstanding",
  "upset_customer",
  "allergy",
  "refund",
  "complaint",
  "catering",
  "payment",
  "requested_employee",
] as const;
export type HandoffReason = (typeof HANDOFF_REASONS)[number];

export type RestaurantFacts = {
  name?: string;
  hours?: string | null;
  location?: string | null;
  prepMinutes?: number | null;
};

export type ProposedAction =
  | {
      action: "add_item";
      item_id: string;
      quantity: unknown;
      modifiers?: ProposedModifier[];
      line_id?: string;
    }
  | { action: "remove_item"; line_id?: string; item_id?: string }
  | { action: "update_quantity"; line_id?: string; item_id?: string; quantity: unknown }
  | {
      action: "update_modifier";
      line_id?: string;
      item_id?: string;
      modifiers?: ProposedModifier[];
    }
  | {
      action: "ask_clarification";
      reason: ClarificationReason;
      item_id?: string;
      modifier_group_id?: string;
      candidate_ids?: string[];
    }
  | { action: "answer_menu_question"; item_id: string }
  | { action: "recommend_item"; item_id: string }
  | { action: "show_cart" }
  | { action: "confirm_order" }
  | { action: "cancel_order" }
  | { action: "accept_upsell"; suggested_item_id: string; quantity?: unknown }
  | { action: "reject_upsell" }
  | { action: "submit_order" }
  | { action: "request_handoff"; reason: HandoffReason }
  | { action: "answer_place"; topic: "hours" | "location" | "prep" }
  | { action: "set_pickup_name"; name: string };

export type VoiceEventName =
  | "voice_order_item_added"
  | "voice_clarification_requested"
  | "voice_order_abandoned"
  | "voice_upsell_offered"
  | "voice_upsell_accepted";

export type PricedModifier = {
  groupId: string;
  groupName: string;
  optionId: string;
  optionName: string;
  price: number;
};

export type PricedLine = {
  lineId: string;
  itemId: string;
  name: string;
  description: string;
  category: string;
  quantity: number;
  basePrice: number;
  modifiers: PricedModifier[];
  lineTotal: number;
  note?: string;
};

export type OrderTurnResult = {
  cart: CartLine[];
  lines: PricedLine[];
  subtotal: number;
  tax: number;
  total: number;
  messages: string[];
  say: string;
  clarification: string | null;
  upsell: { itemId: string; name: string; price: number } | null;
  awaitingConfirmation: boolean;
  cancelled: boolean;
  rejected: string[];
  events: VoiceEventName[];
  duplicate: boolean;
  /** The engine never writes an order. A channel may submit only when readyToSubmit is true. */
  submitsOrder: false;
  readyToSubmit: boolean;
  handoff: { reason: HandoffReason; connected: boolean } | null;
  pickupName: string | null;
};

export type OrderTurnInput = {
  channel?: OrderChannel;
  locale?: string;
  catalog: CatalogItem[];
  upsells?: UpsellRule[];
  upsellsEnabled?: boolean;
  taxRate?: number;
  cart: CartLine[];
  proposals: ProposedAction[];
  turnId?: string;
  seenTurnIds?: string[];
  pendingUpsellItemId?: string | null;
  /** 0–1 from the transcriber. Below 0.6, the engine asks again and does not change the cart. */
  transcriptConfidence?: number | null;
  /** Used only to choose a clarification when confidence is low. It is not trusted as an order. */
  utterance?: string;
  facts?: RestaurantFacts;
  /** True only when the restaurant has a real fallback number or staff station. */
  handoffAvailable?: boolean;
  /** A previous turn already received an explicit yes for this cart. */
  alreadyConfirmed?: boolean;
  speakPrices?: boolean;
  confirmStyle?: "tap" | "spoken";
};

type Locale = "en" | "es";

function resolveLocale(code: string | undefined): Locale {
  return (code ?? "").toLowerCase().startsWith("es") ? "es" : "en";
}

function money(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function t(locale: Locale, key: string, vars: Record<string, string> = {}): string {
  const en: Record<string, string> = {
    added: "Added {qty} {name}.",
    unavailable: "{name} isn't available right now.",
    unknown: "That isn't on this menu.",
    needModifier: "What {group} would you like for {item}? Choices: {options}.",
    tooMany: "You can choose up to {max} for {group}.",
    removed: "Removed {name}.",
    quantityUpdated: "Updated {name} to {qty}.",
    modifiersUpdated: "Updated {name}.",
    unclearItem: "What would you like?",
    unclearQuantity: "How many would you like?",
    whichLine: "Which {name} should I change?",
    notOffered: "That change isn't on this menu.",
    recommend: "{name} is on the menu for {price}.",
    menuAnswer: "{name}: {description}",
    menuMods: "Choices for {group}: {options}.",
    upsell: "Would you like to add {name} for {price}?",
    upsellNo: "Okay, I won't add that.",
    empty: "Your order is empty. What can I get started?",
    missingLine: "I couldn't find that item in the order.",
    conflict: "That option isn't available on {name}.",
    cancelled: "I cleared the order.",
    duplicate: "I already applied that.",
    confirmTap: "Tap confirm to send this order.",
    droppedUnknown: "I removed something that isn't on this menu.",
    aiFailure: "I didn't catch that. Please say it again, or browse the menu.",
    emptyUtterance: "I didn't hear an order. What would you like?",
    ambiguous: "Did you want {names}?",
    lowConfidence: "I'm sorry, I didn't catch that clearly. Could you say it again?",
    handoffYes: "I'll connect you with the restaurant.",
    handoffNo: "There isn't a person available to transfer to right now. I can still help with the menu and your order.",
    hoursKnown: "We're open {hours}.",
    hoursUnknown: "I don't have today's hours saved yet.",
    locationKnown: "We're at {location}.",
    locationUnknown: "I don't have the address saved yet.",
    prepKnown: "Most orders are ready in about {minutes} minutes.",
    prepUnknown: "I don't have a prep time saved yet.",
    pickupName: "The name on the order is {name}.",
    spokenConfirm: "Should I send this order to the kitchen?",
  };
  const es: Record<string, string> = {
    added: "Agregué {qty} {name}.",
    unavailable: "{name} no está disponible ahora.",
    unknown: "Eso no está en este menú.",
    needModifier: "¿Qué {group} quieres para {item}? Opciones: {options}.",
    tooMany: "Puedes elegir hasta {max} en {group}.",
    removed: "Quité {name}.",
    quantityUpdated: "Actualicé {name} a {qty}.",
    modifiersUpdated: "Actualicé {name}.",
    unclearItem: "¿Qué te gustaría?",
    unclearQuantity: "¿Cuántos quieres?",
    whichLine: "¿Cuál {name} cambio?",
    notOffered: "Ese cambio no está en este menú.",
    recommend: "{name} está en el menú por {price}.",
    menuAnswer: "{name}: {description}",
    menuMods: "Opciones de {group}: {options}.",
    upsell: "¿Quieres agregar {name} por {price}?",
    upsellNo: "Está bien, no lo agrego.",
    empty: "El pedido está vacío. ¿Qué te preparo?",
    missingLine: "No encontré ese producto en el pedido.",
    conflict: "Esa opción no está en {name}.",
    cancelled: "Limpié el pedido.",
    duplicate: "Eso ya lo apliqué.",
    confirmTap: "Toca confirmar para enviar el pedido.",
    droppedUnknown: "Quité algo que no está en este menú.",
    aiFailure: "No entendí. Repítelo o revisa el menú.",
    emptyUtterance: "No escuché el pedido. ¿Qué te gustaría?",
    ambiguous: "¿Querías {names}?",
    lowConfidence: "Perdón, no escuché bien. ¿Puedes repetirlo?",
    handoffYes: "Te comunico con el restaurante.",
    handoffNo: "Ahora no hay una persona para transferir la llamada. Puedo ayudarte con el menú y el pedido.",
    hoursKnown: "Abrimos {hours}.",
    hoursUnknown: "Todavía no tengo el horario guardado.",
    locationKnown: "Estamos en {location}.",
    locationUnknown: "Todavía no tengo la dirección guardada.",
    prepKnown: "La mayoría de los pedidos están listos en unos {minutes} minutos.",
    prepUnknown: "Todavía no tengo un tiempo de preparación guardado.",
    pickupName: "El nombre del pedido es {name}.",
    spokenConfirm: "¿Envío este pedido a la cocina?",
  };
  const table = locale === "es" ? es : en;
  return (table[key] ?? en[key] ?? key).replace(/\{(\w+)\}/g, (_, name: string) => vars[name] ?? "");
}

export function renderGreeting(template: string | null | undefined, restaurantName: string): string {
  const fallback = "Welcome to {{restaurant_name}}. What can I get started for you?";
  const source = template && template.trim() ? template.trim().slice(0, 240) : fallback;
  const name = restaurantName.trim().slice(0, 80) || "our restaurant";
  return source.split("{{restaurant_name}}").join(name);
}

function findItem(catalog: CatalogItem[], id: string | undefined): CatalogItem | undefined {
  if (!id) return undefined;
  return catalog.find((item) => item.id === id);
}

function cleanLineId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(trimmed)) return undefined;
  return trimmed;
}

function parseModifierList(value: unknown): ProposedModifier[] {
  if (!Array.isArray(value)) return [];
  const mods: ProposedModifier[] = [];
  for (const entry of value.slice(0, 20)) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    if (typeof row.modifier_group_id !== "string" || typeof row.option_id !== "string") continue;
    mods.push({
      modifier_group_id: row.modifier_group_id.slice(0, 80),
      option_id: row.option_id.slice(0, 80),
    });
  }
  return mods;
}

const CLARIFICATION_REASONS = new Set<ClarificationReason>([
  "unclear_item",
  "unclear_quantity",
  "missing_modifier",
  "ambiguous_item",
  "unavailable",
  "unknown_item",
  "not_offered",
  "modifier_conflict",
]);

function lineRef(row: Record<string, unknown>): string | undefined {
  return cleanLineId(row.line_id) ?? cleanLineId(row.cart_item_id);
}

function parseOne(raw: unknown): ProposedAction | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const action = row.action;
  if (action === "add_item" && typeof row.item_id === "string" && row.item_id.trim()) {
    return {
      action: "add_item",
      item_id: row.item_id.trim().slice(0, 80),
      quantity: row.quantity,
      modifiers: parseModifierList(row.modifiers),
      line_id: lineRef(row),
    };
  }
  if (action === "remove_item") {
    return { action: "remove_item", line_id: lineRef(row), item_id: stringId(row.item_id) };
  }
  if (action === "update_quantity") {
    return {
      action: "update_quantity",
      line_id: lineRef(row),
      item_id: stringId(row.item_id),
      quantity: row.quantity,
    };
  }
  if (action === "update_modifier") {
    const modifiers = parseModifierList(row.modifiers);
    if (
      modifiers.length === 0
      && typeof row.modifier_group_id === "string"
      && typeof row.option_id === "string"
    ) {
      modifiers.push({
        modifier_group_id: row.modifier_group_id.slice(0, 80),
        option_id: row.option_id.slice(0, 80),
      });
    }
    return {
      action: "update_modifier",
      line_id: lineRef(row),
      item_id: stringId(row.item_id),
      modifiers,
    };
  }
  if (action === "ask_clarification") {
    const reason = CLARIFICATION_REASONS.has(row.reason as ClarificationReason)
      ? (row.reason as ClarificationReason)
      : "unclear_item";
    const candidate_ids = Array.isArray(row.candidate_ids)
      ? row.candidate_ids.filter((id): id is string => typeof id === "string").slice(0, 6).map((id) => id.slice(0, 80))
      : undefined;
    return {
      action: "ask_clarification",
      reason,
      item_id: stringId(row.item_id),
      modifier_group_id: typeof row.modifier_group_id === "string" ? row.modifier_group_id.slice(0, 80) : undefined,
      candidate_ids,
    };
  }
  if (action === "answer_menu_question" && typeof row.item_id === "string") {
    return { action: "answer_menu_question", item_id: row.item_id.trim().slice(0, 80) };
  }
  if (action === "recommend_item" && typeof row.item_id === "string") {
    return { action: "recommend_item", item_id: row.item_id.trim().slice(0, 80) };
  }
  if (action === "show_cart") return { action: "show_cart" };
  if (action === "confirm_order") return { action: "confirm_order" };
  if (action === "cancel_order") return { action: "cancel_order" };
  if (action === "accept_upsell" && typeof row.suggested_item_id === "string") {
    return { action: "accept_upsell", suggested_item_id: row.suggested_item_id.trim().slice(0, 80), quantity: row.quantity };
  }
  if (action === "reject_upsell") return { action: "reject_upsell" };
  if (action === "submit_order") return { action: "submit_order" };
  if (action === "request_handoff" && HANDOFF_REASONS.includes(row.reason as HandoffReason)) {
    return { action: "request_handoff", reason: row.reason as HandoffReason };
  }
  if (action === "answer_place" && (row.topic === "hours" || row.topic === "location" || row.topic === "prep")) {
    return { action: "answer_place", topic: row.topic };
  }
  if (action === "set_pickup_name" && typeof row.name === "string") {
    const name = row.name.replace(/[\r\n]/g, " ").trim().slice(0, 80);
    if (name) return { action: "set_pickup_name", name };
  }
  return null;
}

function stringId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 80) : undefined;
}

/** Drops prices, free-form answers, and unknown actions. Item names from the model are ignored. */
export function parseModelActions(payload: unknown): ProposedAction[] {
  const list = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && Array.isArray((payload as { actions?: unknown }).actions)
      ? (payload as { actions: unknown[] }).actions
      : null;
  if (!list) return [];
  const actions: ProposedAction[] = [];
  for (const entry of list.slice(0, MAX_ACTIONS)) {
    const parsed = parseOne(entry);
    if (parsed) actions.push(parsed);
  }
  return actions;
}

export function catalogItemFromRow(row: {
  id?: string;
  name?: string;
  description?: string | null;
  price?: number | string | null;
  category?: string | null;
  is_available?: boolean | null;
  available?: boolean | null;
  modifiers?: unknown;
}): CatalogItem | null {
  const price = Number(row.price);
  if (!row.id || !row.name || !Number.isFinite(price)) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    price,
    available: Boolean(row.is_available ?? row.available),
    category: row.category || "Menu",
    modifiers: modifiersFromUnknown(row.modifiers),
  };
}

function modifiersFromUnknown(raw: unknown): CatalogModifierGroup[] {
  if (!Array.isArray(raw)) return [];
  const groups: CatalogModifierGroup[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const group = entry as Record<string, unknown>;
    const id = typeof group.id === "string" ? group.id : "";
    const name = typeof group.name === "string" ? group.name : "";
    if (!id || !name) continue;
    const optionsRaw = Array.isArray(group.options) ? group.options : [];
    const options: CatalogModifierOption[] = [];
    for (const optionEntry of optionsRaw) {
      if (!optionEntry || typeof optionEntry !== "object") continue;
      const option = optionEntry as Record<string, unknown>;
      const optionId = typeof option.id === "string" ? option.id : "";
      const optionName = typeof option.name === "string" ? option.name : "";
      const optionPrice = Number(option.price ?? option.price_delta ?? 0);
      if (!optionId || !optionName || !Number.isFinite(optionPrice)) continue;
      options.push({ id: optionId, name: optionName, price: optionPrice });
    }
    const maxRaw = Number(group.maxSelections ?? group.max_selections ?? 1);
    groups.push({
      id,
      name,
      required: Boolean(group.required),
      maxSelections: Number.isFinite(maxRaw) && maxRaw > 0 ? Math.floor(maxRaw) : 1,
      options,
    });
  }
  return groups;
}

export function priceCart(cart: CartLine[], catalog: CatalogItem[], taxRate = ORDER_TAX_RATE): {
  cart: CartLine[];
  lines: PricedLine[];
  subtotal: number;
  tax: number;
  total: number;
} {
  const lines: PricedLine[] = [];
  const kept: CartLine[] = [];
  for (const line of cart) {
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > MAX_ITEM_QUANTITY) continue;
    const item = findItem(catalog, line.itemId);
    if (!item || !item.available) continue;
    const mods: PricedModifier[] = [];
    const selections: CartSelection[] = [];
    let overflow = false;
    for (const selection of line.selections) {
      const group = item.modifiers.find((entry) => entry.id === selection.groupId);
      if (!group) continue;
      const optionIds: string[] = [];
      for (const optionId of selection.optionIds) {
        const option = group.options.find((entry) => entry.id === optionId);
        if (!option || optionIds.includes(option.id)) continue;
        if (optionIds.length >= group.maxSelections) {
          overflow = true;
          break;
        }
        optionIds.push(option.id);
        mods.push({
          groupId: group.id,
          groupName: group.name,
          optionId: option.id,
          optionName: option.name,
          price: option.price,
        });
      }
      if (overflow) break;
      if (optionIds.length) selections.push({ groupId: group.id, optionIds });
    }
    if (overflow) continue;
    const missingRequired = item.modifiers.some(
      (group) => group.required && !selections.some((selection) => selection.groupId === group.id),
    );
    if (missingRequired) continue;
    const extra = mods.reduce((sum, mod) => sum + mod.price, 0);
    const lineTotal = (item.price + extra) * line.quantity;
    kept.push({
      lineId: line.lineId,
      itemId: item.id,
      quantity: line.quantity,
      selections,
      note: line.note,
    });
    lines.push({
      lineId: line.lineId,
      itemId: item.id,
      name: item.name,
      description: item.description,
      category: item.category,
      quantity: line.quantity,
      basePrice: item.price,
      modifiers: mods,
      lineTotal,
      note: line.note,
    });
  }
  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  const tax = subtotal * taxRate;
  const total = subtotal + tax;
  return { cart: kept, lines, subtotal, tax, total };
}

function readQuantity(value: unknown): number | "missing" | "invalid" {
  if (value === undefined || value === null || value === "") return "missing";
  const numeric = typeof value === "number"
    ? value
    : typeof value === "string" && /^\d+$/.test(value.trim())
      ? Number(value.trim())
      : Number.NaN;
  if (!Number.isInteger(numeric) || numeric < 1 || numeric > MAX_ITEM_QUANTITY) return "invalid";
  return numeric;
}

type SelectionResult =
  | { ok: true; selections: CartSelection[] }
  | { ok: false; reason: "conflict" | "too_many" | "missing"; group?: CatalogModifierGroup };

function selectionsFor(item: CatalogItem, raw: ProposedModifier[] | undefined): SelectionResult {
  const byGroup = new Map<string, string[]>();
  for (const mod of raw ?? []) {
    const group = item.modifiers.find((entry) => entry.id === mod.modifier_group_id);
    if (!group) return { ok: false, reason: "conflict" };
    const option = group.options.find((entry) => entry.id === mod.option_id);
    if (!option) return { ok: false, reason: "conflict" };
    const picked = byGroup.get(group.id) ?? [];
    if (!picked.includes(option.id)) picked.push(option.id);
    byGroup.set(group.id, picked);
  }
  for (const group of item.modifiers) {
    const picked = byGroup.get(group.id) ?? [];
    if (picked.length > group.maxSelections) return { ok: false, reason: "too_many", group };
    if (group.required && picked.length < 1) return { ok: false, reason: "missing", group };
  }
  const selections: CartSelection[] = [];
  for (const group of item.modifiers) {
    const optionIds = byGroup.get(group.id) ?? [];
    if (optionIds.length) selections.push({ groupId: group.id, optionIds });
  }
  return { ok: true, selections };
}

function nextLineId(cart: CartLine[]): string {
  let n = cart.length + 1;
  let id = `line-${n}`;
  while (cart.some((line) => line.lineId === id)) {
    n += 1;
    id = `line-${n}`;
  }
  return id;
}

function resolveLine(
  cart: CartLine[],
  lineId: string | undefined,
  itemId: string | undefined,
): { line?: CartLine; ambiguousName?: string; missing: boolean } {
  if (lineId) {
    const line = cart.find((entry) => entry.lineId === lineId);
    return line ? { line, missing: false } : { missing: true };
  }
  if (!itemId) return { missing: true };
  const matches = cart.filter((entry) => entry.itemId === itemId);
  if (matches.length === 1) return { line: matches[0], missing: false };
  if (matches.length > 1) {
    return { missing: false, ambiguousName: matches[0] ? itemId : itemId };
  }
  return { missing: true };
}

function finish(
  locale: Locale,
  catalog: CatalogItem[],
  taxRate: number,
  cart: CartLine[],
  messages: string[],
  clarification: string | null,
  upsell: OrderTurnResult["upsell"],
  awaitingConfirmation: boolean,
  cancelled: boolean,
  rejected: string[],
  events: VoiceEventName[],
  duplicate: boolean,
  wantsConfirm: boolean,
  extras?: {
    readyToSubmit?: boolean;
    handoff?: OrderTurnResult["handoff"];
    pickupName?: string | null;
    speakPrices?: boolean;
    confirmStyle?: "tap" | "spoken";
  },
): OrderTurnResult {
  const priced = priceCart(cart, catalog, taxRate);
  const speakPrices = extras?.speakPrices !== false;
  let readyToSubmit = false;
  if (wantsConfirm && !cancelled) {
    if (priced.lines.length === 0) {
      messages.push(t(locale, "empty"));
    } else {
      const detail = priced.lines
        .map((line) => {
          const mods = line.modifiers.map((mod) => mod.optionName).join(", ");
          const modText = mods ? ` (${mods})` : "";
          return speakPrices
            ? `${line.quantity} ${line.name}${modText} ${money(line.lineTotal)}`
            : `${line.quantity} ${line.name}${modText}`;
        })
        .join(". ");
      const moneyLine = speakPrices
        ? ` Subtotal ${money(priced.subtotal)}. Tax ${money(priced.tax)}. Total ${money(priced.total)}.`
        : "";
      const prompt = extras?.confirmStyle === "spoken" ? t(locale, "spokenConfirm") : t(locale, "confirmTap");
      messages.push(`${detail}.${moneyLine} ${prompt}`);
      awaitingConfirmation = true;
    }
  }
  if (extras?.readyToSubmit && !cancelled && priced.lines.length > 0) {
    readyToSubmit = true;
    messages.push(locale === "es" ? "Enviando el pedido a la cocina." : "Sending this order to the kitchen.");
  }
  const say = messages.filter(Boolean).join(" ");
  return {
    cart: priced.cart,
    lines: priced.lines,
    subtotal: priced.subtotal,
    tax: priced.tax,
    total: priced.total,
    messages,
    say,
    clarification,
    upsell,
    awaitingConfirmation,
    cancelled,
    rejected,
    events,
    duplicate,
    submitsOrder: false,
    readyToSubmit,
    handoff: extras?.handoff ?? null,
    pickupName: extras?.pickupName ?? null,
  };
}

function blankResult(
  locale: Locale,
  catalog: CatalogItem[],
  taxRate: number,
  cart: CartLine[],
  message: string,
): OrderTurnResult {
  return finish(locale, catalog, taxRate, cart, [message], message, null, false, false, [], [], false, false);
}

export function aiFailureTurn(input: Pick<OrderTurnInput, "catalog" | "cart" | "locale" | "taxRate">): OrderTurnResult {
  const locale = resolveLocale(input.locale);
  return blankResult(locale, input.catalog, input.taxRate ?? ORDER_TAX_RATE, input.cart, t(locale, "aiFailure"));
}

export function emptyUtteranceTurn(input: Pick<OrderTurnInput, "catalog" | "cart" | "locale" | "taxRate">): OrderTurnResult {
  const locale = resolveLocale(input.locale);
  return blankResult(locale, input.catalog, input.taxRate ?? ORDER_TAX_RATE, input.cart, t(locale, "emptyUtterance"));
}

export function applyOrderTurn(input: OrderTurnInput): OrderTurnResult {
  const locale = resolveLocale(input.locale);
  const catalog = input.catalog;
  const taxRate = input.taxRate ?? ORDER_TAX_RATE;
  const upsells = input.upsellsEnabled === false ? [] : input.upsells ?? [];
  const messages: string[] = [];
  const rejected: string[] = [];
  const events: VoiceEventName[] = [];
  let clarification: string | null = null;
  let asked = false;

  const ask = (text: string, reason: string) => {
    if (!clarification) clarification = text;
    messages.push(text);
    rejected.push(reason);
    if (!asked) {
      events.push("voice_clarification_requested");
      asked = true;
    }
  };

  if (input.turnId && input.seenTurnIds?.includes(input.turnId)) {
    const priced = priceCart(input.cart, catalog, taxRate);
    return {
      ...priced,
      messages: [t(locale, "duplicate")],
      say: t(locale, "duplicate"),
      clarification: null,
      upsell: null,
      awaitingConfirmation: false,
      cancelled: false,
      rejected: ["duplicate_turn"],
      events: [],
      duplicate: true,
      submitsOrder: false,
      readyToSubmit: false,
      handoff: null,
      pickupName: null,
    };
  }

  if (typeof input.transcriptConfidence === "number" && input.transcriptConfidence < 0.6) {
    const said = input.utterance ?? "";
    const question = /\bmild\b/i.test(said) && /\bhot\b/i.test(said)
      ? (locale === "es" ? "Perdón, ¿dijiste suave o picante?" : "I'm sorry, did you say mild or hot?")
      : t(locale, "lowConfidence");
    return blankResult(locale, catalog, taxRate, input.cart, question);
  }

  let cart = priceCart(input.cart, catalog, taxRate).cart;
  const pricedBefore = new Set(cart.map((line) => line.lineId));
  if (input.cart.length > 0 && cart.length < input.cart.length) {
    const removed = input.cart.filter((line) => !pricedBefore.has(line.lineId));
    let named = false;
    for (const line of removed) {
      const item = findItem(catalog, line.itemId);
      if (item && !item.available) {
        ask(t(locale, "unavailable", { name: item.name }), "unavailable_in_cart");
        named = true;
      }
    }
    if (!named) messages.push(t(locale, "droppedUnknown"));
  }

  let wantsConfirm = false;
  let wantsSubmit = false;
  let cancelled = false;
  let handoff: OrderTurnResult["handoff"] = null;
  let pickupName: string | null = null;
  let declinedUpsell = false;
  const addedItemIds: string[] = [];

  const describeMissing = (item: CatalogItem, group: CatalogModifierGroup) => {
    const options = group.options.map((option) => option.name).join(", ");
    ask(t(locale, "needModifier", { group: group.name, item: item.name, options }), "missing_modifier");
  };

  const addItem = (itemId: string, quantity: unknown, modifiers: ProposedModifier[] | undefined, requestedLineId?: string) => {
    const item = findItem(catalog, itemId);
    if (!item) {
      ask(t(locale, "unknown"), "unknown_item");
      return;
    }
    if (!item.available) {
      ask(t(locale, "unavailable", { name: item.name }), "unavailable");
      return;
    }
    const qty = readQuantity(quantity);
    if (qty === "missing" || qty === "invalid") {
      ask(t(locale, "unclearQuantity"), "unclear_quantity");
      return;
    }
    const selected = selectionsFor(item, modifiers);
    if ("reason" in selected) {
      if (selected.reason === "missing" && selected.group) describeMissing(item, selected.group);
      else if (selected.reason === "too_many" && selected.group) {
        ask(t(locale, "tooMany", { max: String(selected.group.maxSelections), group: selected.group.name }), "too_many");
      } else ask(t(locale, "conflict", { name: item.name }), "modifier_conflict");
      return;
    }
    const lineId = requestedLineId && !cart.some((line) => line.lineId === requestedLineId)
      ? requestedLineId
      : nextLineId(cart);
    cart = [...cart, { lineId, itemId: item.id, quantity: qty, selections: selected.selections }];
    addedItemIds.push(item.id);
    messages.push(t(locale, "added", { qty: String(qty), name: item.name }));
    events.push("voice_order_item_added");
  };

  for (const proposal of input.proposals.slice(0, MAX_ACTIONS)) {
    if (proposal.action === "add_item") {
      addItem(proposal.item_id, proposal.quantity, proposal.modifiers, proposal.line_id);
      continue;
    }
    if (proposal.action === "accept_upsell") {
      const allowed = upsells.some(
        (rule) =>
          rule.suggestedItemId === proposal.suggested_item_id &&
          cart.some((line) => line.itemId === rule.sourceItemId) &&
          (!input.pendingUpsellItemId || input.pendingUpsellItemId === proposal.suggested_item_id),
      );
      if (!allowed) {
        ask(t(locale, "notOffered"), "rejected_upsell");
        continue;
      }
      const before = addedItemIds.length;
      addItem(proposal.suggested_item_id, proposal.quantity ?? 1, [], undefined);
      if (addedItemIds.length > before) events.push("voice_upsell_accepted");
      continue;
    }
    if (proposal.action === "reject_upsell") {
      declinedUpsell = true;
      messages.push(t(locale, "upsellNo"));
      continue;
    }
    if (proposal.action === "remove_item" || proposal.action === "update_quantity" || proposal.action === "update_modifier") {
      const resolved = resolveLine(cart, proposal.line_id, proposal.item_id);
      if (!resolved.line && resolved.ambiguousName) {
        const item = findItem(catalog, proposal.item_id);
        ask(t(locale, "whichLine", { name: item?.name ?? "item" }), "ambiguous_line");
        continue;
      }
      if (!resolved.line) {
        ask(t(locale, "missingLine"), "missing_line");
        continue;
      }
      const item = findItem(catalog, resolved.line.itemId);
      if (proposal.action === "remove_item") {
        cart = cart.filter((line) => line.lineId !== resolved.line!.lineId);
        messages.push(t(locale, "removed", { name: item?.name ?? "item" }));
        continue;
      }
      if (proposal.action === "update_quantity") {
        const qty = readQuantity(proposal.quantity);
        if (qty === "missing" || qty === "invalid") {
          ask(t(locale, "unclearQuantity"), "unclear_quantity");
          continue;
        }
        cart = cart.map((line) => (line.lineId === resolved.line!.lineId ? { ...line, quantity: qty } : line));
        messages.push(t(locale, "quantityUpdated", { name: item?.name ?? "item", qty: String(qty) }));
        continue;
      }
      if (!item) {
        ask(t(locale, "unknown"), "unknown_item");
        continue;
      }
      const selected = selectionsFor(item, proposal.modifiers);
      if ("reason" in selected) {
        if (selected.reason === "missing" && selected.group) describeMissing(item, selected.group);
        else if (selected.reason === "too_many" && selected.group) {
          ask(t(locale, "tooMany", { max: String(selected.group.maxSelections), group: selected.group.name }), "too_many");
        } else ask(t(locale, "conflict", { name: item.name }), "modifier_conflict");
        continue;
      }
      cart = cart.map((line) =>
        line.lineId === resolved.line!.lineId ? { ...line, selections: selected.selections } : line,
      );
      messages.push(t(locale, "modifiersUpdated", { name: item.name }));
      continue;
    }
    if (proposal.action === "ask_clarification") {
      if (proposal.reason === "ambiguous_item") {
        const names = (proposal.candidate_ids ?? [])
          .map((id) => findItem(catalog, id))
          .filter((item): item is CatalogItem => Boolean(item && item.available))
          .map((item) => item.name)
          .slice(0, 4);
        ask(names.length >= 2 ? t(locale, "ambiguous", { names: names.join(", ") }) : t(locale, "unclearItem"), "ambiguous_item");
        continue;
      }
      if (proposal.reason === "missing_modifier") {
        const item = findItem(catalog, proposal.item_id);
        const group = item?.modifiers.find((entry) => entry.id === proposal.modifier_group_id);
        if (item && group) describeMissing(item, group);
        else ask(t(locale, "unclearItem"), "unclear_item");
        continue;
      }
      if (proposal.reason === "unavailable") {
        const item = findItem(catalog, proposal.item_id);
        ask(item ? t(locale, "unavailable", { name: item.name }) : t(locale, "unknown"), "unavailable");
        continue;
      }
      if (proposal.reason === "unknown_item") {
        ask(t(locale, "unknown"), "unknown_item");
        continue;
      }
      if (proposal.reason === "not_offered" || proposal.reason === "modifier_conflict") {
        ask(t(locale, "notOffered"), proposal.reason);
        continue;
      }
      if (proposal.reason === "unclear_quantity") {
        ask(t(locale, "unclearQuantity"), "unclear_quantity");
        continue;
      }
      ask(t(locale, "unclearItem"), "unclear_item");
      continue;
    }
    if (proposal.action === "answer_menu_question") {
      const item = findItem(catalog, proposal.item_id);
      if (!item) {
        ask(t(locale, "unknown"), "unknown_item");
        continue;
      }
      const description = item.description.trim() || item.name;
      const modText = item.modifiers
        .map((group) => t(locale, "menuMods", { group: group.name, options: group.options.map((option) => option.name).join(", ") }))
        .join(" ");
      messages.push(`${t(locale, "menuAnswer", { name: item.name, description })}${modText ? ` ${modText}` : ""}`);
      continue;
    }
    if (proposal.action === "recommend_item") {
      const item = findItem(catalog, proposal.item_id);
      if (!item || !item.available) {
        ask(item ? t(locale, "unavailable", { name: item.name }) : t(locale, "unknown"), "recommend");
        continue;
      }
      messages.push(t(locale, "recommend", { name: item.name, price: money(item.price) }));
      continue;
    }
    if (proposal.action === "show_cart") {
      wantsConfirm = false;
      const snap = priceCart(cart, catalog, taxRate);
      if (snap.lines.length === 0) messages.push(t(locale, "empty"));
      else {
        const detail = snap.lines.map((line) => `${line.quantity} ${line.name} ${money(line.lineTotal)}`).join(". ");
        messages.push(`${detail}. Subtotal ${money(snap.subtotal)}.`);
      }
      continue;
    }
    if (proposal.action === "confirm_order") {
      wantsConfirm = true;
      continue;
    }
    if (proposal.action === "submit_order") {
      wantsSubmit = true;
      continue;
    }
    if (proposal.action === "request_handoff") {
      const connected = input.handoffAvailable === true;
      handoff = { reason: proposal.reason, connected };
      messages.push(t(locale, connected ? "handoffYes" : "handoffNo"));
      continue;
    }
    if (proposal.action === "answer_place") {
      const facts = input.facts ?? {};
      if (proposal.topic === "hours") {
        messages.push(facts.hours ? t(locale, "hoursKnown", { hours: facts.hours }) : t(locale, "hoursUnknown"));
      } else if (proposal.topic === "location") {
        messages.push(facts.location ? t(locale, "locationKnown", { location: facts.location }) : t(locale, "locationUnknown"));
      } else {
        messages.push(
          typeof facts.prepMinutes === "number"
            ? t(locale, "prepKnown", { minutes: String(facts.prepMinutes) })
            : t(locale, "prepUnknown"),
        );
      }
      continue;
    }
    if (proposal.action === "set_pickup_name") {
      pickupName = proposal.name;
      messages.push(t(locale, "pickupName", { name: proposal.name }));
      continue;
    }
    if (proposal.action === "cancel_order") {
      cart = [];
      addedItemIds.length = 0;
      wantsConfirm = false;
      cancelled = true;
      messages.push(t(locale, "cancelled"));
      events.push("voice_order_abandoned");
    }
  }

  let upsell: OrderTurnResult["upsell"] = null;
  if (!declinedUpsell && !clarification && !wantsConfirm && !cancelled && addedItemIds.length) {
    for (const sourceId of addedItemIds) {
      const rule = upsells.find((entry) => entry.sourceItemId === sourceId);
      if (!rule) continue;
      if (cart.some((line) => line.itemId === rule.suggestedItemId)) continue;
      const suggested = findItem(catalog, rule.suggestedItemId);
      if (!suggested || !suggested.available) continue;
      upsell = { itemId: suggested.id, name: suggested.name, price: suggested.price };
      messages.push(t(locale, "upsell", { name: suggested.name, price: money(suggested.price) }));
      events.push("voice_upsell_offered");
      break;
    }
  }

  const explicitYes = input.alreadyConfirmed === true;
  if (wantsSubmit && !explicitYes) wantsConfirm = true;
  return finish(
    locale,
    catalog,
    taxRate,
    cart,
    messages,
    clarification,
    upsell,
    false,
    cancelled,
    rejected,
    events,
    false,
    wantsConfirm && !cancelled && !(wantsSubmit && explicitYes),
    {
      readyToSubmit: wantsSubmit && explicitYes && !cancelled,
      handoff,
      pickupName,
      speakPrices: input.speakPrices,
      confirmStyle: input.confirmStyle,
    },
  );
}
