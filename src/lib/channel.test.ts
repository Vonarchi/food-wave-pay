import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  channelAnalytics,
  decidePayment,
  handoffReasonFor,
  parseProviderWebhook,
  prepareChannelTurn,
  sameRestaurant,
  validSlug,
} from "../../supabase/functions/_shared/channelPolicy.ts";
import {
  applyOrderTurn,
  parseModelActions,
  type CartLine,
  type CatalogItem,
  type ProposedAction,
} from "../../supabase/functions/_shared/orderingEngine.ts";

const catalog: CatalogItem[] = [
  {
    id: "wings",
    name: "Wings",
    description: "Bone-in",
    price: 12,
    available: true,
    category: "Mains",
    modifiers: [
      {
        id: "flavor",
        name: "Flavor",
        required: true,
        maxSelections: 2,
        options: [
          { id: "lemon", name: "Lemon pepper", price: 0 },
          { id: "hot", name: "Hot", price: 0 },
        ],
      },
    ],
  },
  {
    id: "fries",
    name: "Fries",
    description: "Salted",
    price: 4,
    available: true,
    category: "Sides",
    modifiers: [
      {
        id: "size",
        name: "Size",
        required: true,
        maxSelections: 1,
        options: [
          { id: "reg", name: "Regular", price: 0 },
          { id: "lg", name: "Large", price: 1.5 },
        ],
      },
    ],
  },
  {
    id: "salad",
    name: "Side Salad",
    description: "Greens",
    price: 4,
    available: false,
    category: "Sides",
    modifiers: [],
  },
];

function turn(proposals: ProposedAction[], cart: CartLine[] = [], extra: Record<string, unknown> = {}) {
  return applyOrderTurn({
    channel: "phone",
    locale: "en",
    catalog,
    cart,
    proposals,
    confirmStyle: "spoken",
    ...extra,
  });
}

describe("phone channel", () => {
  it("places an order only after an explicit yes", () => {
    const asked = turn([
      {
        action: "add_item",
        item_id: "wings",
        quantity: 12,
        modifiers: [
          { modifier_group_id: "flavor", option_id: "lemon" },
          { modifier_group_id: "flavor", option_id: "hot" },
        ],
      },
      {
        action: "add_item",
        item_id: "fries",
        quantity: 1,
        modifiers: [{ modifier_group_id: "size", option_id: "lg" }],
      },
    ]);
    assert.equal(asked.readyToSubmit, false);
    assert.equal(asked.submitsOrder, false);
    assert.equal(asked.lines.length, 2);
    assert.ok(asked.say.includes("Should I send this order") === false);

    const preview = turn([{ action: "confirm_order" }], asked.cart);
    assert.match(preview.say, /Total \$/);
    assert.match(preview.say, /kitchen/);
    assert.equal(preview.readyToSubmit, false);

    const early = turn([{ action: "submit_order" }], asked.cart);
    assert.equal(early.readyToSubmit, false);
    assert.equal(early.awaitingConfirmation, true);

    const sent = turn([{ action: "submit_order" }], asked.cart, { alreadyConfirmed: true });
    assert.equal(sent.readyToSubmit, true);
    assert.equal(sent.submitsOrder, false);
    assert.equal(sent.total, asked.total);
  });

  it("modifies a line with cart_item_id", () => {
    const added = turn([{ action: "add_item", item_id: "fries", quantity: 1, modifiers: [{ modifier_group_id: "size", option_id: "reg" }] }]);
    const parsed = parseModelActions({
      actions: [{ action: "update_modifier", cart_item_id: added.cart[0].lineId, modifier_group_id: "size", option_id: "lg" }],
    });
    const updated = turn(parsed, added.cart);
    assert.equal(updated.lines[0].modifiers[0].optionId, "lg");
    assert.equal(updated.lines[0].lineTotal, 5.5);
  });

  it("answers hours from saved facts", () => {
    const result = turn([{ action: "answer_place", topic: "hours" }], [], { facts: { hours: "11am to 9pm" } });
    assert.match(result.say, /11am to 9pm/);
    assert.equal(result.lines.length, 0);
  });

  it("does not add an unavailable item", () => {
    const result = turn([{ action: "add_item", item_id: "salad", quantity: 1 }]);
    assert.equal(result.lines.length, 0);
    assert.match(result.say, /Side Salad/);
  });

  it("asks to transfer after repeated misunderstanding", () => {
    const prepared = prepareChannelTurn({
      channel: "phone",
      utterance: "what?",
      awaitingConfirmation: false,
      misunderstandingCount: 2,
    });
    assert.equal(prepared.handoffReason, "repeated_misunderstanding");
    const result = turn(prepared.proposals ?? [], [], { handoffAvailable: false });
    assert.match(result.say, /isn't a person available/i);
    assert.equal(result.handoff?.connected, false);
  });

  it("connects a handoff only when a destination exists", () => {
    const reason = handoffReasonFor("Can I speak to a manager?", 0);
    assert.equal(reason, "requested_employee");
    const open = turn([{ action: "request_handoff", reason: "requested_employee" }], [], { handoffAvailable: true });
    assert.equal(open.handoff?.connected, true);
    assert.match(open.say, /connect you/i);
  });

  it("treats goodbye as a hangup", () => {
    const prepared = prepareChannelTurn({
      channel: "phone",
      utterance: "Never mind, goodbye",
      awaitingConfirmation: false,
      misunderstandingCount: 0,
    });
    assert.equal(prepared.hangup, true);
  });

  it("prefers pay at pickup and never invents a card charge", () => {
    const pickup = decidePayment({ payAtPickup: true, paymentLinkEnabled: true });
    assert.equal(pickup.ok && pickup.mode, "pay_at_pickup");
    const link = decidePayment({ payAtPickup: false, paymentLinkEnabled: true });
    assert.equal(link.ok && link.paymentStatus, "link_pending");
    const blocked = decidePayment({ payAtPickup: false, paymentLinkEnabled: false });
    assert.equal(blocked.ok, false);
  });

  it("does not submit a second time for the same turn", () => {
    const cart = turn([{ action: "add_item", item_id: "fries", quantity: 1, modifiers: [{ modifier_group_id: "size", option_id: "reg" }] }]).cart;
    const first = turn([{ action: "submit_order" }], cart, { alreadyConfirmed: true, turnId: "11111111-1111-1111-1111-111111111111", seenTurnIds: [] });
    const second = turn([{ action: "submit_order" }], cart, {
      alreadyConfirmed: true,
      turnId: "11111111-1111-1111-1111-111111111111",
      seenTurnIds: ["11111111-1111-1111-1111-111111111111"],
    });
    assert.equal(first.readyToSubmit, true);
    assert.equal(second.duplicate, true);
    assert.equal(second.readyToSubmit, false);
  });

  it("repeats the order on confirm", () => {
    const cart = turn([
      { action: "add_item", item_id: "wings", quantity: 2, modifiers: [{ modifier_group_id: "flavor", option_id: "hot" }] },
    ]).cart;
    const preview = turn([{ action: "confirm_order" }], cart, { speakPrices: true });
    assert.match(preview.say, /2 Wings/);
    assert.match(preview.say, /Hot/);
    assert.match(preview.say, /Total/);
  });
});

describe("drive-thru channel", () => {
  it("uses the same priced cart as phone", () => {
    const proposals: ProposedAction[] = [
      { action: "add_item", item_id: "fries", quantity: 1, modifiers: [{ modifier_group_id: "size", option_id: "lg" }] },
    ];
    const phone = applyOrderTurn({ channel: "phone", locale: "en", catalog, cart: [], proposals });
    const lane = applyOrderTurn({ channel: "drive_thru", locale: "en", catalog, cart: [], proposals });
    assert.equal(lane.total, phone.total);
    assert.equal(lane.lines[0].itemId, phone.lines[0].itemId);
  });

  it("does not guess when confidence is low", () => {
    const noisy = applyOrderTurn({
      channel: "drive_thru",
      locale: "en",
      catalog,
      cart: [],
      proposals: [{ action: "add_item", item_id: "wings", quantity: 2, modifiers: [{ modifier_group_id: "flavor", option_id: "hot" }] }],
      transcriptConfidence: 0.42,
      utterance: "two wings mild or hot",
    });
    assert.equal(noisy.lines.length, 0);
    assert.match(noisy.say, /mild or hot/);
  });

  it("keeps the cart when the customer corrects a line", () => {
    const added = turn([{ action: "add_item", item_id: "fries", quantity: 2, modifiers: [{ modifier_group_id: "size", option_id: "reg" }] }]);
    const corrected = applyOrderTurn({
      channel: "drive_thru",
      locale: "en",
      catalog,
      cart: added.cart,
      proposals: [{ action: "update_quantity", line_id: added.cart[0].lineId, quantity: 1 }],
    });
    assert.equal(corrected.lines[0].quantity, 1);
    assert.equal(corrected.lines.length, 1);
  });

  it("asks instead of mixing two speakers into one guess", () => {
    const prepared = prepareChannelTurn({
      channel: "drive_thru",
      utterance: "what?",
      awaitingConfirmation: false,
      misunderstandingCount: 2,
    });
    assert.equal(prepared.proposals?.[0].action, "request_handoff");
  });

  it("asks when a required modifier is missing", () => {
    const result = applyOrderTurn({
      channel: "drive_thru",
      locale: "en",
      catalog,
      cart: [],
      proposals: [{ action: "add_item", item_id: "wings", quantity: 1 }],
    });
    assert.equal(result.lines.length, 0);
    assert.ok(result.clarification);
  });

  it("confirms before the kitchen sees the order", () => {
    const cart = turn([{ action: "add_item", item_id: "fries", quantity: 1, modifiers: [{ modifier_group_id: "size", option_id: "reg" }] }]).cart;
    const held = applyOrderTurn({
      channel: "drive_thru",
      locale: "en",
      catalog,
      cart,
      proposals: [{ action: "submit_order" }],
      confirmStyle: "spoken",
    });
    assert.equal(held.readyToSubmit, false);
    assert.equal(held.awaitingConfirmation, true);
  });
});

describe("channel security", () => {
  it("rejects a session from another restaurant", () => {
    assert.equal(sameRestaurant("smackin-jacks", "other-grill"), false);
    assert.equal(sameRestaurant("Demo", "demo"), true);
  });

  it("rejects a spoofed restaurant id", () => {
    assert.equal(validSlug("../admin"), false);
    assert.equal(validSlug("demo"), true);
  });

  it("rejects a malformed provider request", () => {
    const parsed = parseProviderWebhook({ SpeechResult: "twelve wings" });
    assert.equal(parsed.ok, false);
  });

  it("names phone and drive-thru events separately from voice", () => {
    assert.equal(channelAnalytics("phone", "started"), "phone_call_started");
    assert.equal(channelAnalytics("drive_thru", "takeover"), "drive_thru_takeover");
    assert.equal(channelAnalytics("mobile_web", "started"), null);
  });
});
