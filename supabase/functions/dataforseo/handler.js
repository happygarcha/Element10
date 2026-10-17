// DataForSEO Labs (Amazon) proxy: licensed keyword data. PAID, pay-as-you-go. Login/password stay here.
// Written from DataForSEO's published request/response structure; parsers are strict and throw when the shape is
// not what they expect instead of guessing. Not yet run against the live API: check the first response.
import { HttpError, asins, endpoint, market, nowIso } from "../_shared/common.js";

const BASE = "https://api.dataforseo.com/v3/dataforseo_labs/amazon";
async function post(f, env, path, payload) {
  if (!env.DATAFORSEO_LOGIN || !env.DATAFORSEO_PASSWORD) throw new HttpError(503, "DataForSEO is not configured on the server (paid account needed).");
  const r = await f(`${BASE}/${path}`, { method: "POST", headers: { authorization: "Basic " + btoa(`${env.DATAFORSEO_LOGIN}:${env.DATAFORSEO_PASSWORD}`), "content-type": "application/json" }, body: JSON.stringify(payload) });
  if (r.status === 401) throw new HttpError(502, "DataForSEO rejected the credentials.");
  if (!r.ok) throw new HttpError(502, `DataForSEO returned HTTP ${r.status}.`);
  const j = await r.json(), task = (j.tasks || [])[0];
  if (!task || task.status_code !== 20000) throw new HttpError(502, `DataForSEO task failed: ${task ? task.status_message : "no task"}`);
  return { result: (task.result || [])[0] || {}, cost: j.cost ?? task.cost ?? null };
}
export function parseVolume(result) {
  if (!Array.isArray(result.items)) throw new HttpError(502, "Unexpected DataForSEO response (no items).");
  return result.items.map((i) => ({ keyword: String(i.keyword || "").toLowerCase(), search_volume: i.search_volume ?? null }));
}
export function parseRanked(result) {
  if (!Array.isArray(result.items)) throw new HttpError(502, "Unexpected DataForSEO response (no items).");
  return result.items.map((i) => ({ keyword: String(((i.keyword_data || {}).keyword) || "").toLowerCase(),
    search_volume: (((i.keyword_data || {}).keyword_info) || {}).search_volume ?? null, rank: (((i.ranked_serp_element || {}).serp_item) || {}).rank_absolute ?? null })).filter((x) => x.keyword);
}
export const handle = endpoint(async (body, env, f) => {
  const m = market(body), base = { source: "DataForSEO Labs Amazon API", as_of: nowIso(), marketplace: body.marketplace, location_code: m.dfsLocation };
  if (body.action === "volume") {
    const kws = (Array.isArray(body.keywords) ? body.keywords : []).map((k) => String(k).trim().toLowerCase()).filter(Boolean);
    if (!kws.length) throw new HttpError(400, "Provide at least one keyword.");
    if (kws.length > 100) throw new HttpError(400, "At most 100 keywords per request.");
    const { result, cost } = await post(f, env, "bulk_search_volume/live", [{ keywords: [...new Set(kws)], location_code: m.dfsLocation, language_code: "en" }]);
    return { ...base, items: parseVolume(result), cost_usd: cost };
  }
  if (body.action === "ranked") {
    const asin = asins([body.asin], 1)[0], limit = Math.min(Number(body.limit) || 50, 100);
    const { result, cost } = await post(f, env, "ranked_keywords/live", [{ asin, location_code: m.dfsLocation, language_code: "en", limit }]);
    return { ...base, asin, items: parseRanked(result), cost_usd: cost };
  }
  throw new HttpError(400, "action must be volume or ranked.");
}, { perHour: 30 });
