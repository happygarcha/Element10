// Keepa API proxy (licensed third-party data; PAID plan, key stays here). Format follows Keepa's published API
// description: csv arrays of [keepaMinutes, value, ...], prices in cents, keepaMinutes = minutes since 2011-01-01 UTC.
// Not yet run against live Keepa (needs a paid key): the first real call should be checked against the Keepa docs.
import { HttpError, MARKETS, asins, endpoint, market, nowIso } from "../_shared/common.js";

const KEEPA_EPOCH_MIN = 21564000;                          // unix minutes of 2011-01-01T00:00Z
export const keepaToIso = (km) => new Date((km + KEEPA_EPOCH_MIN) * 60_000).toISOString().replace(/\.\d{3}Z$/, "Z");
const IDX = { amazon: 0, new: 1, rank: 3, rating: 16, reviews: 17 };

function series(csv, price) {
  if (!Array.isArray(csv)) return [];
  const out = [];
  for (let i = 0; i + 1 < csv.length; i += 2) { const v = csv[i + 1]; if (v == null || v < 0) continue; out.push({ as_of: keepaToIso(csv[i]), value: price ? v / 100 : v }); }
  return out;
}
const cur = (stats, i, scale = 1) => { const v = stats && stats.current ? stats.current[i] : null; return v == null || v < 0 ? null : v / scale; };
export function parseProduct(p) {
  const csv = p.csv || [], stats = p.stats || {};
  return { asin: p.asin, title: p.title || null, brand: p.brand || null, category: Array.isArray(p.categoryTree) && p.categoryTree.length ? p.categoryTree[p.categoryTree.length - 1].name : null,
    price: cur(stats, IDX.new, 100) ?? cur(stats, IDX.amazon, 100), bsr: cur(stats, IDX.rank), rating: cur(stats, IDX.rating, 10), reviews: cur(stats, IDX.reviews),
    monthly_sold: p.monthlySold != null && p.monthlySold >= 0 ? p.monthlySold : null,
    history: { price: series(csv[IDX.new], true), bsr: series(csv[IDX.rank], false) } };
}
export const handle = endpoint(async (body, env, f) => {
  if (!env.KEEPA_API_KEY) throw new HttpError(503, "Keepa is not configured on the server (paid API key needed).");
  const m = market(body), list = asins(body.asins, 10);
  const url = `https://api.keepa.com/product?key=${encodeURIComponent(env.KEEPA_API_KEY)}&domain=${m.keepaDomain}&asin=${list.join(",")}&stats=90&history=1`;
  const r = await f(url);
  if (r.status === 429) throw new HttpError(429, "Keepa token allowance used up. Wait for tokens to refill.");
  if (!r.ok) throw new HttpError(502, `Keepa returned HTTP ${r.status}.`);
  const j = await r.json();
  if (j.error) throw new HttpError(502, `Keepa error: ${j.error.message || "unknown"}`);
  return { source: "Keepa API", as_of: nowIso(), marketplace: body.marketplace, items: (j.products || []).map(parseProduct), tokens_left: j.tokensLeft ?? null, tokens_consumed: j.tokensConsumed ?? null,
    cost: "uses about 1 Keepa token per ASIN on your paid plan" };
}, { perHour: 60 });
export { MARKETS };
