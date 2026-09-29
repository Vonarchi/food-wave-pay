import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  answerQuestion,
  buildReport,
  canTransition,
  compareLocations,
  type InsightMenuItem,
  type InsightOrder,
  type InsightReport,
} from "../../supabase/functions/_shared/insights.ts";

const NOW = new Date("2026-09-28T12:00:00.000Z");

function item(partial: Partial<InsightMenuItem> & Pick<InsightMenuItem, "id" | "name">): InsightMenuItem {
  return { category: "Mains", available: true, price: 10, description: "Served hot with the house sauce", ...partial };
}

function order(partial: Partial<InsightOrder> & Pick<InsightOrder, "id" | "createdAt" | "total">): InsightOrder {
  return {
    status: "received",
    paymentStatus: "pay_at_pickup",
    source: "qr",
    lines: [{ id: "burger", name: "Burger", quantity: 1, category: "Mains" }],
    ...partial,
  };
}

function report(orders: InsightOrder[] = [], extra: Partial<Parameters<typeof buildReport>[0]> = {}): InsightReport {
  return buildReport({
    now: NOW,
    orders,
    sessions: [],
    menu: [item({ id: "burger", name: "Burger" })],
    upsells: [],
    events: [],
    ...extra,
  });
}

describe("restaurant health", () => {
  it("does not score a restaurant with no orders", () => {
    const result = report();
    assert.equal(result.health.overall, null);
    assert.match(result.briefing[0], /not enough/i);
    assert.equal(result.actions.length, 0);
  });

  it("explains a measured ticket drop and does not invent a dollar impact", () => {
    const orders: InsightOrder[] = [];
    for (let i = 0; i < 5; i += 1) orders.push(order({ id: `b${i}`, createdAt: `2026-09-0${i + 1}T15:00:00.000Z`, total: 20 }));
    for (let i = 0; i < 5; i += 1) orders.push(order({ id: `c${i}`, createdAt: `2026-09-2${i + 2}T15:00:00.000Z`, total: 16 }));
    const result = report(orders);
    const sales = result.health.parts.find((part) => part.key === "sales");
    assert.match(sales?.reason ?? "", /20% lower/);
    assert.match(sales?.reason ?? "", /\$16\.00/);
    const card = result.actions.find((action) => action.id === "ticket_drop");
    assert.equal(card?.impact, null);
    assert.match(result.briefing.join(" "), /\$16\.00/);
  });

  it("does not flag a ticket drop when this week is higher", () => {
    const orders: InsightOrder[] = [];
    for (const day of ["09-01", "09-02", "09-03", "09-04", "09-05"]) {
      orders.push(order({ id: day, createdAt: `2026-${day}T15:00:00.000Z`, total: 10 }));
    }
    for (let i = 0; i < 5; i += 1) orders.push(order({ id: `c${i}`, createdAt: `2026-09-2${i + 2}T15:00:00.000Z`, total: 14 }));
    const result = report(orders);
    assert.equal(result.actions.some((action) => action.id === "ticket_drop"), false);
  });
});

describe("recommendations stay gated", () => {
  it("recommends a pair only after 10 orders and skips an enabled rule", () => {
    const orders: InsightOrder[] = [];
    for (let i = 0; i < 10; i += 1) {
      orders.push(order({
        id: `p${i}`,
        createdAt: `2026-09-${String(i + 10).padStart(2, "0")}T18:00:00.000Z`,
        total: 12,
        lines: [
          { id: "burger", name: "Burger", quantity: 1, category: "Mains" },
          { id: "fries", name: "Fries", quantity: 1, category: "Sides" },
        ],
      }));
    }
    const menu = [item({ id: "burger", name: "Burger" }), item({ id: "fries", name: "Fries", category: "Sides" })];
    const open = report(orders, { menu });
    assert.match(open.upsells[0]?.evidence ?? "", /10 of 10/);
    assert.equal(open.upsells[0]?.canApply, false);
    const closed = report(orders, { menu, upsells: [{ sourceItemId: "burger", suggestedItemId: "fries", enabled: true }] });
    assert.equal(closed.upsells.some((row) => row.sourceItemId === "burger" && row.suggestedItemId === "fries"), false);
  });

  it("leaves AI unscored without sessions", () => {
    const result = report([order({ id: "1", createdAt: "2026-09-27T12:00:00.000Z", total: 9 })]);
    const ai = result.health.parts.find((part) => part.key === "ai");
    assert.equal(ai?.score, null);
    assert.match(ai?.reason ?? "", /at least 5/);
  });

  it("refuses to activate a suggestion the owner has not approved", () => {
    assert.equal(canTransition("suggested", "active"), false);
    assert.equal(canTransition("suggested", "approved"), true);
    assert.equal(canTransition("approved", "active"), true);
    assert.equal(canTransition("rejected", "approved"), false);
  });
});

describe("owner assistant", () => {
  it("says when the data is missing", () => {
    const result = report();
    assert.match(answerQuestion("Why were sales down yesterday?", result), /don't have enough data/i);
    assert.match(answerQuestion("How much margin did I make?", result), /don't have food cost/i);
    assert.match(answerQuestion("Which item was viewed the most?", result), /don't have item view counts/i);
  });

  it("names a top item from quantities on the tickets", () => {
    const orders: InsightOrder[] = [];
    for (let i = 0; i < 6; i += 1) {
      orders.push(order({
        id: `t${i}`,
        createdAt: `2026-09-${String(i + 10).padStart(2, "0")}T18:00:00.000Z`,
        total: 11,
        lines: [{ id: "wings", name: "Wings", quantity: 2, category: "Mains" }],
      }));
    }
    const result = report(orders, { menu: [item({ id: "wings", name: "Wings" })] });
    assert.match(answerQuestion("What are my top items?", result), /Wings \(12\)/);
  });
});

describe("locations", () => {
  it("compares measured tickets without ranking", () => {
    const east = report(Array.from({ length: 6 }, (_, i) => order({ id: `e${i}`, createdAt: `2026-09-${String(i + 10).padStart(2, "0")}T12:00:00.000Z`, total: 18.2 })));
    const west = report(Array.from({ length: 6 }, (_, i) => order({ id: `w${i}`, createdAt: `2026-09-${String(i + 10).padStart(2, "0")}T12:00:00.000Z`, total: 14.1 })));
    const text = compareLocations([{ name: "East", report: east }, { name: "West", report: west }]).join(" ");
    assert.match(text, /East: average ticket \$18\.20 across 6 orders/);
    assert.match(text, /not ranked/);
    assert.doesNotMatch(text, /best|winner|#1/i);
  });
});
