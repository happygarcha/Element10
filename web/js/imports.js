// CSV import for exports you make yourself. Imported values are stored as user_supplied (or sample in demo mode)
// with the source label you give. The app never presents imported numbers as its own observations.
import { parseCSV } from "./csv.js";
import { now } from "./util.js";

export const PRODUCT_ALIASES = {
  asin: ["asin", "child asin", "product asin"], title: ["title", "product name", "product details", "name"], brand: ["brand", "manufacturer"],
  category: ["category", "main category", "product category"], price: ["price", "buy box price", "current price", "price cad", "price usd"],
  rating: ["rating", "ratings", "review rating", "avg rating", "stars"], reviews: ["reviews", "review count", "number of reviews", "ratings count", "rating count"],
  bsr: ["bsr", "best sellers rank", "sales rank", "rank", "best seller rank"],
  monthly_units: ["monthly units", "parent level sales", "asin sales", "monthly sales", "units sold", "sales"],
  monthly_revenue: ["monthly revenue", "parent level revenue", "asin revenue", "revenue"], seller_count: ["sellers", "seller count", "number of sellers", "offers"],
  fba_fee: ["fba fee", "fba fees", "fulfillment fee", "fulfilment fee"], referral_fee: ["referral fee", "referral fees"], weight_kg: ["weight kg", "weight (kg)", "weight"],
};
export const KEYWORD_ALIASES = {
  phrase: ["keyword", "keyword phrase", "phrase", "search term", "search query"],
  search_volume: ["search volume", "volume", "monthly search volume", "searches", "est. search volume"],
  competition: ["competition", "competing products", "competitors", "keyword difficulty", "difficulty"],
  rank: ["rank", "position", "organic rank", "organic position"], asin: ["asin"],
};
export const AD_ALIASES = {
  term: ["customer search term", "search term", "keyword", "targeting"], campaign: ["campaign name", "campaign"], match_type: ["match type"],
  impressions: ["impressions"], clicks: ["clicks"], spend: ["spend", "cost"], sales: ["7 day total sales", "14 day total sales", "total sales", "sales"],
  orders: ["7 day total orders (#)", "7 day total orders", "14 day total orders (#)", "total orders", "orders"],
};
const UNITS = { price: "currency", rating: "stars", reviews: "count", bsr: "rank", monthly_units: "units", monthly_revenue: "currency", seller_count: "count", fba_fee: "currency", referral_fee: "currency", weight_kg: "kg" };
const NUMERIC = Object.keys(UNITS);
const ASIN_RE = /^[A-Z0-9]{10}$/;

export function parseNumber(raw) {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim().replace(/,/g, "").replace(/\$/g, "").replace(/^(CA|US)\s*/i, "").trim();
  if (!s || ["n/a", "na", "-", "--", "none", "null", "nan"].includes(s.toLowerCase())) return null;
  let mult = 1; const last = s.slice(-1).toLowerCase();
  if (last === "k" || last === "m") { mult = last === "k" ? 1e3 : 1e6; s = s.slice(0, -1); }
  s = s.replace(/%/g, "");
  if (!/^-?\d*\.?\d+(e-?\d+)?$/i.test(s)) return null;
  return Number(s) * mult;
}

export function detectMapping(headers, aliases) {
  const norm = new Map(headers.map((h) => [h.trim().toLowerCase().replace(/\s+/g, " "), h]));
  const out = {};
  for (const [field, names] of Object.entries(aliases)) for (const n of names) if (norm.has(n)) { out[field] = norm.get(n); break; }
  return out;
}

async function recordImport(store, o) {
  return store.add("imports", { filename: o.filename, kind: o.kind, source_label: o.source_label, marketplace: o.marketplace, uploaded_at: now(), rows_ok: 0, rows_skipped: 0, notes: o.notes || "" });
}

export async function importProducts(store, text, { marketplace, source_label, filename = "upload.csv", as_of = null, mapping = null, kind = "user_supplied" }) {
  if (!["CA", "US"].includes(marketplace)) throw new Error("marketplace must be CA or US");
  if (!["user_supplied", "sample"].includes(kind)) throw new Error("imports can only be user_supplied or sample");
  const { headers, rows } = parseCSV(text);
  const map = mapping && Object.keys(mapping).length ? mapping : detectMapping(headers, PRODUCT_ALIASES);
  if (!map.asin) throw new Error("No ASIN column found. Map one in the import screen.");
  const stamp = as_of || now();
  const imp = await recordImport(store, { filename, kind: "products", source_label, marketplace });
  const res = { import_id: imp.id, ok: 0, skipped: 0, problems: [] }, obsRows = [];
  for (let n = 0; n < rows.length; n++) {
    const r = rows[n], asin = (r[map.asin] || "").trim().toUpperCase();
    if (!ASIN_RE.test(asin)) { res.skipped++; res.problems.push(`row ${n + 2}: '${asin}' is not a valid ASIN`); continue; }
    const get = (f) => (map[f] ? r[map[f]] || "" : "");
    let p = store.product(asin, marketplace);
    if (!p) p = await store.add("products", { asin, marketplace, title: get("title"), brand: get("brand"), category: get("category"), first_seen: stamp });
    else { const patch = {}; for (const f of ["title", "brand", "category"]) if (get(f)) patch[f] = get(f); if (Object.keys(patch).length) await store.update("products", p.id, patch); }
    let any = false;
    for (const f of NUMERIC) {
      if (!map[f]) continue; const v = parseNumber(r[map[f]]); if (v === null) continue;
      obsRows.push({ product_id: p.id, metric: f, value_num: v, value_text: null, unit: UNITS[f], kind, source: source_label, as_of: stamp, marketplace, import_id: imp.id }); any = true;
    }
    res.ok++; if (!any) res.problems.push(`row ${n + 2}: ${asin} has no numeric metrics`);
  }
  await store.addMany("observations", obsRows);
  await store.update("imports", imp.id, { rows_ok: res.ok, rows_skipped: res.skipped });
  return res;
}

export async function importKeywords(store, text, { marketplace, source_label, filename = "keywords.csv", as_of = null, mapping = null, kind = "user_supplied" }) {
  if (!["CA", "US"].includes(marketplace)) throw new Error("marketplace must be CA or US");
  if (!["user_supplied", "sample"].includes(kind)) throw new Error("imports can only be user_supplied or sample");
  const { headers, rows } = parseCSV(text);
  const map = mapping && Object.keys(mapping).length ? mapping : detectMapping(headers, KEYWORD_ALIASES);
  if (!map.phrase) throw new Error("No keyword column found. Map one in the import screen.");
  const stamp = as_of || now(), imp = await recordImport(store, { filename, kind: "keywords", source_label, marketplace });
  const res = { import_id: imp.id, ok: 0, skipped: 0, problems: [] }, obsRows = [];
  for (let n = 0; n < rows.length; n++) {
    const phrase = (rows[n][map.phrase] || "").trim().toLowerCase().replace(/\s+/g, " ");
    if (!phrase) { res.skipped++; res.problems.push(`row ${n + 2}: empty keyword`); continue; }
    let k = store.t.keywords.find((x) => x.marketplace === marketplace && x.phrase === phrase);
    if (!k) k = await store.add("keywords", { marketplace, phrase });
    const asin = (map.asin ? rows[n][map.asin] || "" : "").toUpperCase() || null;
    for (const f of ["search_volume", "competition", "rank"]) {
      if (!map[f]) continue; const v = parseNumber(rows[n][map[f]]); if (v === null) continue;
      obsRows.push({ keyword_id: k.id, metric: f, value_num: v, asin: f === "rank" ? asin : null, kind, source: source_label, as_of: stamp, import_id: imp.id });
    }
    res.ok++;
  }
  await store.addMany("keyword_observations", obsRows);
  await store.update("imports", imp.id, { rows_ok: res.ok, rows_skipped: res.skipped });
  return res;
}

export async function importAdTerms(store, text, { marketplace, source_label, filename = "ads.csv", as_of = null, mapping = null, kind = "user_supplied" }) {
  const { headers, rows } = parseCSV(text);
  const map = mapping && Object.keys(mapping).length ? mapping : detectMapping(headers, AD_ALIASES);
  if (!map.term) throw new Error("No search-term column found.");
  const stamp = as_of || now(), imp = await recordImport(store, { filename, kind: "ads", source_label, marketplace });
  const out = []; let skipped = 0;
  for (const r of rows) {
    const term = (r[map.term] || "").trim().toLowerCase(); if (!term) { skipped++; continue; }
    const g = (f) => (map[f] ? parseNumber(r[map[f]]) : null);
    out.push({ import_id: imp.id, marketplace, campaign: map.campaign ? r[map.campaign] : "", term, match_type: map.match_type ? r[map.match_type] : "", impressions: g("impressions") ?? 0, clicks: g("clicks") ?? 0, spend: g("spend") ?? 0, sales: g("sales") ?? 0, orders: g("orders") ?? 0, as_of: stamp, source: source_label, kind });
  }
  await store.addMany("ad_terms", out);
  await store.update("imports", imp.id, { rows_ok: out.length, rows_skipped: skipped });
  return { import_id: imp.id, ok: out.length, skipped, problems: [] };
}

// ---- Niche reports (for example an export from Amazon's Product Opportunity Explorer that you downloaded from your own Seller Central).
// Column names are not assumed: the name column is detected (or chosen) and every mostly-numeric column becomes a metric, keeping the
// header text as its label. Nothing is renamed to a metric we cannot vouch for; values are user_supplied from the source label you give.
export const NICHE_NAME_ALIASES = ["niche", "niche name", "niche title", "name", "title", "search term", "keyword", "product group", "category"];
export const metricKey = (h) => String(h).trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
export function analyseNicheColumns(headers, rows) {
  const norm = new Map(headers.map((h) => [h.trim().toLowerCase().replace(/\s+/g, " "), h]));
  let nameCol = null; for (const n of NICHE_NAME_ALIASES) if (norm.has(n)) { nameCol = norm.get(n); break; }
  if (!nameCol) nameCol = headers.find((h) => rows.slice(0, 20).some((r) => (r[h] || "").trim() && parseNumber(r[h]) === null)) || headers[0];
  const metricCols = headers.filter((h) => h !== nameCol && (() => { const vals = rows.map((r) => (r[h] || "").trim()).filter(Boolean); return vals.length > 0 && vals.filter((v) => parseNumber(v) !== null).length / vals.length >= 0.6; })());
  return { nameCol, metricCols };
}
export async function importNiches(store, text, { marketplace, source_label, period = "", filename = "niches.csv", as_of = null, mapping = null, kind = "user_supplied" }) {
  if (!["CA", "US"].includes(marketplace)) throw new Error("marketplace must be CA or US");
  if (!["user_supplied", "sample"].includes(kind)) throw new Error("imports can only be user_supplied or sample");
  const { headers, rows } = parseCSV(text); if (!rows.length) throw new Error("The file has no data rows.");
  const auto = analyseNicheColumns(headers, rows), nameCol = (mapping && mapping.nameCol) || auto.nameCol, metricCols = (mapping && mapping.metricCols) || auto.metricCols;
  if (!headers.includes(nameCol)) throw new Error("Name column not found in the file.");
  const stamp = as_of || now(), imp = await recordImport(store, { filename, kind: "niches", source_label, marketplace }), out = []; let skipped = 0;
  for (const r of rows) {
    const name = (r[nameCol] || "").trim(); if (!name) { skipped++; continue; }
    const metrics = {}, units = {}; for (const h of metricCols) { const v = parseNumber(r[h]); if (v !== null) { metrics[metricKey(h)] = v; units[metricKey(h)] = h; } }
    out.push({ marketplace, name, period, metrics, labels: units, raw: Object.fromEntries(headers.map((h) => [h, r[h]])), as_of: stamp, source: source_label, kind, import_id: imp.id });
  }
  await store.addMany("niches", out); await store.update("imports", imp.id, { rows_ok: out.length, rows_skipped: skipped });
  return { import_id: imp.id, ok: out.length, skipped, nameCol, metricCols };
}
