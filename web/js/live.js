// Live provider integrations. The browser never holds a provider key: it asks your Supabase Edge Functions
// (supabase/functions), which hold the secrets and only answer a logged-in user. Everything stored from them is
// labelled with the provider, the time, and a kind: 'observed' = a value the provider returned as a measurement,
// 'estimated' = a provider's model/estimate (search volume, fee estimate, units sold). Missing values stay missing.
import { now } from "./util.js";

export async function callFn(client, name, body) {
  if (!client || !client.functions) throw new Error("Live data needs your account (cloud mode).");
  const { data, error } = await client.functions.invoke(name, { body });
  if (error) {
    let msg = error.message || "Request failed.";
    try { if (error.context && typeof error.context.json === "function") { const j = await error.context.json(); if (j && j.error) msg = j.error; } } catch (_) { /* keep generic message */ }
    if (/not found|404|Failed to send a request/i.test(msg) && !/Keepa|DataForSEO|Amazon/.test(msg)) msg = `The '${name}' function is not deployed or unreachable (see docs/06). ${msg}`;
    throw new Error(msg);
  }
  if (data && data.error) throw new Error(data.error);
  return data;
}
export const fetchStatus = (client) => callFn(client, "status", {});

const has = (store, pid, metric, as_of, source) => store.observations(pid).some((o) => o.metric === metric && o.as_of === as_of && o.source === source);
async function addObs(store, rows) { if (rows.length) await store.addMany("observations", rows); return rows.length; }

// Keepa product response -> products + observations (+ history points, de-duplicated by metric/time/source)
export async function ingestKeepa(store, marketplace, resp) {
  const src = `${resp.source} (${marketplace})`, stamp = resp.as_of || now(), out = { products: 0, observations: 0, items: [] };
  for (const it of resp.items || []) {
    let p = store.product(it.asin, marketplace);
    if (!p) { p = await store.add("products", { asin: it.asin, marketplace, title: it.title || "", brand: it.brand || "", category: it.category || "", first_seen: stamp }); out.products++; }
    else { const patch = {}; for (const f of ["title", "brand", "category"]) if (!p[f] && it[f]) patch[f] = it[f]; if (Object.keys(patch).length) await store.update("products", p.id, patch); }
    const rows = [], add = (metric, v, unit, kind, as_of = stamp, source = src) => { if (v == null || !isFinite(v) || has(store, p.id, metric, as_of, source)) return; rows.push({ product_id: p.id, metric, value_num: v, value_text: null, unit, kind, source, as_of, marketplace, import_id: null }); };
    add("price", it.price, "currency", "observed"); add("bsr", it.bsr, "rank", "observed"); add("rating", it.rating, "stars", "observed"); add("reviews", it.reviews, "count", "observed");
    add("monthly_units", it.monthly_sold, "units", "estimated", stamp, `${src}: 'bought in past month' figure, provider-reported`);
    for (const pt of (it.history && it.history.price) || []) add("price", pt.value, "currency", "observed", pt.as_of, `${src} history`);
    for (const pt of (it.history && it.history.bsr) || []) add("bsr", pt.value, "rank", "observed", pt.as_of, `${src} history`);
    out.observations += await addObs(store, rows); out.items.push(it.asin);
  }
  return out;
}

// SP-API catalog + fee estimate
export async function ingestSpCatalog(store, marketplace, resp) {
  const src = `${resp.source} (${marketplace})`, stamp = resp.as_of || now(); let n = 0;
  for (const it of resp.items || []) {
    let p = store.product(it.asin, marketplace);
    if (!p) p = await store.add("products", { asin: it.asin, marketplace, title: it.title || "", brand: it.brand || "", category: it.category || "", first_seen: stamp });
    else { const patch = {}; for (const f of ["title", "brand", "category"]) if (!p[f] && it[f]) patch[f] = it[f]; if (Object.keys(patch).length) await store.update("products", p.id, patch); }
    if (it.bsr != null) n += await addObs(store, [{ product_id: p.id, metric: "bsr", value_num: it.bsr, value_text: null, unit: "rank", kind: "observed", source: src, as_of: stamp, marketplace, import_id: null }]);
  }
  return n;
}
export async function ingestSpFees(store, marketplace, resp) {
  const p = store.product(resp.asin, marketplace); if (!p) throw new Error("Product not found.");
  const src = `${resp.source} at price ${resp.price}`, stamp = resp.as_of || now(), rows = [];
  for (const [m, v] of [["referral_fee", resp.fees && resp.fees.referral_fee], ["fba_fee", resp.fees && resp.fees.fba_fee]]) if (v != null) rows.push({ product_id: p.id, metric: m, value_num: v, value_text: null, unit: "currency", kind: "estimated", source: src, as_of: stamp, marketplace, import_id: null });
  return addObs(store, rows);
}

// DataForSEO keyword volumes / ranked keywords -> keywords + keyword_observations. A null volume is stored as nothing.
export async function ingestVolumes(store, marketplace, resp) {
  const src = `${resp.source} (${marketplace}, provider estimate)`, stamp = resp.as_of || now(), rows = []; let kept = 0, empty = 0;
  for (const it of resp.items || []) {
    if (!it.keyword) continue;
    if (it.search_volume == null && !(resp.asin && it.rank != null)) { empty++; continue; }
    let k = store.t.keywords.find((x) => x.marketplace === marketplace && x.phrase === it.keyword);
    if (!k) k = await store.add("keywords", { marketplace, phrase: it.keyword });
    if (it.search_volume != null) { rows.push({ keyword_id: k.id, metric: "search_volume", value_num: it.search_volume, asin: null, kind: "estimated", source: src, as_of: stamp, import_id: null }); kept++; } else empty++;
    if (resp.asin && it.rank != null) rows.push({ keyword_id: k.id, metric: "rank", value_num: it.rank, asin: resp.asin, kind: "observed", source: `${resp.source} ranked keywords (${marketplace})`, as_of: stamp, import_id: null });
  }
  if (rows.length) await store.addMany("keyword_observations", rows);
  return { kept, no_data: empty };
}
