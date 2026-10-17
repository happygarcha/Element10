// Per-unit profit model for Amazon.ca and Amazon.com (FBA). Port of the Python module; same assumptions:
// prices and Amazon fees are in the marketplace currency; supplier cost/freight may be in other currencies
// converted with `fx` (marketplace-currency units per 1 unit of that currency); duties are on supplier cost by
// default; referral = max(price x %, minimum); a returned unit costs the FBA fee (optional), processing and admin
// fees, and the landed cost of units that cannot be resold.
import { CURRENCY } from "../util.js";

export class CalcError extends Error {}

export const DEFAULT_INPUTS = {
  marketplace: "CA", sell_price: 0, supplier_cost: 0, supplier_currency: "USD", freight_per_unit: 0, freight_currency: "USD",
  duties_pct: 0, duties_base: "cost_only", other_landed_per_unit: 0, referral_pct: 15, referral_min: 0, fba_fee: 0,
  other_amazon_fees: 0, storage_rate_per_cuft_month: 0, cubic_ft: 0, months_in_storage: 1, ad_mode: "acos", acos_pct: 0,
  ad_per_unit: 0, return_rate_pct: 0, resellable_pct: 100, return_processing_fee: 0, refund_admin_fee: 0,
  lose_fba_fee_on_return: true, fx: {},
};

// Starter values. 15% referral and a 0.30 minimum are common defaults, NOT verified: the profile stays flagged
// "unverified" until you confirm every value against Seller Central and tick "verified".
export const STARTER_PROFILE = {
  referral_pct: 15, referral_min: 0.3, fba_fee: 0, other_amazon_fees: 0, storage_rate_per_cuft_month: 0,
  return_processing_fee: 0, refund_admin_fee: 0, duties_pct: 0, acos_pct: 15, return_rate_pct: 5, resellable_pct: 85,
};

const NON_NEGATIVE = ["sell_price", "supplier_cost", "freight_per_unit", "duties_pct", "referral_pct", "referral_min", "fba_fee",
  "other_amazon_fees", "storage_rate_per_cuft_month", "cubic_ft", "months_in_storage", "acos_pct", "ad_per_unit",
  "return_rate_pct", "return_processing_fee", "refund_admin_fee", "other_landed_per_unit"];

function validate(i) {
  if (!CURRENCY[i.marketplace]) throw new CalcError("marketplace must be CA or US");
  if (!["acos", "per_unit"].includes(i.ad_mode)) throw new CalcError("ad_mode must be acos or per_unit");
  if (!["cost_only", "cost_plus_freight"].includes(i.duties_base)) throw new CalcError("duties_base must be cost_only or cost_plus_freight");
  for (const k of NON_NEGATIVE) if (!(i[k] >= 0)) throw new CalcError(`${k} cannot be negative`);
  if (!(i.resellable_pct >= 0 && i.resellable_pct <= 100) || !(i.return_rate_pct >= 0 && i.return_rate_pct <= 100)) throw new CalcError("return and resellable percentages must be between 0 and 100");
  if (i.referral_pct >= 100 || i.acos_pct >= 100) throw new CalcError("percentages must be below 100");
}

export function toMarketplace(amount, currency, marketplace, fx) {
  const mp = CURRENCY[marketplace];
  if (currency === mp) return amount;
  const r = fx && fx[currency];
  if (!r || r <= 0) throw new CalcError(`Missing exchange rate ${currency} -> ${mp}. Add it in Settings.`);
  return amount * r;
}

// price p such that p - fixed - referral(p) - adPct*p = margin*p, with referral = max(p*refPct, refMin)
function solvePrice(fixed, refPct, refMin, adPct, margin) {
  const d1 = 1 - refPct - adPct - margin;
  if (d1 > 1e-9) { const p = fixed / d1; if (p * refPct >= refMin - 1e-9) return p; }
  const d2 = 1 - adPct - margin;
  if (d2 > 1e-9) { const p2 = (fixed + refMin) / d2; if (p2 * refPct <= refMin + 1e-9) return p2; }
  return null;
}

export function compute(raw) {
  const i = { ...DEFAULT_INPUTS, ...raw };
  validate(i);
  const cost = toMarketplace(i.supplier_cost, i.supplier_currency, i.marketplace, i.fx);
  const freight = toMarketplace(i.freight_per_unit, i.freight_currency, i.marketplace, i.fx);
  const duties = (cost + (i.duties_base === "cost_plus_freight" ? freight : 0)) * i.duties_pct / 100;
  const landed = cost + freight + duties + i.other_landed_per_unit;
  const referral = i.sell_price > 0 ? Math.max(i.sell_price * i.referral_pct / 100, i.referral_min) : 0;
  const storage = i.storage_rate_per_cuft_month * i.cubic_ft * i.months_in_storage;
  const ads = i.ad_mode === "acos" ? i.sell_price * i.acos_pct / 100 : i.ad_per_unit;
  const returns = (i.return_rate_pct / 100) * ((i.lose_fba_fee_on_return ? i.fba_fee : 0) + i.return_processing_fee + i.refund_admin_fee + (1 - i.resellable_pct / 100) * landed);
  const g = (n) => Number(n.toFixed(6)).toString();
  const lines = [
    { label: "Supplier cost", amount: cost, kind: "input", note: `${g(i.supplier_cost)} ${i.supplier_currency} converted` },
    { label: "Freight to Amazon", amount: freight, kind: "input", note: `${g(i.freight_per_unit)} ${i.freight_currency} converted` },
    { label: "Duties", amount: duties, kind: "calculated", note: `${g(i.duties_pct)}% of ${i.duties_base.replace("_", " ")}` },
    { label: "Other landed costs", amount: i.other_landed_per_unit, kind: "input", note: "" },
    { label: "Referral fee", amount: referral, kind: "calculated", note: `${g(i.referral_pct)}% of price, minimum ${g(i.referral_min)}` },
    { label: "FBA fulfilment fee", amount: i.fba_fee, kind: "input", note: "" },
    { label: "Other Amazon fees", amount: i.other_amazon_fees, kind: "input", note: "inbound placement, fuel surcharge, etc." },
    { label: "Storage per unit", amount: storage, kind: "calculated", note: `${g(i.storage_rate_per_cuft_month)} x ${g(i.cubic_ft)} cu ft x ${g(i.months_in_storage)} months` },
    { label: "Advertising", amount: ads, kind: i.ad_mode === "acos" ? "calculated" : "input", note: i.ad_mode === "acos" ? `${g(i.acos_pct)}% of price` : "per unit" },
    { label: "Expected returns cost", amount: returns, kind: "calculated", note: `${g(i.return_rate_pct)}% return rate` },
  ];
  const total = landed + referral + i.fba_fee + i.other_amazon_fees + storage + ads + returns;
  const profit = i.sell_price - total;
  let fixed = landed + i.fba_fee + i.other_amazon_fees + storage + returns;
  if (i.ad_mode === "per_unit") fixed += i.ad_per_unit;
  const adPct = i.ad_mode === "acos" ? i.acos_pct / 100 : 0, refPct = i.referral_pct / 100;
  const targets = {};
  for (const m of [15, 20, 30]) targets[m] = solvePrice(fixed, refPct, i.referral_min, adPct, m / 100);
  return { marketplace: i.marketplace, currency: CURRENCY[i.marketplace], sell_price: i.sell_price, lines, landed_cost: landed, total_cost: total, profit,
    margin_pct: i.sell_price > 0 ? profit / i.sell_price * 100 : null, roi_pct: landed > 0 ? profit / landed * 100 : null,
    break_even_price: solvePrice(fixed, refPct, i.referral_min, adPct, 0), price_for_margin: targets };
}

export function sensitivity(inputs, prices) {
  return prices.map((p) => { const r = compute({ ...inputs, sell_price: p }); return { price: p, profit: r.profit, margin_pct: r.margin_pct }; });
}
