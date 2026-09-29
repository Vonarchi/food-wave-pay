import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  can,
  detectLocale,
  hasFeature,
  localizedLabel,
  placeOrderPlan,
  planRoute,
  posFailureMessage,
  readCampaign,
  resolvePlan,
  setupProgress,
  squareCatalogItem,
  squareOrderBody,
  summarizeOrders,
} from "../../supabase/functions/_shared/commerce.ts";

describe("plans", () => {
  it("keeps an active subscription on Core when no plan code was stored", () => {
    assert.equal(resolvePlan("active", "free"), "core");
    assert.equal(hasFeature("core", "online_ordering"), true);
    assert.equal(hasFeature("core", "phone_ai"), false);
    assert.equal(hasFeature(resolvePlan("active", "pro"), "pos_integration"), true);
  });

  it("does not grant voice ordering on the free plan", () => {
    assert.equal(hasFeature(resolvePlan(null, null), "voice_ordering"), false);
    assert.equal(hasFeature("free", "qr_code"), true);
  });
});

describe("staff", () => {
  it("lets the kitchen update tickets and blocks billing", () => {
    assert.equal(can("kitchen", "update_kds"), true);
    assert.equal(can("kitchen", "manage_billing"), false);
    assert.equal(can("owner", "manage_staff"), true);
    assert.equal(can("staff", "edit_menu"), false);
  });
});

describe("payments", () => {
  it("sends today's orders to the kitchen when payment is not required first", () => {
    const plan = placeOrderPlan({
      requirePaymentBeforeKitchen: false,
      payAtPickupAllowed: true,
      cardPaymentsReady: false,
      testMode: false,
    });
    assert.equal(plan.action, "send_to_kitchen");
  });

  it("holds the kitchen until a card payment exists", () => {
    const plan = placeOrderPlan({
      requirePaymentBeforeKitchen: true,
      payAtPickupAllowed: false,
      cardPaymentsReady: true,
      testMode: false,
    });
    assert.equal(plan.action, "await_card");
    if (plan.action === "await_card") assert.equal(plan.status, "pending");
  });

  it("marks a test order paid without a charge", () => {
    const plan = placeOrderPlan({
      requirePaymentBeforeKitchen: true,
      payAtPickupAllowed: false,
      cardPaymentsReady: true,
      testMode: true,
    });
    assert.equal(plan.action, "send_to_kitchen");
    if (plan.action === "send_to_kitchen") assert.equal(plan.test, true);
  });
});

describe("order routing", () => {
  it("does not create a second POS order for the same key", () => {
    const plan = planRoute({
      route: "both",
      paymentStatus: "paid",
      requirePaymentBeforeKitchen: true,
      idempotencyKey: "abc",
      seenKeys: ["abc"],
    });
    assert.equal(plan.duplicate, true);
    assert.equal(plan.sendToPos, false);
  });

  it("holds an unpaid order out of the kitchen", () => {
    const plan = planRoute({
      route: "kds",
      paymentStatus: "pending",
      requirePaymentBeforeKitchen: true,
      idempotencyKey: "new",
      seenKeys: [],
    });
    assert.equal(plan.sendToKds, false);
    assert.match(plan.customerMessage, /payment/i);
  });

  it("does not tell the customer a failed POS submit succeeded", () => {
    const failure = posFailureMessage();
    assert.equal(failure.status, "submission_failed");
    assert.doesNotMatch(failure.customerMessage, /in the kitchen/i);
  });
});

describe("square normalization", () => {
  it("reads the catalog price in cents and drops a nameless item", () => {
    const item = squareCatalogItem({
      id: "SQ1",
      item_data: { name: "Brisket", variations: [{ item_variation_data: { price_money: { amount: 1499 } } }] },
    });
    assert.equal(item?.priceCents, 1499);
    assert.equal(squareCatalogItem({ id: "x" }), null);
  });

  it("builds an idempotent Square order from KioKitchen prices", () => {
    const body = squareOrderBody({
      locationId: "LOC",
      idempotencyKey: "order-1",
      referenceId: "order-1",
      currency: "USD",
      lines: [{ name: "Brisket Sandwich", quantity: 2, totalCents: 2998 }],
    });
    assert.equal(body.idempotency_key, "order-1");
    assert.equal(body.order.line_items[0].base_price_money.amount, 1499);
  });
});

describe("language", () => {
  it("detects Spanish without changing the item price", () => {
    assert.equal(detectLocale("Quiero doce alitas, mitad limón y picante", "en"), "es");
    assert.equal(localizedLabel("Big Jack Burger", "Hamburguesa"), "Hamburguesa");
    assert.equal(localizedLabel("Big Jack Burger", "  "), "Big Jack Burger");
  });
});

describe("analytics and setup", () => {
  it("excludes test orders from revenue", () => {
    const summary = summarizeOrders([
      { total: 10, source: "qr", status: "received", createdAt: "", isTest: false },
      { total: 99, source: "qr", status: "received", createdAt: "", isTest: true },
      { total: 5, source: "phone", status: "cancelled", createdAt: "" },
    ]);
    assert.equal(summary.orders, 1);
    assert.equal(summary.revenue, 10);
    assert.equal(summary.byChannel.qr.orders, 1);
    assert.equal(summary.cancelled, 1);
  });

  it("names the next setup step", () => {
    const progress = setupProgress({
      profile: true,
      menuImported: true,
      menuReviewed: false,
      payments: false,
      qr: false,
      ordering: false,
      kitchen: false,
      testOrder: false,
    });
    assert.equal(progress.percent, 25);
    assert.match(progress.next, /Review/);
  });

  it("keeps campaign names plain", () => {
    assert.equal(readCampaign("?campaign=door-to-door"), "door-to-door");
    assert.equal(readCampaign("?campaign=../admin"), null);
  });
});
