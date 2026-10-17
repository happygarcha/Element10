import assert from "node:assert/strict";
import test from "node:test";
import { clusterKeywords, auditListing, containsPhrase, readability, stem, titleSkeleton } from "../js/calc/text.js";
import { parseCSV } from "../js/csv.js";
import { detectMapping, importAdTerms, importKeywords, importProducts, parseNumber, PRODUCT_ALIASES } from "../js/imports.js";
import { evaluate } from "../js/alerts.js";
import { MemoryAdapter, Store, SupabaseAdapter } from "../js/store.js";
import { latest, productRows, saveCalc } from "../js/services.js";

const mk = () => new Store(new MemoryAdapter());
const CSV = "ASIN,Title,Price,Reviews,Rating,BSR\nB0ABCDEFGH,Widget,$19.99,1.2K,4.3,15000\nBAD,Nope,5,1,1,1\nB0ZZZZZZZZ,Gadget,N/A,50,,\n";

test("csv parser: quotes, newlines, semicolons, BOM", () => {
  assert.deepEqual(parseCSV('a,b\n"x, y","he said ""hi"""\n').rows[0], { a: "x, y", b: 'he said "hi"' });
  assert.equal(parseCSV('a,b\n"line1\nline2",2\n').rows[0].a, "line1\nline2");
  const s = parseCSV("﻿ASIN;Price\nB000000001;9,99\n"); assert.deepEqual(s.headers, ["ASIN", "Price"]); assert.equal(s.rows[0].ASIN, "B000000001");
  assert.deepEqual(parseCSV("").rows, []);
});
test("parseNumber", () => {
  assert.equal(parseNumber("$1,234.50"), 1234.5); assert.equal(parseNumber("12K"), 12000); assert.equal(parseNumber("1.5M"), 1.5e6);
  for (const v of ["N/A", "", "abc", null]) assert.equal(parseNumber(v), null); assert.equal(parseNumber("85%"), 85);
});
test("mapping aliases", () => {
  assert.deepEqual(detectMapping(["ASIN", "Product Details", "Price", "Review Count", "BSR", "Weird"], PRODUCT_ALIASES), { asin: "ASIN", title: "Product Details", price: "Price", reviews: "Review Count", bsr: "BSR" });
});
test("product import keeps provenance, skips bad rows, builds history", async () => {
  const s = mk();
  const r = await importProducts(s, CSV, { marketplace: "CA", source_label: "My export", as_of: "2026-10-01T00:00:00Z" });
  assert.equal(r.ok, 2); assert.equal(r.skipped, 1); assert.ok(r.problems.some((p) => /not a valid ASIN/.test(p)));
  const o = s.t.observations.find((x) => x.metric === "price"); assert.equal(o.kind, "user_supplied"); assert.equal(o.source, "My export"); assert.equal(o.marketplace, "CA");
  assert.ok(s.t.observations.find((x) => x.metric === "reviews" && x.value_num === 1200));
  assert.ok(!s.t.observations.some((x) => x.kind === "observed"));
  await importProducts(s, CSV.replace("19.99", "17.99"), { marketplace: "CA", source_label: "My export", as_of: "2026-10-08T00:00:00Z" });
  assert.equal(s.t.products.length, 2); const p = s.product("B0ABCDEFGH", "CA");
  assert.equal(s.observations(p.id).filter((x) => x.metric === "price").length, 2); assert.equal(latest(s, p.id).price.value_num, 17.99);
  await importProducts(s, CSV, { marketplace: "US", source_label: "x" }); assert.equal(s.t.products.length, 4);
});
test("imports cannot claim 'observed' and need an ASIN", async () => {
  await assert.rejects(importProducts(mk(), "Title,Price\nx,1\n", { marketplace: "CA", source_label: "a" }), /ASIN/);
  await assert.rejects(importProducts(mk(), CSV, { marketplace: "CA", source_label: "a", kind: "observed" }));
});
test("keyword and ad imports", async () => {
  const s = mk();
  const k = await importKeywords(s, "Keyword,Search Volume,Competition\nSilicone  Spatula,1.5K,230\n,5,5\n", { marketplace: "US", source_label: "kw" });
  assert.equal(k.ok, 1); assert.equal(k.skipped, 1); assert.equal(s.t.keywords[0].phrase, "silicone spatula"); assert.equal(s.t.keyword_observations.find((o) => o.metric === "search_volume").value_num, 1500);
  const a = await importAdTerms(s, "Customer Search Term,Impressions,Clicks,Spend,7 Day Total Sales,7 Day Total Orders (#)\nspatula,1000,40,25.5,0,0\n", { marketplace: "US", source_label: "ads" });
  assert.equal(a.ok, 1); assert.equal(s.t.ad_terms[0].spend, 25.5);
});
test("product filters: missing values never pass", async () => {
  const s = mk(); await importProducts(s, CSV, { marketplace: "CA", source_label: "x" });
  assert.equal(productRows(s, { price_max: 25 }).length, 1);       // Gadget has no price, so it is excluded
  assert.equal(productRows(s, { reviews_max: 100 }).length, 1);
  assert.equal(productRows(s, {}).length, 2);
  assert.equal(productRows(s, { q: "widget" })[0].p.title, "Widget");
});
test("saved calc stores a calculated margin with its verification status", async () => {
  const s = mk(); await importProducts(s, CSV, { marketplace: "US", source_label: "x" });
  const p = s.product("B0ABCDEFGH", "US");
  await saveCalc(s, { marketplace: "US", inputs: { marketplace: "US", sell_price: 30, supplier_cost: 5, fba_fee: 5 }, product_id: p.id });
  const m = latest(s, p.id).est_margin_pct; assert.equal(m.kind, "calculated"); assert.match(m.source, /verified: NO/);
  assert.equal(productRows(s, { margin_min: 10 }).length, 1);
});
test("alerts: threshold, change, no duplicates, unwatched ignored", async () => {
  const s = mk(); await importProducts(s, "ASIN,Price\nB0ABCDEFGH,20\nB0ZZZZZZZZ,5\n", { marketplace: "US", source_label: "s", as_of: "2026-10-01T00:00:00Z" });
  const wl = await s.add("watchlists", { name: "w" }); await s.add("watchlist_items", { watchlist_id: wl.id, product_id: s.product("B0ABCDEFGH", "US").id });
  await s.add("alert_rules", { watchlist_id: wl.id, metric: "price", op: "lt", threshold: 18, active: true });
  await s.add("alert_rules", { watchlist_id: wl.id, metric: "price", op: "change_pct_gt", threshold: 10, active: true });
  assert.equal(await evaluate(s), 0);
  await importProducts(s, "ASIN,Price\nB0ABCDEFGH,16\nB0ZZZZZZZZ,1\n", { marketplace: "US", source_label: "s", as_of: "2026-10-08T00:00:00Z" });
  assert.equal(await evaluate(s), 2); assert.equal(await evaluate(s), 0);
  assert.ok(s.t.alerts.some((a) => /-20\.0%/.test(a.message))); assert.equal(s.t.alerts.every((a) => a.product_id === s.product("B0ABCDEFGH", "US").id), true);
});

test("keyword clustering", () => {
  assert.equal(stem("spatulas"), stem("spatula")); assert.equal(stem("batteries"), "battery"); assert.equal(stem("gas"), "gas");
  const cl = clusterKeywords([{ phrase: "silicone spatula", volume: 1000 }, { phrase: "silicone spatulas set", volume: 400 }, { phrase: "wooden spoon", volume: 700 }, { phrase: "spatula silicone heat resistant", volume: 200 }], 0.4);
  assert.equal(cl[0].label, "silicone spatula"); assert.equal(cl[0].size, 3); assert.equal(cl[0].total_volume, 1600);
  assert.ok(cl.some((g) => g.label === "wooden spoon" && g.size === 1)); assert.deepEqual(clusterKeywords([]), []);
});
test("listing audit", () => {
  assert.ok(containsPhrase("Non-stick silicone spatulas for baking", "silicone spatula")); assert.ok(!containsPhrase("silicone baking mat", "silicone spatula"));
  const r = readability("The cat sat on the mat. The dog ran to the log."); assert.equal(r.sentences, 2); assert.equal(r.words, 12); assert.ok(r.flesch > 90); assert.equal(readability("").flesch, null);
  const a = auditListing("Acme Silicone Spatula Set, 6 Piece", ["Heat resistant to 450F", "Dishwasher safe"], [{ phrase: "silicone spatula", volume: 5000 }, { phrase: "baking tools", volume: 900 }], "", { title_max: 40 });
  assert.equal(a.coverage[0].status, "exact phrase"); assert.equal(a.coverage[1].status, "missing"); assert.equal(a.coverage_pct, 50);
  assert.ok(a.findings.some((f) => f.area === "Keywords" && /baking tools/.test(f.message))); assert.ok(a.findings.some((f) => f.area === "Bullets"));
  const b = auditListing("Spatula ".repeat(40), ["best seller guaranteed"], [{ phrase: "spatula", volume: 10 }]);
  assert.ok(b.findings.some((f) => f.level === "problem" && f.area === "Title")); assert.ok(b.findings.some((f) => f.area === "Policy")); assert.ok(b.findings.some((f) => /times/.test(f.message)));
  assert.equal(titleSkeleton("Acme", "Silicone Spatula Set", ["6 Piece", "Heat Resistant", "Dishwasher Safe"], 45), "Acme Silicone Spatula Set, 6 Piece");
});

test("Supabase adapter: pagination, user_id stripped, errors surface", async () => {
  const calls = []; const rows = Array.from({ length: 1500 }, (_, i) => ({ id: "r" + i, user_id: "u", asin: "A" + i }));
  const client = { from: (t) => ({
    select: () => ({ range: async (a, b) => ({ data: rows.slice(a, b + 1), error: null }) }),
    insert: async (r) => { calls.push(["insert", t, r.length]); return { error: null }; },
    update: (p) => ({ eq: async (c, id) => { calls.push(["update", t, id, p]); return { error: null }; } }),
    delete: () => ({ eq: async (c, id) => { calls.push(["delete", t, id]); return { error: t === "bad" ? { message: "denied" } : null }; } }) }) };
  const a = new SupabaseAdapter(client); const got = await a.fetchAll("products");
  assert.equal(got.length, 1500); assert.ok(!("user_id" in got[0]));
  await a.insert("products", [{ id: "x" }]); await a.update("products", "x", { title: "t" });
  assert.deepEqual(calls, [["insert", "products", 1], ["update", "products", "x", { title: "t" }]]);
  await assert.rejects(a.remove("bad", "x"), /denied/);
});
test("Store.load normalises timestamps and indexes observations", async () => {
  const ad = { fetchAll: async (t) => (t === "products" ? [{ id: "p", asin: "B0ABCDEFGH", marketplace: "CA", first_seen: "2026-10-01T00:00:00+00:00" }] : t === "observations" ? [{ id: "o", product_id: "p", metric: "price", value_num: 5, as_of: "2026-10-01T00:00:00.000+00:00" }] : []) };
  const s = new Store(ad); await s.load();
  assert.equal(s.t.products[0].first_seen, "2026-10-01T00:00:00Z"); assert.equal(s.observations("p").length, 1);
});
