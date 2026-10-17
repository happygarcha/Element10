// Opportunity score: transparent, adjustable, honest about missing data. Missing factors are skipped and the
// remaining weights renormalised. Rank-based demand is a proxy: Best Sellers Rank is category-specific.
import { clamp } from "../util.js";

export const DEFAULT_WEIGHTS = { demand: 30, competition: 25, price: 15, quality_gap: 10, margin: 20 };
export const DEFAULT_PARAMS = { price_low: 20, price_high: 70, rank_best: 1000, rank_worst: 200000, reviews_hard: 5000, rating_target: 4.6, margin_target_pct: 40 };
export const EXPLAIN = {
  demand: "Lower Best Sellers Rank scores higher (log scale between rank_best and rank_worst). A proxy: ranks are category-specific.",
  competition: "Fewer reviews scores higher (log scale up to reviews_hard). Few reviews usually means an easier market to enter.",
  price: "100 inside your target price band, falling off linearly outside it.",
  quality_gap: "A rating below the target suggests room to do better: (target - rating) scaled to 100.",
  margin: "Estimated margin from your profit calculator, scaled to margin_target_pct.",
};

export function factorScores(m, p) {
  const out = {};
  if (m.bsr > 0) {
    const lo = Math.log10(p.rank_best), hi = Math.log10(p.rank_worst);
    out.demand = [clamp(100 * (1 - (Math.log10(m.bsr) - lo) / (hi - lo))), `rank ${Math.round(m.bsr).toLocaleString("en-CA")}`];
  } else out.demand = [null, "no rank"];
  if (m.reviews != null && m.reviews >= 0) out.competition = [clamp(100 * (1 - Math.log10(m.reviews + 1) / Math.log10(p.reviews_hard + 1))), `${Math.round(m.reviews).toLocaleString("en-CA")} reviews`];
  else out.competition = [null, "no review count"];
  if (m.price > 0) {
    const lo = p.price_low, hi = p.price_high, pr = m.price;
    const s = pr >= lo && pr <= hi ? 100 : pr < lo ? clamp(100 * (1 - (lo - pr) / lo)) : clamp(100 * (1 - (pr - hi) / hi));
    out.price = [s, `price ${pr.toFixed(2)} vs band ${lo}-${hi}`];
  } else out.price = [null, "no price"];
  if (m.rating > 0) out.quality_gap = [clamp((p.rating_target - m.rating) / 1.0 * 100), `rating ${m.rating.toFixed(1)}`];
  else out.quality_gap = [null, "no rating"];
  if (m.est_margin_pct != null) out.margin = [clamp(m.est_margin_pct / p.margin_target_pct * 100), `margin ${m.est_margin_pct.toFixed(1)}%`];
  else out.margin = [null, "no margin estimate"];
  return out;
}

export function opportunity(m, weights = {}, params = {}) {
  const w = { ...DEFAULT_WEIGHTS, ...weights }, p = { ...DEFAULT_PARAMS, ...params };
  const fs = factorScores(m, p);
  const factors = Object.entries(fs).map(([name, [score, detail]]) => ({ name, score, weight: Number(w[name] || 0), detail }));
  const live = factors.filter((f) => f.score != null && f.weight > 0);
  if (!live.length) return { score: null, used: 0, total: factors.length, factors };
  const tot = live.reduce((a, f) => a + f.weight, 0);
  return { score: Math.round(live.reduce((a, f) => a + f.score * f.weight, 0) / tot * 10) / 10, used: live.length, total: factors.length, factors };
}
