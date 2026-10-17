// Amazon Selling Partner API proxy. Needs YOUR seller account and a private app (see docs/06). Secrets live here only.
// Written to Amazon's documented request shapes and unit-tested on mocked responses; not yet run against live Amazon.
import { HttpError, MARKETS, asins, endpoint, market, nowIso, sanitise } from "../_shared/common.js";

const BASE = "https://sellingpartnerapi-na.amazon.com", LWA = "https://api.amazon.com/auth/o2/token";
let tokenCache = { token: null, exp: 0 };
export const resetToken = () => { tokenCache = { token: null, exp: 0 }; };

async function accessToken(env, f) {
  if (!env.SPAPI_LWA_CLIENT_ID || !env.SPAPI_LWA_CLIENT_SECRET || !env.SPAPI_REFRESH_TOKEN) throw new HttpError(503, "Amazon SP-API is not configured on the server.");
  if (tokenCache.token && Date.now() < tokenCache.exp) return tokenCache.token;
  const r = await f(LWA, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: env.SPAPI_REFRESH_TOKEN, client_id: env.SPAPI_LWA_CLIENT_ID, client_secret: env.SPAPI_LWA_CLIENT_SECRET }) });
  if (!r.ok) throw new HttpError(502, "Amazon rejected the SP-API credentials.");
  const j = await r.json(); tokenCache = { token: j.access_token, exp: Date.now() + Math.max(60, (j.expires_in || 3600) - 120) * 1000 };
  return tokenCache.token;
}
export function parseCatalog(payload, mp) {
  const id = MARKETS[mp].spapi, s = (payload.summaries || []).find((x) => x.marketplaceId === id) || {}, rk = (payload.salesRanks || []).find((x) => x.marketplaceId === id) || {};
  const top = (rk.displayGroupRanks || rk.classificationRanks || [{}])[0] || {};
  return { asin: payload.asin, title: s.itemName || null, brand: s.brand || null, category: (s.browseClassification || {}).displayName || top.title || null, bsr: top.rank ?? null };
}
export function parseFees(payload) {
  const res = (payload.payload || {}).FeesEstimateResult || {};
  if (res.Status && res.Status !== "Success") throw new HttpError(502, `Amazon returned status ${res.Status}.`);
  const out = {}; for (const d of ((res.FeesEstimate || {}).FeeDetailList || [])) { const a = (d.FinalFee || {}).Amount; if (d.FeeType === "ReferralFee") out.referral_fee = a; else if (d.FeeType === "FBAFees") out.fba_fee = a; }
  return out;
}
async function call(f, env, url, init) {
  const tok = await accessToken(env, f), r = await f(url, { ...init, headers: { ...(init.headers || {}), "x-amz-access-token": tok, accept: "application/json" } });
  if (r.status === 403) throw new HttpError(502, "Amazon refused access to this data for your seller account (role or permission missing).");
  if (!r.ok) throw new HttpError(502, `Amazon returned HTTP ${r.status}.`);
  return r.json();
}
export const handle = endpoint(async (body, env, f) => {
  const m = market(body), mp = body.marketplace, as_of = nowIso();
  if (body.action === "catalog") {
    const list = asins(body.asins, 10), items = [];
    for (const a of list) items.push({ ...parseCatalog(await call(f, env, `${BASE}/catalog/2022-04-01/items/${a}?marketplaceIds=${m.spapi}&includedData=summaries,salesRanks`, {}), mp), asin: a });
    return { source: "Amazon SP-API Catalog Items 2022-04-01", as_of, marketplace: mp, items, cost: "free (needs your seller account)" };
  }
  if (body.action === "fees") {
    const asin = asins([body.asin], 1)[0], price = Number(body.price);
    if (!(price > 0)) throw new HttpError(400, "price must be above zero.");
    const j = await call(f, env, `${BASE}/products/fees/v0/items/${asin}/feesEstimate`, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ FeesEstimateRequest: { MarketplaceId: m.spapi, IsAmazonFulfilled: true, Identifier: `element10-${asin}`, PriceToEstimateFees: { ListingPrice: { CurrencyCode: m.currency, Amount: price } } } }) });
    return { source: "Amazon SP-API Product Fees v0 (estimate)", as_of, marketplace: mp, asin, price, fees: parseFees(j), cost: "free (needs your seller account)" };
  }
  throw new HttpError(400, "action must be catalog or fees.");
}, { perHour: 120 });
export { sanitise };
