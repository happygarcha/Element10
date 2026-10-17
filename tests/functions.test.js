// Edge-function tests. Upstream responses below are TEST FIXTURES written from the providers' published shapes;
// they prove our parsing, auth, caps and secret handling, NOT that the live providers behave this way.
import test from "node:test";
import assert from "node:assert/strict";
import { resetLimits } from "../supabase/functions/_shared/common.js";
import { handle as keepa, keepaToIso, parseProduct } from "../supabase/functions/keepa/handler.js";
import { handle as dfs, parseVolume } from "../supabase/functions/dataforseo/handler.js";
import { handle as spapi, parseFees, parseCatalog, resetToken } from "../supabase/functions/spapi/handler.js";
import { handle as status } from "../supabase/functions/status/handler.js";

const ENV = { SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "anon", KEEPA_API_KEY: "KEEPA-SECRET-123", DATAFORSEO_LOGIN: "login@example.com", DATAFORSEO_PASSWORD: "DFS-SECRET-456",
  SPAPI_LWA_CLIENT_ID: "cid", SPAPI_LWA_CLIENT_SECRET: "LWA-SECRET-789", SPAPI_REFRESH_TOKEN: "REFRESH-SECRET-000" };
const req = (body, { auth = "Bearer good", method = "POST", origin } = {}) => new Request("https://f/x", { method, headers: { authorization: auth, "content-type": "application/json", ...(origin ? { origin } : {}) }, body: method === "POST" ? JSON.stringify(body) : undefined });
const json = (o, status = 200) => new Response(JSON.stringify(o), { status });
function fetcher(routes) {
  const calls = [];
  const f = async (url, init = {}) => { calls.push({ url: String(url), init }); if (String(url).includes("/auth/v1/user")) return (init.headers.authorization === "Bearer good") ? json({ id: "u1", email: "me@example.com" }) : json({}, 401); for (const [k, v] of routes) if (String(url).includes(k)) return typeof v === "function" ? v(url, init) : v; return json({}, 404); };
  f.calls = calls; return f;
}
test.beforeEach(() => { resetLimits(); resetToken(); });

test("auth: missing or invalid login is refused before any provider is called", async () => {
  const f = fetcher([["keepa.com", json({})]]);
  assert.equal((await keepa(req({ marketplace: "CA", asins: ["B000000001"] }, { auth: "" }), ENV, f)).status, 401);
  assert.equal((await keepa(req({ marketplace: "CA", asins: ["B000000001"] }, { auth: "Bearer bad" }), ENV, f)).status, 401);
  assert.ok(!f.calls.some((c) => c.url.includes("keepa.com")));
});
test("auth: ALLOWED_EMAILS blocks other accounts", async () => {
  const f = fetcher([]);
  const r = await status(req({}), { ...ENV, ALLOWED_EMAILS: "other@example.com" }, f);
  assert.equal(r.status, 403);
});
test("method and CORS preflight", async () => {
  assert.equal((await status(new Request("https://f/x", { method: "OPTIONS", headers: { origin: "https://a.github.io" } }), { ...ENV, ALLOWED_ORIGINS: "https://a.github.io" }, fetcher([]))).status, 204);
  assert.equal((await status(req({}, { method: "GET" }), ENV, fetcher([]))).status, 405);
  const r = await status(req({}, { origin: "https://evil.example" }), { ...ENV, ALLOWED_ORIGINS: "https://a.github.io" }, fetcher([]));
  assert.equal(r.headers.get("access-control-allow-origin"), "https://a.github.io");
});
test("status reports booleans only, never values", async () => {
  const r = await status(req({}), ENV, fetcher([])), t = await r.text();
  assert.deepEqual(JSON.parse(t), { spapi: true, keepa: true, dataforseo: true, restricted_to_allowed_emails: false });
  for (const s of ["SECRET"]) assert.ok(!t.includes(s));
});
test("not configured gives 503 and no outbound call", async () => {
  const f = fetcher([]);
  const r = await keepa(req({ marketplace: "US", asins: ["B000000001"] }), { SUPABASE_URL: ENV.SUPABASE_URL, SUPABASE_ANON_KEY: "a" }, f);
  assert.equal(r.status, 503); assert.ok(!f.calls.some((c) => c.url.includes("keepa")));
});
test("keepa: caps, validation, parse", async () => {
  const f = fetcher([["api.keepa.com", json({ tokensLeft: 50, tokensConsumed: 1, products: [{ asin: "B000000001", title: "Fixture item", categoryTree: [{ name: "Home" }, { name: "Kitchen" }],
    stats: { current: [-1, 2599, -1, 1234, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 45, 321] }, csv: { 1: [100, 2599, 200, 2699], 3: [100, 1500, 200, -1] } }] })]]);
  assert.equal((await keepa(req({ marketplace: "CA", asins: ["bad"] }), ENV, f)).status, 400);
  assert.equal((await keepa(req({ marketplace: "ZZ", asins: ["B000000001"] }), ENV, f)).status, 400);
  assert.equal((await keepa(req({ marketplace: "CA", asins: Array.from({ length: 11 }, (_, i) => "B0000000" + String(i).padStart(2, "0")) }), ENV, f)).status, 400);
  const ok = await keepa(req({ marketplace: "CA", asins: ["b000000001", "B000000001"] }), ENV, f), j = await ok.json();
  assert.equal(ok.status, 200); const it = j.items[0];
  assert.equal(it.price, 25.99); assert.equal(it.bsr, 1234); assert.equal(it.rating, 4.5); assert.equal(it.reviews, 321); assert.equal(it.category, "Kitchen");
  assert.equal(it.monthly_sold, null);                       // never invented when absent
  assert.equal(it.history.price.length, 2); assert.equal(it.history.bsr.length, 1);   // -1 (no data) dropped
  assert.match(f.calls.at(-1).url, /domain=6/);
});
test("keepa time conversion", () => { assert.equal(keepaToIso(0), "2011-01-01T00:00:00Z"); });
test("keepa upstream errors are sanitised: key never returned", async () => {
  const f = fetcher([["api.keepa.com", json({ error: { message: "bad key KEEPA-SECRET-123" } })]]);
  const r = await keepa(req({ marketplace: "CA", asins: ["B000000001"] }), ENV, f), t = await r.text();
  assert.equal(r.status, 502); assert.ok(!t.includes("KEEPA-SECRET-123"));
});
test("keepa 429 maps to token message", async () => {
  const r = await keepa(req({ marketplace: "CA", asins: ["B000000001"] }), ENV, fetcher([["api.keepa.com", json({}, 429)]]));
  assert.equal(r.status, 429);
});
test("rate limit per user", async () => {
  const f = fetcher([]); const e = { ...ENV, MAX_CALLS_PER_HOUR: "2" };
  assert.equal((await status(req({}), e, f)).status, 200); assert.equal((await status(req({}), e, f)).status, 200);
  assert.equal((await status(req({}), e, f)).status, 429);
});
test("dataforseo volume: parse, null stays null, cap", async () => {
  const f = fetcher([["bulk_search_volume", json({ cost: 0.01, tasks: [{ status_code: 20000, result: [{ items: [{ keyword: "Yoga Mat", search_volume: 1000 }, { keyword: "zzz", search_volume: null }] }] }] })]]);
  const r = await dfs(req({ marketplace: "US", action: "volume", keywords: ["Yoga Mat", "zzz"] }), ENV, f), j = await r.json();
  assert.deepEqual(j.items, [{ keyword: "yoga mat", search_volume: 1000 }, { keyword: "zzz", search_volume: null }]); assert.equal(j.cost_usd, 0.01);
  assert.match(JSON.parse(f.calls.at(-1).init.body)[0].location_code.toString(), /2840/);
  assert.equal((await dfs(req({ marketplace: "US", action: "volume", keywords: Array(101).fill("a") }), ENV, f)).status, 400);
  assert.equal((await dfs(req({ marketplace: "US", action: "volume", keywords: [] }), ENV, f)).status, 400);
});
test("dataforseo strict parse: unexpected shape throws, failed task surfaces", async () => {
  assert.throws(() => parseVolume({}));
  const f = fetcher([["bulk_search_volume", json({ tasks: [{ status_code: 40000, status_message: "nope" }] })]]);
  assert.equal((await dfs(req({ marketplace: "CA", action: "volume", keywords: ["a"] }), ENV, f)).status, 502);
});
test("dataforseo credentials never echoed", async () => {
  const f = fetcher([["bulk_search_volume", () => { throw new Error("boom DFS-SECRET-456"); }]]);
  const r = await dfs(req({ marketplace: "CA", action: "volume", keywords: ["a"] }), ENV, f);
  assert.ok(!(await r.text()).includes("DFS-SECRET-456"));
});
test("spapi: catalog + fees parse, 403 explained, secrets absent", async () => {
  const f = fetcher([["auth/o2/token", json({ access_token: "tok", expires_in: 3600 })],
    ["catalog/2022-04-01", json({ asin: "B000000001", summaries: [{ marketplaceId: "A2EUQ1WTGCTBG2", itemName: "Fixture", brand: "FixtureBrand" }], salesRanks: [{ marketplaceId: "A2EUQ1WTGCTBG2", displayGroupRanks: [{ title: "Home", rank: 777 }] }] })],
    ["feesEstimate", json({ payload: { FeesEstimateResult: { Status: "Success", FeesEstimate: { FeeDetailList: [{ FeeType: "ReferralFee", FinalFee: { Amount: 3.9 } }, { FeeType: "FBAFees", FinalFee: { Amount: 5.1 } }] } } } })]]);
  const c = await (await spapi(req({ marketplace: "CA", action: "catalog", asins: ["B000000001"] }), ENV, f)).json();
  assert.equal(c.items[0].bsr, 777); assert.equal(c.items[0].title, "Fixture");
  const fe = await (await spapi(req({ marketplace: "CA", action: "fees", asin: "B000000001", price: 26 }), ENV, f)).json();
  assert.deepEqual(fe.fees, { referral_fee: 3.9, fba_fee: 5.1 });
  assert.equal((await spapi(req({ marketplace: "CA", action: "fees", asin: "B000000001", price: 0 }), ENV, f)).status, 400);
  const f403 = fetcher([["auth/o2/token", json({ access_token: "t", expires_in: 3600 })], ["catalog", json({}, 403)]]);
  const r = await spapi(req({ marketplace: "CA", action: "catalog", asins: ["B000000001"] }), ENV, f403);
  assert.equal(r.status, 502); assert.match((await r.json()).error, /permission/);
});
test("spapi bad credentials message hides secrets", async () => {
  const f = fetcher([["auth/o2/token", json({ error: "x" }, 400)]]);
  const r = await spapi(req({ marketplace: "CA", action: "catalog", asins: ["B000000001"] }), ENV, f), t = await r.text();
  assert.equal(r.status, 502); assert.ok(!/SECRET/.test(t));
});
