import assert from "node:assert/strict";
import test from "node:test";
import { CalcError, compute, sensitivity } from "../js/calc/profit.js";
import { opportunity } from "../js/calc/score.js";
import { plan } from "../js/calc/inventory.js";
import { analyse } from "../js/ads.js";

const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);
const base = (o = {}) => ({ marketplace: "US", sell_price: 30, supplier_cost: 5, freight_per_unit: 1, referral_pct: 15, referral_min: 0.3, fba_fee: 5, ...o });
const line = (r, label) => r.lines.find((l) => l.label === label).amount;

test("simple US profit", () => {
  const r = compute(base());
  near(r.landed_cost, 6); near(r.total_cost, 15.5); near(r.profit, 14.5); near(r.margin_pct, 14.5 / 30 * 100); near(r.roi_pct, 14.5 / 6 * 100);
  assert.equal(r.currency, "USD");
});
test("break-even gives zero profit", () => {
  const i = base({ acos_pct: 10, return_rate_pct: 4, resellable_pct: 50, return_processing_fee: 1.2, storage_rate_per_cuft_month: 0.8, cubic_ft: 0.05, months_in_storage: 2 });
  near(compute({ ...i, sell_price: compute(i).break_even_price }).profit, 0);
});
test("break-even referral-minimum branch", () => {
  const i = base({ sell_price: 1.5, supplier_cost: 0.5, freight_per_unit: 0, fba_fee: 0.5, referral_min: 0.3 });
  near(compute(i).break_even_price, 1.3);
});
test("price for target margin hits it; unreachable is null", () => {
  const i = base({ acos_pct: 10 });
  near(compute({ ...i, sell_price: compute(i).price_for_margin[20] }).margin_pct, 20, 1e-5);
  assert.equal(compute(base({ referral_pct: 60, acos_pct: 39 })).price_for_margin[30], null);
});
test("Canada FX and duties", () => {
  const i = { marketplace: "CA", sell_price: 40, supplier_cost: 5, supplier_currency: "USD", freight_per_unit: 1, freight_currency: "USD", duties_pct: 10, fba_fee: 6, fx: { USD: 1.4 } };
  near(compute(i).landed_cost, 9.1); assert.equal(compute(i).currency, "CAD");
  near(compute({ ...i, duties_base: "cost_plus_freight" }).landed_cost, 7 + 1.4 + 8.4 * 0.1);
});
test("missing FX is an error, not a guess", () => {
  assert.throws(() => compute({ marketplace: "CA", sell_price: 10, supplier_cost: 1, supplier_currency: "USD" }), (e) => e instanceof CalcError && /exchange rate/.test(e.message));
});
test("returns cost model", () => {
  const r = compute(base({ return_rate_pct: 10, resellable_pct: 50, return_processing_fee: 2, refund_admin_fee: 1 }));
  near(line(r, "Expected returns cost"), 1.1);
  near(line(compute(base({ return_rate_pct: 10, resellable_pct: 50, lose_fba_fee_on_return: false })), "Expected returns cost"), 0.3);
});
test("ad modes and storage", () => {
  near(line(compute(base({ acos_pct: 20 })), "Advertising"), 6);
  near(line(compute(base({ ad_mode: "per_unit", ad_per_unit: 2.5 })), "Advertising"), 2.5);
  near(line(compute(base({ storage_rate_per_cuft_month: 0.78, cubic_ft: 0.1, months_in_storage: 3 })), "Storage per unit"), 0.234);
});
test("validation", () => {
  for (const bad of [{ sell_price: -1 }, { referral_pct: 100 }, { marketplace: "UK" }, { resellable_pct: 120 }]) assert.throws(() => compute(base(bad)), CalcError);
});
test("zero price has no margin; sensitivity is monotonic", () => {
  const r = compute(base({ sell_price: 0 })); assert.equal(r.margin_pct, null); assert.ok(r.profit < 0);
  const rows = sensitivity(base(), [20, 25, 30, 35]).map((x) => x.profit); assert.deepEqual(rows, [...rows].sort((a, b) => a - b));
});

test("opportunity renormalises over missing data", () => {
  const full = opportunity({ bsr: 5000, reviews: 100, price: 30, rating: 4, est_margin_pct: 30 });
  assert.equal(full.used, 5); assert.ok(full.score >= 0 && full.score <= 100);
  assert.equal(opportunity({ price: 30 }).score, 100); assert.equal(opportunity({}).score, null);
  assert.ok(opportunity({ bsr: 2000, reviews: 20 }).score > opportunity({ bsr: 150000, reviews: 8000 }).score);
  assert.ok(opportunity({ price: 5 }).score < opportunity({ price: 30 }).score);
});

test("inventory plan", () => {
  const p = plan({ on_hand: 100, inbound: 0, daily_sales: 10, lead_time_days: 20, safety_days: 5, target_cover_days: 60, unit_cost: 4 });
  assert.equal(p.reorder_point_units, 250); assert.equal(p.status, "Reorder now"); near(p.days_of_cover, 10);
  assert.equal(p.suggested_order_units, 10 * 80 - 100); near(p.order_cost, 700 * 4);
  assert.equal(plan({ on_hand: 5000, daily_sales: 10, lead_time_days: 20 }).status, "OK for now");
  assert.ok(plan({ daily_sales: 0, lead_time_days: 5 }).error);
  assert.equal(plan({ on_hand: 0, daily_sales: 1, lead_time_days: 1, target_cover_days: 1, moq: 500 }).suggested_order_units, 500);
});

test("ad analysis", () => {
  const t = [{ term: "a", impressions: 1000, clicks: 50, spend: 40, sales: 0, orders: 0 }, { term: "b", impressions: 500, clicks: 20, spend: 10, sales: 100, orders: 4 }, { term: "c", impressions: 100, clicks: 5, spend: 9, sales: 20, orders: 1 }];
  const r = analyse(t, { min_clicks: 10, target_acos: 30 });
  assert.deepEqual(r.wasted.map((x) => x.term), ["a"]); assert.deepEqual(r.winners.map((x) => x.term), ["b"]); assert.deepEqual(r.over.map((x) => x.term), ["c"]);
  near(r.totals.spend, 59); near(r.totals.acos, 59 / 120 * 100); near(r.totals.wasted_spend, 40);
});
