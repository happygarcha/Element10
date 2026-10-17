// Fixtures below are TEST DATA shaped like the edge-function responses; they test our storage/labelling logic only.
import assert from "node:assert/strict";
import test from "node:test";
import { ingestKeepa, ingestSpFees, ingestSpCatalog, ingestVolumes } from "../js/live.js";
import { inspectKey, configChecks } from "../js/security.js";
import { MemoryAdapter, Store } from "../js/store.js";
import { latest } from "../js/services.js";
import { snapshot } from "../js/views2.js";

const mk = () => new Store(new MemoryAdapter());
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (role) => `${b64({ alg: "HS256" })}.${b64({ role })}.sig`;

test("keepa ingest labels provenance, keeps nulls out, dedupes repeats", async () => {
  const s = mk(), resp = { source: "Keepa API", as_of: "2026-10-17T10:00:00Z", items: [{ asin: "B000000001", title: "T", brand: "B", category: "C", price: 25.99, bsr: 1234, rating: 4.5, reviews: 321, monthly_sold: null,
    history: { price: [{ as_of: "2026-10-01T00:00:00Z", value: 24 }], bsr: [] } }] };
  const a = await ingestKeepa(s, "CA", resp), b = await ingestKeepa(s, "CA", resp);
  assert.equal(a.products, 1); assert.equal(a.observations, 5); assert.equal(b.observations, 0);
  const p = s.product("B000000001", "CA"), lat = latest(s, p.id);
  assert.equal(lat.price.kind, "observed"); assert.match(lat.price.source, /Keepa API/); assert.ok(!lat.monthly_units);   // absent stays absent
});
test("keepa monthly_sold is stored as estimated, never observed", async () => {
  const s = mk(); await ingestKeepa(s, "US", { source: "Keepa API", items: [{ asin: "B000000002", monthly_sold: 300 }] });
  assert.equal(latest(s, s.product("B000000002", "US").id).monthly_units.kind, "estimated");
});
test("SP-API fees stored as estimated; catalog adds bsr observed", async () => {
  const s = mk(); await ingestSpCatalog(s, "CA", { source: "Amazon SP-API Catalog", items: [{ asin: "B000000003", title: "X", bsr: 99 }] });
  assert.equal(await ingestSpFees(s, "CA", { source: "Amazon SP-API Product Fees", asin: "B000000003", price: 20, fees: { referral_fee: 3, fba_fee: null } }), 1);
  const lat = latest(s, s.product("B000000003", "CA").id); assert.equal(lat.bsr.kind, "observed"); assert.equal(lat.referral_fee.kind, "estimated"); assert.ok(!lat.fba_fee);
  await assert.rejects(ingestSpFees(s, "CA", { asin: "B0NOTEXIST", fees: {} }));
});
test("keyword volumes: null volume creates no number; ranks need an asin", async () => {
  const s = mk(), r = await ingestVolumes(s, "US", { source: "DataForSEO Labs Amazon API", items: [{ keyword: "yoga mat", search_volume: 1000 }, { keyword: "nothing", search_volume: null }] });
  assert.deepEqual(r, { kept: 1, no_data: 1 }); assert.equal(s.t.keyword_observations.length, 1); assert.equal(s.t.keyword_observations[0].kind, "estimated");
  assert.ok(!s.t.keywords.some((k) => k.phrase === "nothing"));
  await ingestVolumes(s, "US", { source: "DataForSEO Labs Amazon API", asin: "B000000001", items: [{ keyword: "grip", search_volume: null, rank: 7 }] });
  const rk = s.t.keyword_observations.find((o) => o.metric === "rank"); assert.equal(rk.value_num, 7); assert.equal(rk.asin, "B000000001"); assert.equal(rk.kind, "observed");
});
test("service_role and secret keys are refused", () => {
  assert.equal(inspectKey(jwt("service_role")).ok, false); assert.equal(inspectKey(jwt("service_role")).kind, "service_role");
  assert.equal(inspectKey("sb_secret_abc").ok, false); assert.equal(inspectKey(jwt("anon")).ok, true); assert.equal(inspectKey("sb_publishable_abc").ok, true);
  assert.equal(inspectKey("").ok, false); assert.equal(inspectKey("junk").ok, false);
});
test("config checks flag open signup and bad key", () => {
  const c = configChecks({ supabaseUrl: "https://abc.supabase.co", supabaseAnonKey: jwt("anon"), allowSignup: true }, { protocol: "https:" });
  assert.equal(c.find((x) => x.name.startsWith("Public sign-up")).ok, false); assert.equal(c.find((x) => x.name.startsWith("Key")).ok, true);
});
test("market snapshot is computed only from data present", async () => {
  const s = mk(); const pr = await s.add("projects", { name: "p", created_at: "2026-10-17T00:00:00Z" });
  for (const [asin, price, reviews] of [["B000000001", 10, 50], ["B000000002", 30, 500], ["B000000003", null, null]]) {
    const p = await s.add("products", { asin, marketplace: "US", title: asin }); await s.add("project_items", { project_id: pr.id, product_id: p.id });
    for (const [m, v] of [["price", price], ["reviews", reviews]]) if (v != null) await s.add("observations", { product_id: p.id, metric: m, value_num: v, kind: "user_supplied", source: "t", as_of: "2026-10-17T00:00:00Z" });
  }
  const sn = snapshot(s, pr.id); assert.equal(sn.n, 3); assert.equal(sn.price.n, 2); assert.equal(sn.price.median, 20); assert.equal(sn.reviews.under100, 50);
});
