// Read helpers that turn raw rows into what the screens need (port of the Python services module).
import { STARTER_PROFILE, compute } from "./calc/profit.js";
import { DEFAULT_PARAMS, DEFAULT_WEIGHTS, opportunity } from "./calc/score.js";
import { now } from "./util.js";

// later rows win ties on the same timestamp
export function latest(store, pid) {
  const best = {};
  for (const o of store.observations(pid)) { const c = best[o.metric]; if (!c || o.as_of >= c.as_of) best[o.metric] = o; }
  return best;
}
export const series = (store, pid, metric) => store.observations(pid).filter((o) => o.metric === metric && o.value_num != null).sort((a, b) => (a.as_of < b.as_of ? -1 : a.as_of > b.as_of ? 1 : 0));
export const scoreInputs = (lat) => Object.fromEntries(Object.entries(lat).filter(([, v]) => v.value_num != null).map(([k, v]) => [k, v.value_num]));
export const scoring = (store) => [store.setting("score_weights", DEFAULT_WEIGHTS), store.setting("score_params", DEFAULT_PARAMS)];

export function productRows(store, f = {}) {
  const [w, p] = scoring(store), q = (f.q || "").toLowerCase();
  let out = store.t.products.filter((x) => (!f.marketplace || x.marketplace === f.marketplace) && (!f.category || (x.category || "").toLowerCase().includes(f.category.toLowerCase()))
    && (!q || [x.title, x.asin, x.brand].some((s) => (s || "").toLowerCase().includes(q))))
    .map((x) => { const lat = latest(store, x.id), m = scoreInputs(lat), sc = opportunity(m, w, p); return { p: x, m, lat, score: sc.score, used: sc.used, total: sc.total }; });
  const checks = [["price", "price_min", "price_max"], ["reviews", null, "reviews_max"], ["rating", null, "rating_max"], ["bsr", "rank_min", "rank_max"], ["monthly_units", "units_min", null]];
  out = out.filter((r) => {
    for (const [key, loK, hiK] of checks) {
      const lo = loK ? f[loK] : null, hi = hiK ? f[hiK] : null, v = r.m[key];
      if ((lo != null || hi != null) && v == null) return false;   // a missing value never passes a filter on that value
      if (lo != null && v < lo) return false; if (hi != null && v > hi) return false;
    }
    return !(f.margin_min != null && (r.m.est_margin_pct == null || r.m.est_margin_pct < f.margin_min));
  });
  const sort = f.sort || "score", rev = (f.dir || "desc") === "desc";
  const val = (r) => (sort === "score" ? r.score : sort === "title" || sort === "asin" ? (r.p[sort] || "").toLowerCase() : r.m[sort]);
  out.sort((a, b) => { const x = val(a), y = val(b); if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; return (x < y ? -1 : x > y ? 1 : 0) * (rev ? -1 : 1); });
  return out;
}

export function feeProfile(store, mp) {
  const r = store.t.fee_profiles.find((x) => x.marketplace === mp);
  return r ? { data: r.data, verified_at: r.verified_at, source_note: r.source_note } : { data: { ...STARTER_PROFILE }, verified_at: null, source_note: "Starter values, unverified" };
}
export async function saveFeeProfile(store, mp, data, verified, note) {
  const r = store.t.fee_profiles.find((x) => x.marketplace === mp), patch = { data, verified_at: verified ? now() : null, source_note: note };
  if (r) await store.update("fee_profiles", r.id, patch); else await store.add("fee_profiles", { marketplace: mp, ...patch });
}
export const fxRates = (store) => store.setting("fx", { USD_CAD: null });
export function fxFor(store, mp) {
  const r = fxRates(store), out = {};
  if (mp === "CA") { if (r.USD_CAD) { out.USD = r.USD_CAD; if (r.CNY_USD) out.CNY = r.CNY_USD * r.USD_CAD; } }
  else { if (r.USD_CAD) out.CAD = 1 / r.USD_CAD; if (r.CNY_USD) out.CNY = r.CNY_USD; }
  return out;
}
export async function saveCalc(store, { marketplace, inputs, label = "", product_id = null, project_id = null }) {
  const result = compute(inputs);
  const run = await store.add("calc_runs", { project_id, product_id, label, marketplace, inputs, outputs: result, created_at: now() });
  if (product_id && result.margin_pct != null) {
    await store.add("observations", { product_id, metric: "est_margin_pct", value_num: Math.round(result.margin_pct * 100) / 100, value_text: null, unit: "%", kind: "calculated",
      source: `Profit calculator run ${run.id.slice(0, 8)} (fee profile verified: ${feeProfile(store, marketplace).verified_at ? "yes" : "NO"})`, as_of: now(), marketplace, import_id: null });
  }
  return { run, result };
}
