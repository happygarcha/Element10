import { analyse } from "./ads.js";
import { evaluate, OPS } from "./alerts.js";
import { compute, sensitivity, CalcError, DEFAULT_INPUTS } from "./calc/profit.js";
import { plan } from "./calc/inventory.js";
import { DEFAULT_PARAMS, DEFAULT_WEIGHTS, EXPLAIN, opportunity } from "./calc/score.js";
import { auditListing, clusterKeywords, titleSkeleton } from "./calc/text.js";
import { AD_ALIASES, KEYWORD_ALIASES, PRODUCT_ALIASES, detectMapping, importAdTerms, importKeywords, importProducts } from "./imports.js";
import { parseCSV } from "./csv.js";
import { providers } from "./providers.js";
import { feeProfile, fxFor, fxRates, latest, productRows, saveCalc, saveFeeProfile, scoreInputs, scoring, series } from "./services.js";
import { TABLES } from "./store.js";
import { download, h, kindChip, mpChip, raw, spark, toCSV } from "./ui.js";
import { CURRENCY, fnum, money, now, num } from "./util.js";
import { keywordLookup, liveCard, liveStatus, securityCard, snapshot, snapshotHtml } from "./views2.js";

const cell = (lat, key, d = 0) => { const o = lat[key]; return o && o.value_num != null ? h`<span title="${o.kind.replace("_", " ")} · ${o.source} · ${(o.as_of || "").slice(0, 10)}">${num(o.value_num, d)}</span>` : raw("–"); };
const short = (s, n = 60) => ((s || "").length > n ? s.slice(0, n) + "…" : s || "");
const empty = (msg) => h`<div class="empty">${raw(msg)}</div>`;
const field = (name, label, value = "", attrs = "") => h`<div><label>${label}</label><input type="number" step="any" min="0" name="${name}" value="${value ?? ""}" ${raw(attrs)}></div>`;
const formData = (form) => Object.fromEntries(new FormData(form).entries());
const sel = (name, label, opts, cur) => h`<div><label>${label}</label><select name="${name}">${opts.map(([v, l]) => h`<option value="${v}" ${raw(String(cur) === String(v) ? "selected" : "")}>${l}</option>`)}</select></div>`;

/* ---------------- home ---------------- */
export async function home({ store, mode }) {
  const rows = productRows(store), top = rows.slice(0, 5), t = store.t;
  const unverified = ["CA", "US"].filter((m) => !feeProfile(store, m).verified_at);
  const imps = [...t.imports].sort((a, b) => (a.uploaded_at < b.uploaded_at ? 1 : -1)).slice(0, 5);
  return { html: h`<h2>Dashboard</h2><p class="sub">Your private Amazon.ca and Amazon.com research workbench.</p>
  <div class="grid g4"><div class="card stat"><b>${rows.length}</b><span>products</span></div><div class="card stat"><b>${new Set(t.watchlist_items.map((i) => i.product_id)).size}</b><span>watched</span></div>
  <div class="card stat"><b>${t.keywords.length}</b><span>keywords</span></div><div class="card stat"><b>${t.alerts.filter((a) => !a.acknowledged).length}</b><span>open alerts</span></div></div>
  ${mode === "demo" ? "" : h`<details class="card" style="margin-top:12px" ${raw(rows.length && fxRates(store).USD_CAD && !unverified.length ? "" : "open")}><summary><b>Getting started</b> (${[rows.length > 0, !!fxRates(store).USD_CAD, !unverified.length].filter(Boolean).length} of 3 done)</summary>
  <ol><li class="${rows.length ? "pill-ok" : ""}">${rows.length ? "✔ " : ""}Bring in products: <a href="#/import">import a CSV</a>, or connect a data source under <a href="#/connections">Connections</a>.</li>
  <li class="${fxRates(store).USD_CAD ? "pill-ok" : ""}">${fxRates(store).USD_CAD ? "✔ " : ""}Enter today's USD→CAD rate in <a href="#/settings">Settings</a> (never guessed).</li>
  <li class="${unverified.length ? "" : "pill-ok"}">${unverified.length ? "" : "✔ "}Verify the CA and US fee profiles against Seller Central in <a href="#/settings">Settings</a>.</li></ol>
  <p class="sub">What Element10 can and cannot do compared with Helium 10 is listed honestly in the <a href="#/parity">parity matrix</a>.</p></details>`}
  ${!fxRates(store).USD_CAD ? h`<div class="notice warn">No USD to CAD rate is set. Calculations that convert currency stop with an error until you add one in <a href="#/settings">Settings</a>. Rates are never guessed.</div>` : ""}
  ${unverified.length && mode !== "demo" ? h`<div class="notice warn">Fee profiles for ${unverified.join(" and ")} are unverified starter values. Check them against Seller Central's FBA Revenue Calculator in <a href="#/settings">Settings</a>.</div>` : ""}
  ${rows.length === 0 ? h`<div class="empty" style="margin-top:14px"><b>Nothing here yet.</b><br>Import a product CSV you exported from Seller Central or another tool, or switch to demo mode to try every screen with fictional data.<br><br><a class="btn" href="#/import">Import a CSV</a></div>` : h`
  <h3>Highest opportunity scores</h3><div class="card wrap"><table><tr><th>Product</th><th>Market</th><th class="n">Price</th><th class="n">Rank</th><th class="n">Reviews</th><th class="n">Score</th></tr>
  ${top.map((r) => h`<tr><td><a href="#/products/${r.p.id}">${short(r.p.title || r.p.asin, 50)}</a></td><td>${mpChip(r.p.marketplace)}</td><td class="n">${cell(r.lat, "price", 2)}</td><td class="n">${cell(r.lat, "bsr")}</td><td class="n">${cell(r.lat, "reviews")}</td><td class="n"><span class="score">${r.score ?? "–"}</span></td></tr>`)}</table></div>
  <p class="sub">Scores use only the factors your data supports. Open a product to see which ones.</p>`}
  <h3>Recent imports</h3>${imps.length ? h`<div class="card wrap"><table><tr><th>When</th><th>File</th><th>Type</th><th>Market</th><th>Source label</th><th class="n">Rows</th></tr>${imps.map((i) => h`<tr><td>${i.uploaded_at.slice(0, 16)}</td><td>${i.filename}</td><td>${i.kind}</td><td>${i.marketplace}</td><td>${short(i.source_label, 40)}</td><td class="n">${i.rows_ok}${i.rows_skipped ? ` (+${i.rows_skipped} skipped)` : ""}</td></tr>`)}</table></div>` : h`<p class="sub">No imports yet.</p>`}` };
}

/* ---------------- products ---------------- */
export async function products({ store, q, refresh }) {
  const saved = store.setting("saved_searches", []);
  const f = {}; for (const k of ["marketplace", "q", "category", "sort", "dir"]) if (q.get(k)) f[k] = q.get(k);
  for (const k of ["price_min", "price_max", "reviews_max", "rating_max", "rank_min", "rank_max", "units_min", "margin_min"]) f[k] = fnum(q.get(k));
  const rows = productRows(store, f), g = (k) => q.get(k) || "";
  const html = h`<h2>Products</h2><p class="sub">${rows.length} shown. Numbers keep their source and date: hover any value. A missing value never passes a filter on that value.</p>
  <form class="card filters" id="flt"><div class="row">
  <div><label>Search</label><input type="search" name="q" value="${g("q")}" placeholder="title, ASIN, brand"></div>
  ${sel("marketplace", "Marketplace", [["", "Both"], ["CA", "CA"], ["US", "US"]], g("marketplace"))}
  <div><label>Category contains</label><input type="text" name="category" value="${g("category")}"></div>
  ${field("price_min", "Min price", g("price_min"))}${field("price_max", "Max price", g("price_max"))}${field("reviews_max", "Max reviews", g("reviews_max"))}
  ${field("rating_max", "Max rating", g("rating_max"))}${field("rank_max", "Rank at most", g("rank_max"))}${field("rank_min", "Rank at least", g("rank_min"))}
  ${field("units_min", "Min monthly units", g("units_min"))}${field("margin_min", "Min est. margin %", g("margin_min"))}
  ${sel("sort", "Sort by", [["score", "Opportunity score"], ["price", "Price"], ["bsr", "Rank"], ["reviews", "Reviews"], ["rating", "Rating"], ["monthly_units", "Monthly units"], ["title", "Title"]], g("sort") || "score")}</div>
  <p style="margin:10px 0 0"><button>Apply</button> <a class="btn ghost" href="#/products">Reset</a> <button type="button" class="ghost" id="savesearch">Save this search</button></p></form>
  ${saved.length ? h`<p class="sub">Saved searches: ${saved.map((x, i) => h`<a href="#/products${x.qs ? "?" + x.qs : ""}">${x.name}</a> <button class="link" data-rm="${i}" aria-label="Delete saved search ${x.name}">×</button> `)}</p>` : ""}
  ${!rows.length ? empty('No products match. <a href="#/import">Import a CSV</a> or loosen the filters.') : h`<p class="noprint"><button id="cmp">Compare selected</button> <span class="sub">tick up to 8 products</span></p>
  <div class="card wrap"><table><tr><th></th><th>Product</th><th>Market</th><th class="n">Price</th><th class="n">Rating</th><th class="n">Reviews</th><th class="n">Rank</th><th class="n">Units/mo</th><th class="n">Margin %</th><th class="n">Score</th></tr>
  ${rows.map((r) => h`<tr><td><input type="checkbox" class="pick" value="${r.p.id}" aria-label="Select ${r.p.asin}"></td><td><a href="#/products/${r.p.id}">${short(r.p.title || r.p.asin, 48)}</a><br><small class="chip">${r.p.asin}</small></td><td>${mpChip(r.p.marketplace)}</td>
  <td class="n">${cell(r.lat, "price", 2)}</td><td class="n">${cell(r.lat, "rating", 1)}</td><td class="n">${cell(r.lat, "reviews")}</td><td class="n">${cell(r.lat, "bsr")}</td>
  <td class="n">${cell(r.lat, "monthly_units")}${r.lat.monthly_units ? h`<br>${kindChip(r.lat.monthly_units.kind)}` : ""}</td><td class="n">${cell(r.lat, "est_margin_pct", 1)}</td>
  <td class="n"><span class="score" title="${r.used} of ${r.total} factors had data">${r.score ?? "–"}</span></td></tr>`)}</table></div>`}`;
  return { html, after(root) {
    root.querySelector("#flt").addEventListener("submit", (e) => { e.preventDefault(); const d = formData(e.target), p = new URLSearchParams(); for (const [k, v] of Object.entries(d)) if (v !== "") p.set(k, v); location.hash = "#/products" + (p.toString() ? "?" + p : ""); });
    root.querySelector("#savesearch").addEventListener("click", async () => { const name = (prompt("Name this search") || "").trim().slice(0, 40); if (!name) return; const qs = q.toString(); await store.setSetting("saved_searches", [...saved.filter((x) => x.name !== name), { name, qs }].slice(-20)); refresh(); });
    root.querySelectorAll("[data-rm]").forEach((b) => b.addEventListener("click", async () => { await store.setSetting("saved_searches", saved.filter((_, i) => i !== Number(b.dataset.rm))); refresh(); }));
    const c = root.querySelector("#cmp"); if (c) c.addEventListener("click", () => { const ids = [...root.querySelectorAll(".pick:checked")].map((x) => x.value).slice(0, 8); location.hash = "#/compare?ids=" + ids.join(","); });
  } };
}

export async function product(ctx) {
  const { store, id, refresh } = ctx;
  const p = store.get("products", id); if (!p) return { html: empty("Product not found.") };
  const live = await liveCard(ctx, p);
  const lat = latest(store, id), [w, par] = scoring(store), sc = opportunity(scoreInputs(lat), w, par);
  const hist = Object.fromEntries(["price", "bsr", "reviews", "rating"].map((m) => [m, series(store, id, m)]));
  const inwl = store.t.watchlist_items.filter((i) => i.product_id === id).map((i) => i.watchlist_id);
  const dec = (k) => (["price", "rating", "est_margin_pct", "fba_fee", "referral_fee"].includes(k) ? 2 : 0);
  const html = h`<h2>${p.title || p.asin}</h2><p class="sub">${mpChip(p.marketplace)} <span class="chip">${p.asin}</span> ${p.brand || ""} ${p.category ? "· " + p.category : ""}</p>
  <div class="grid g2"><div class="card"><h3 style="margin-top:0">Latest numbers</h3><table><tr><th>Metric</th><th class="n">Value</th><th>Type</th><th>Source</th><th>As of</th></tr>
  ${Object.entries(lat).map(([k, o]) => h`<tr><td>${k.replace(/_/g, " ")}</td><td class="n">${num(o.value_num, dec(k))}</td><td>${kindChip(o.kind)}</td><td><small>${short(o.source, 110)}</small></td><td><small>${o.as_of.slice(0, 10)}</small></td></tr>`)}</table>${Object.keys(lat).length ? "" : h`<p class="sub">No numbers yet for this product.</p>`}</div>
  <div class="card"><h3 style="margin-top:0">Opportunity score: <span class="score">${sc.score ?? "–"}</span></h3><p class="sub">Built from ${sc.used} of ${sc.total} factors that have data. ${kindChip("calculated")}</p>
  ${sc.factors.map((f) => h`<div class="line"><span>${f.name.replace("_", " ")}<br><small>${f.detail}${f.score == null ? " (skipped)" : ""}</small></span><span>${f.score == null ? "–" : num(f.score)} <small>× ${num(f.weight)}</small></span></div><small class="sub">${EXPLAIN[f.name]}</small>`)}</div></div>
  <h3>History</h3><div class="grid g2">${[["price", "Price"], ["bsr", "Best Sellers Rank"], ["reviews", "Reviews"], ["rating", "Rating"]].map(([m, l]) => h`<div class="card"><b>${l}</b> ${hist[m].length > 1 ? spark(hist[m]) : ""}
  ${hist[m].length ? h`<table>${hist[m].slice(-6).map((x) => h`<tr><td>${x.as_of.slice(0, 10)}</td><td class="n">${num(x.value_num, m === "price" || m === "rating" ? 2 : 0)}</td><td>${kindChip(x.kind)}</td></tr>`)}</table>${hist[m].length < 2 ? h`<p class="sub">One snapshot so far. History grows with each import.</p>` : ""}` : h`<p class="sub">No data.</p>`}</div>`)}</div>
  <h3>Live data</h3>${live.html}
  <h3>Actions</h3><div class="grid g2"><div class="card"><a class="btn" href="#/calculator?product=${id}">Open in profit calculator</a>
  <div style="margin-top:12px"><label>Add to watchlist</label><select id="wl">${store.t.watchlists.map((x) => h`<option value="${x.id}">${x.name}${inwl.includes(x.id) ? " (already in)" : ""}</option>`)}</select>${store.t.watchlists.length ? h`<p><button id="addwl">Add</button></p>` : h`<p class="sub">Create a watchlist first on the Watchlists page.</p>`}</div></div>
  <div class="card"><label>Add to research project</label><select id="pr">${store.t.projects.map((x) => h`<option value="${x.id}">${x.name}</option>`)}</select>${store.t.projects.length ? h`<p><button id="addpr">Add</button></p>` : h`<p class="sub">Create a project first on the Projects page.</p>`}</div></div>`;
  return { html, after(root) {
    live.after(root);
    const a = root.querySelector("#addwl"); if (a) a.addEventListener("click", async () => { const w = root.querySelector("#wl").value; if (!store.t.watchlist_items.some((i) => i.watchlist_id === w && i.product_id === id)) await store.add("watchlist_items", { watchlist_id: w, product_id: id, added_at: now() }); refresh(); });
    const b = root.querySelector("#addpr"); if (b) b.addEventListener("click", async () => { const pj = root.querySelector("#pr").value; if (!store.t.project_items.some((i) => i.project_id === pj && i.product_id === id)) await store.add("project_items", { project_id: pj, product_id: id, note: "" }); refresh(); });
  } };
}

export async function compare({ store, q }) {
  const ids = (q.get("ids") || "").split(",").filter(Boolean).slice(0, 8), [w, par] = scoring(store);
  const items = ids.map((i) => store.get("products", i)).filter(Boolean).map((p) => { const lat = latest(store, p.id); return { p, lat, sc: opportunity(scoreInputs(lat), w, par) }; });
  if (!items.length) return { html: h`<h2>Compare products</h2>${empty('Pick products on the <a href="#/products">Products</a> page, tick the boxes and press Compare.')}` };
  const rows = [["price", "Price"], ["rating", "Rating"], ["reviews", "Reviews"], ["bsr", "Best Sellers Rank"], ["monthly_units", "Monthly units"], ["monthly_revenue", "Monthly revenue"], ["seller_count", "Sellers"], ["fba_fee", "FBA fee"], ["referral_fee", "Referral fee"], ["est_margin_pct", "Est. margin %"]];
  return { html: h`<h2>Compare products</h2><p class="sub">Side by side. Each value shows its source on hover. Different marketplaces use different currencies and category ranks.</p>
  <div class="card wrap"><table><tr><th></th>${items.map((it) => h`<th><a href="#/products/${it.p.id}">${short(it.p.title || it.p.asin, 30)}</a><br>${mpChip(it.p.marketplace)} <span class="chip">${it.p.asin}</span></th>`)}</tr>
  <tr><td><b>Opportunity score</b></td>${items.map((it) => h`<td><span class="score">${it.sc.score ?? "–"}</span><br><small>${it.sc.used}/${it.sc.total} factors</small></td>`)}</tr>
  ${rows.map(([k, l]) => h`<tr><td>${l}</td>${items.map((it) => h`<td>${cell(it.lat, k, ["price", "rating", "est_margin_pct", "fba_fee", "referral_fee"].includes(k) ? 2 : 0)}${it.lat[k] ? h`<br>${kindChip(it.lat[k].kind)}` : ""}</td>`)}</tr>`)}
  <tr><td>Category</td>${items.map((it) => h`<td>${it.p.category || "–"}</td>`)}</tr><tr><td>Calculator</td>${items.map((it) => h`<td><a href="#/calculator?product=${it.p.id}">Open</a></td>`)}</tr></table></div>` };
}

/* ---------------- import ---------------- */
let pending = null;
export async function importPage({ store, mode, refresh }) {
  const imps = [...store.t.imports].sort((a, b) => (a.uploaded_at < b.uploaded_at ? 1 : -1)).slice(0, 20);
  const recent = imps.length ? h`<div class="card wrap"><table><tr><th>When</th><th>File</th><th>Type</th><th>Market</th><th>Label</th><th class="n">Rows</th></tr>${imps.map((i) => h`<tr><td>${i.uploaded_at.slice(0, 16)}</td><td>${i.filename}</td><td>${i.kind}</td><td>${i.marketplace}</td><td>${short(i.source_label, 40)}</td><td class="n">${i.rows_ok}${i.rows_skipped ? ` (+${i.rows_skipped} skipped)` : ""}</td></tr>`)}</table></div>` : h`<p class="sub">None yet.</p>`;
  if (pending && pending.step === "map") {
    const pv = pending, aliases = pv.kind === "products" ? PRODUCT_ALIASES : KEYWORD_ALIASES;
    return { html: h`<h2>Import CSV</h2><p class="sub">${pv.rows.length} rows found. Check how the columns were matched, fix any that are wrong, then import.</p>
    <form class="card" id="map"><div class="row">${Object.keys(aliases).map((f) => h`<div><label>${f.replace("_", " ")}</label><select name="map_${f}"><option value="">(not in file)</option>${pv.headers.map((x) => h`<option ${raw(pv.mapping[f] === x ? "selected" : "")}>${x}</option>`)}</select></div>`)}</div>
    <h3>First rows</h3><div class="wrap"><table><tr>${pv.headers.map((x) => h`<th>${x}</th>`)}</tr>${pv.rows.slice(0, 5).map((r) => h`<tr>${pv.headers.map((x) => h`<td>${short(r[x], 40)}</td>`)}</tr>`)}</table></div>
    <p><button>Import ${pv.rows.length} rows as ${mode === "demo" ? "sample" : "user supplied"}</button> <button type="button" class="ghost" id="cancel">Cancel</button></p><div id="err" class="pill-bad"></div></form>`,
    after(root) {
      root.querySelector("#cancel").addEventListener("click", () => { pending = null; refresh(); });
      root.querySelector("#map").addEventListener("submit", async (e) => {
        e.preventDefault(); const d = formData(e.target), mapping = {}; for (const [k, v] of Object.entries(d)) if (k.startsWith("map_") && v) mapping[k.slice(4)] = v;
        const opts = { marketplace: pv.marketplace, source_label: pv.source_label, filename: pv.filename, as_of: pv.as_of ? pv.as_of + "T00:00:00Z" : null, mapping, kind: mode === "demo" ? "sample" : "user_supplied" };
        try { const res = await (pv.kind === "products" ? importProducts : importKeywords)(store, pv.text, opts); const created = pv.kind === "products" ? await evaluate(store) : 0; pending = { step: "done", res, created, kind: pv.kind }; refresh(); }
        catch (err) { root.querySelector("#err").textContent = err.message; }
      });
    } };
  }
  if (pending && pending.step === "done") {
    const d = pending; pending = null;
    return { html: h`<h2>Import CSV</h2><div class="notice">Imported <b>${d.res.ok}</b> rows${d.res.skipped ? h`, skipped <b>${d.res.skipped}</b>` : ""}.${d.created ? h` <b>${d.created}</b> new alert(s): <a href="#/alerts">view</a>.` : ""}</div>
    ${d.res.problems.length ? h`<div class="card"><b>Notes</b><ul>${d.res.problems.slice(0, 25).map((x) => h`<li>${x}</li>`)}</ul></div>` : ""}<p><a class="btn" href="#/${d.kind === "products" ? "products" : "keywords"}">View ${d.kind}</a> <a class="btn ghost" href="#/import">Import another</a></p>` };
  }
  return { html: h`<h2>Import CSV</h2><p class="sub">Upload a report you exported yourself (Seller Central, Helium 10, Jungle Scout, Keepa, a spreadsheet). Imported numbers are always labelled <i>user supplied</i> with the label you give them. The file is read in your browser.</p>
  <form class="card" id="up" style="max-width:640px"><label>What is in the file?</label><select name="kind"><option value="products">Products (one row per ASIN)</option><option value="keywords">Keywords (one row per phrase)</option></select>
  <label>Marketplace the numbers are for</label><select name="marketplace"><option value="CA">Amazon.ca (CAD)</option><option value="US">Amazon.com (USD)</option></select>
  <label>Source label (shown next to every number)</label><input type="text" name="source_label" required placeholder="e.g. Helium 10 Xray export, 17 Oct 2026">
  <label>Data date (when the numbers were captured; blank = today)</label><input type="date" name="as_of">
  <label>CSV file (up to 5 MB)</label><input type="file" name="file" accept=".csv,.tsv,text/csv" required><p><button>Preview columns</button></p><div id="err" class="pill-bad"></div></form>
  <h3>Recent imports</h3>${recent}`, after(root) {
    root.querySelector("#up").addEventListener("submit", async (e) => {
      e.preventDefault(); const d = formData(e.target), file = e.target.file.files[0];
      if (!file) return; if (file.size > 5_000_000) { root.querySelector("#err").textContent = "File too large (limit 5 MB)."; return; }
      const text = await file.text(), parsed = parseCSV(text), aliases = d.kind === "products" ? PRODUCT_ALIASES : KEYWORD_ALIASES;
      pending = { step: "map", text, headers: parsed.headers, rows: parsed.rows, mapping: detectMapping(parsed.headers, aliases), kind: d.kind, marketplace: d.marketplace, source_label: d.source_label, as_of: d.as_of, filename: file.name };
      refresh();
    });
  } };
}

/* ---------------- calculator ---------------- */
const CALC_FIELDS = ["sell_price", "supplier_cost", "freight_per_unit", "duties_pct", "other_landed_per_unit", "referral_pct", "referral_min", "fba_fee", "other_amazon_fees", "storage_rate_per_cuft_month", "cubic_ft", "months_in_storage", "acos_pct", "ad_per_unit", "return_rate_pct", "resellable_pct", "return_processing_fee", "refund_admin_fee"];
function buildInputs(store, d, mp) {
  const prof = feeProfile(store, mp).data, i = { ...DEFAULT_INPUTS, marketplace: mp, fx: fxFor(store, mp) };
  for (const k of CALC_FIELDS) { const v = fnum(d[k], null); i[k] = v == null ? (prof[k] ?? DEFAULT_INPUTS[k]) : v; }
  Object.assign(i, { ad_mode: d.ad_mode || "acos", duties_base: d.duties_base || "cost_only", supplier_currency: (d.supplier_currency || "USD").toUpperCase(), freight_currency: (d.freight_currency || "USD").toUpperCase(), lose_fba_fee_on_return: String(d.lose_fba_fee_on_return ?? "1") === "1" });
  return i;
}
function runCalc(store, d) {
  const mp = d.marketplace || "CA", out = {};
  const one = (inputs, m) => { try { const r = compute(inputs); return { ok: true, result: r, verified: !!feeProfile(store, m).verified_at, sens: r.sell_price > 0 ? sensitivity(inputs, [0.8, 0.9, 1, 1.1, 1.2].map((x) => Math.round(r.sell_price * x * 100) / 100)) : [] }; } catch (e) { if (e instanceof CalcError) return { ok: false, error: e.message }; throw e; } };
  out.primary = one(buildInputs(store, d, mp), mp);
  if (d.both === "1") {
    const mp2 = mp === "CA" ? "US" : "CA", d2 = { supplier_cost: d.supplier_cost, supplier_currency: d.supplier_currency, freight_per_unit: d.freight_per_unit, freight_currency: d.freight_currency };
    for (const k of Object.keys(d)) if (k.startsWith("s_")) d2[k.slice(2)] = d[k];
    out.secondary = one(buildInputs(store, d2, mp2), mp2);
  }
  return out;
}
function renderCalc(box, r) {
  box.textContent = ""; if (!r) return;
  if (!r.ok) { const p = document.createElement("p"); p.className = "pill-bad"; p.textContent = r.error; box.appendChild(p); return; }
  const x = r.result, cur = x.currency;
  box.innerHTML = h`<div class="big ${x.profit >= 0 ? "pos" : "neg"}">${money(x.profit, cur)} profit per unit</div><div class="sub">Margin ${x.margin_pct == null ? "–" : x.margin_pct.toFixed(1) + "%"} · ROI ${x.roi_pct == null ? "–" : x.roi_pct.toFixed(0) + "%"} · Break-even price ${money(x.break_even_price, cur)}</div>
  ${r.verified ? "" : h`<div class="notice warn">Fee profile is not marked verified. Confirm each fee in Settings against Seller Central before trusting this result.</div>`}
  ${x.lines.map((l) => h`<div class="line"><span>${l.label}<small> ${l.note}</small></span><span>${money(l.amount, cur)}</span></div>`)}
  <div class="sub" style="margin-top:8px">Price needed for margin: ${Object.entries(x.price_for_margin).map(([m, p]) => `${m}% → ${p == null ? "not reachable" : money(p, cur)}`).join(" · ")}</div>
  ${r.sens.length ? h`<table><tr><th>Price</th><th>Profit</th><th>Margin</th></tr>${r.sens.map((s) => h`<tr><td>${money(s.price, cur)}</td><td>${money(s.profit, cur)}</td><td>${s.margin_pct == null ? "–" : s.margin_pct.toFixed(1) + "%"}</td></tr>`)}</table>` : ""}`.__raw;
}
export async function calculator({ store, q, refresh }) {
  const params = Object.fromEntries(q.entries()), pid = params.product || null, prod = pid ? store.get("products", pid) : null;
  let mp = params.marketplace || "CA";
  if (prod) { mp = prod.marketplace; const lat = latest(store, prod.id); for (const [s, dkey] of [["price", "sell_price"], ["fba_fee", "fba_fee"]]) if (lat[s] && !(dkey in params)) params[dkey] = lat[s].value_num; }
  const prof = feeProfile(store, mp), vals = { ...prof.data, ...params }, fx = fxRates(store), cur = CURRENCY[mp];
  const html = h`<h2>Profit calculator</h2><p class="sub">Per unit, Amazon FBA. Amazon.ca in CAD and Amazon.com in USD, each with its own fee profile. ${kindChip("calculated")} Nothing is estimated for you: fees come from your fee profile, which you confirm against Seller Central.</p>
  ${prod ? h`<div class="notice">Loaded from <a href="#/products/${prod.id}">${prod.title || prod.asin}</a>. Price and FBA fee are the latest values stored for it.</div>` : ""}
  ${!prof.verified_at ? h`<div class="notice warn">The ${mp} fee profile is unverified starter values (referral rate and minimum are common defaults; FBA, storage and return fees start at zero). Enter the real figures from Seller Central's FBA Revenue Calculator and mark the profile verified in <a href="#/settings">Settings</a>.</div>` : ""}
  ${!fx.USD_CAD ? h`<div class="notice warn">No USD→CAD rate set. Costs in USD cannot be converted to CAD until you add one in <a href="#/settings">Settings</a>.</div>` : ""}
  <div class="grid g2" style="align-items:start"><form class="card" id="calc"><div class="row">${sel("marketplace", "Marketplace", [["CA", "Amazon.ca (CAD)"], ["US", "Amazon.com (USD)"]], mp)}${field("sell_price", `Selling price (${cur})`, vals.sell_price)}</div>
  <h3>Cost of goods</h3><div class="row">${field("supplier_cost", "Supplier cost per unit", vals.supplier_cost)}${sel("supplier_currency", "Supplier currency", ["USD", "CAD", "CNY"].map((c) => [c, c]), vals.supplier_currency || "USD")}${field("freight_per_unit", "Freight per unit", vals.freight_per_unit)}${sel("freight_currency", "Freight currency", ["USD", "CAD", "CNY"].map((c) => [c, c]), vals.freight_currency || "USD")}${field("duties_pct", "Duties %", vals.duties_pct)}${sel("duties_base", "Duties charged on", [["cost_only", "Supplier cost"], ["cost_plus_freight", "Cost + freight"]], vals.duties_base || "cost_only")}${field("other_landed_per_unit", `Other landed cost (${cur})`, vals.other_landed_per_unit)}</div>
  <h3>Amazon fees</h3><div class="row">${field("referral_pct", "Referral fee %", vals.referral_pct)}${field("referral_min", "Referral minimum", vals.referral_min)}${field("fba_fee", "FBA fulfilment fee", vals.fba_fee)}${field("other_amazon_fees", "Other Amazon fees", vals.other_amazon_fees)}${field("storage_rate_per_cuft_month", "Storage per cu ft per month", vals.storage_rate_per_cuft_month)}${field("cubic_ft", "Cubic feet per unit", vals.cubic_ft)}${field("months_in_storage", "Months in storage", vals.months_in_storage)}</div>
  <h3>Advertising</h3><div class="row">${sel("ad_mode", "Advertising by", [["acos", "% of price (ACoS)"], ["per_unit", "Fixed per unit"]], vals.ad_mode || "acos")}${field("acos_pct", "ACoS %", vals.acos_pct)}${field("ad_per_unit", "Ad cost per unit", vals.ad_per_unit)}</div>
  <h3>Returns</h3><div class="row">${field("return_rate_pct", "Return rate %", vals.return_rate_pct)}${field("resellable_pct", "Returns resellable %", vals.resellable_pct)}${field("return_processing_fee", "Return processing fee", vals.return_processing_fee)}${field("refund_admin_fee", "Refund admin fee", vals.refund_admin_fee)}${sel("lose_fba_fee_on_return", "Fulfilment fee lost on returns", [["1", "Yes"], ["0", "No"]], String(vals.lose_fba_fee_on_return ?? "1"))}</div>
  <h3><label style="display:inline"><input type="checkbox" id="both" style="width:auto"> Also calculate ${mp === "CA" ? "Amazon.com" : "Amazon.ca"}</label></h3>
  <div class="row">${field("s_sell_price", `Price on ${mp === "CA" ? "Amazon.com (USD)" : "Amazon.ca (CAD)"}`, "")}${field("s_fba_fee", "FBA fee there", "")}${field("s_referral_pct", "Referral % there", "")}${field("s_referral_min", "Referral minimum there", "")}</div>
  <p class="sub">Blank fields on the second marketplace use its fee profile. Supplier cost and freight are shared.</p>
  <h3>Save</h3><div class="row"><div><label>Label</label><input type="text" name="label"></div><div><label>Project</label><select name="project_id"><option value="">(none)</option>${store.t.projects.map((p) => h`<option value="${p.id}">${p.name}</option>`)}</select></div></div>
  <p><button type="submit">Save this calculation${prod ? " to the product" : ""}</button></p><div id="saved" class="pill-ok"></div></form>
  <div><div class="card" id="res1">Enter a price and costs.</div><div class="card" id="res2" style="margin-top:12px"></div>
  <h3>Recent saved</h3>${[...store.t.calc_runs].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 8).map((r) => h`<div class="line"><span>${r.label || "Calculation"} ${mpChip(r.marketplace)}</span><small>${r.created_at.slice(0, 16)}</small></div>`)}</div></div>`;
  return { html, after(root) {
    const form = root.querySelector("#calc"), both = root.querySelector("#both"); let t;
    const go = () => { const d = formData(form); d.both = both.checked ? "1" : "0"; const r = runCalc(store, d); renderCalc(root.querySelector("#res1"), r.primary); const b2 = root.querySelector("#res2"); b2.style.display = r.secondary ? "" : "none"; renderCalc(b2, r.secondary); };
    form.addEventListener("input", () => { clearTimeout(t); t = setTimeout(go, 150); });
    form.elements.marketplace.addEventListener("change", (e) => { const p = new URLSearchParams(Object.entries(params).filter(([k]) => k !== "marketplace")); p.set("marketplace", e.target.value); location.hash = "#/calculator?" + p; });
    form.addEventListener("submit", async (e) => { e.preventDefault(); const d = formData(form); try { await saveCalc(store, { marketplace: d.marketplace, inputs: buildInputs(store, d, d.marketplace), label: d.label || "", product_id: prod ? prod.id : null, project_id: d.project_id || null }); root.querySelector("#saved").textContent = "Saved."; setTimeout(refresh, 600); } catch (err) { root.querySelector("#saved").className = "pill-bad"; root.querySelector("#saved").textContent = err.message; } });
    go();
  } };
}

/* ---------------- watchlists, alerts ---------------- */
export async function watchlists({ store, refresh }) {
  const html = h`<h2>Watchlists</h2><p class="sub">Alerts fire only when new numbers arrive (a new import). There is no background monitoring of Amazon.</p>
  <form class="card" id="newwl" style="max-width:420px"><label>New watchlist</label><input type="text" name="name" required maxlength="80"><p><button>Create</button></p></form>
  ${store.t.watchlists.map((w) => { const items = store.t.watchlist_items.filter((i) => i.watchlist_id === w.id).map((i) => store.get("products", i.product_id)).filter(Boolean), rules = store.t.alert_rules.filter((r) => r.watchlist_id === w.id);
    return h`<h3>${w.name}</h3><div class="card">${items.length ? h`<div class="wrap"><table><tr><th>Product</th><th>Market</th><th class="n">Price</th><th class="n">Rank</th><th>Price history</th><th></th></tr>${items.map((it) => { const lat = latest(store, it.id), ph = series(store, it.id, "price"); return h`<tr><td><a href="#/products/${it.id}">${short(it.title || it.asin, 40)}</a></td><td>${mpChip(it.marketplace)}</td><td class="n">${cell(lat, "price", 2)}</td><td class="n">${cell(lat, "bsr")}</td><td>${ph.length > 1 ? spark(ph) : h`<small>one snapshot</small>`}</td><td><button class="link rm" data-w="${w.id}" data-p="${it.id}">remove</button></td></tr>`; })}</table></div>` : empty('Empty. Open a product and use "Add to watchlist".')}
    <h3>Alert rules</h3>${rules.length ? rules.map((r) => h`<div class="line"><span>${r.metric} ${OPS[r.op]} ${num(r.threshold, 2)}</span></div>`) : h`<p class="sub">No rules yet.</p>`}
    <form class="row addrule" data-w="${w.id}" style="margin-top:8px">${sel("metric", "Metric", ["price", "bsr", "reviews", "rating", "seller_count", "monthly_units"].map((x) => [x, x]), "price")}${sel("op", "When it", Object.entries(OPS), "lt")}${field("threshold", "Value", "", "required")}<div><label>&nbsp;</label><button>Add rule</button></div></form></div>`; })}`;
  return { html, after(root) {
    root.querySelector("#newwl").addEventListener("submit", async (e) => { e.preventDefault(); const n = formData(e.target).name.trim(); if (n && !store.t.watchlists.some((w) => w.name === n)) await store.add("watchlists", { name: n, created_at: now() }); refresh(); });
    root.querySelectorAll(".rm").forEach((b) => b.addEventListener("click", async () => { const it = store.t.watchlist_items.find((i) => i.watchlist_id === b.dataset.w && i.product_id === b.dataset.p); if (it) await store.remove("watchlist_items", it.id); refresh(); }));
    root.querySelectorAll(".addrule").forEach((f) => f.addEventListener("submit", async (e) => { e.preventDefault(); const d = formData(f); await store.add("alert_rules", { watchlist_id: f.dataset.w, metric: d.metric, op: d.op, threshold: Number(d.threshold), active: true, created_at: now() }); await evaluate(store); refresh(); }));
  } };
}
export async function alertsPage({ store, refresh }) {
  const rows = [...store.t.alerts].sort((a, b) => (a.acknowledged - b.acknowledged) || (a.triggered_at < b.triggered_at ? 1 : -1)).slice(0, 200);
  return { html: h`<h2>Alerts</h2>${!rows.length ? empty("No alerts. Create rules on a watchlist; they are checked whenever you import new numbers.") : h`<div class="card wrap"><table><tr><th>When</th><th>Product</th><th>Market</th><th>What happened</th><th></th></tr>${rows.map((a) => { const p = store.get("products", a.product_id) || {}; return h`<tr style="${a.acknowledged ? "opacity:.55" : ""}"><td>${a.triggered_at.slice(0, 16)}</td><td><a href="#/products/${a.product_id}">${short(p.title || p.asin, 40)}</a></td><td>${mpChip(p.marketplace)}</td><td>${a.message}</td><td>${a.acknowledged ? "" : h`<button class="link ack" data-id="${a.id}">dismiss</button>`}</td></tr>`; })}</table></div>`}`,
    after(root) { root.querySelectorAll(".ack").forEach((b) => b.addEventListener("click", async () => { await store.update("alerts", b.dataset.id, { acknowledged: true }); refresh(); })); } };
}

/* ---------------- keywords, audit ---------------- */
export async function keywords(ctx) {
  const { store, q } = ctx;
  const mp = q.get("marketplace") || "US", lookup = await keywordLookup(ctx, mp), items = store.t.keywords.filter((k) => k.marketplace === mp).map((k) => {
    const obs = store.t.keyword_observations.filter((o) => o.keyword_id === k.id && !o.asin), last = (m) => obs.filter((o) => o.metric === m).sort((a, b) => (a.as_of < b.as_of ? 1 : -1))[0];
    return { phrase: k.phrase, volume: (last("search_volume") || {}).value_num ?? null, competition: (last("competition") || {}).value_num ?? null, o: last("search_volume") || last("competition") };
  }).sort((a, b) => a.phrase.localeCompare(b.phrase));
  const clusters = clusterKeywords(items.map((i) => ({ phrase: i.phrase, volume: i.volume })));
  return { html: h`<h2>Keywords</h2><p class="sub">Keyword numbers come from CSVs you import (for example Seller Central Brand Analytics, Helium 10 or a Google Keyword Planner export). <b>Search volume lookup and rank data are available only through a licensed provider you connect on your own server</b>; see <a href="#/sources">Data sources</a>.</p>
  <p><a class="btn ${mp === "US" ? "" : "ghost"}" href="#/keywords?marketplace=US">Amazon.com</a> <a class="btn ${mp === "CA" ? "" : "ghost"}" href="#/keywords?marketplace=CA">Amazon.ca</a> <a class="btn ghost" href="#/import">Import keywords</a> <a class="btn ghost" href="#/ranks?marketplace=${mp}">Rank tracker</a></p>${lookup.html}
  ${!items.length ? empty("No keywords for this marketplace yet.") : h`<h3>Clusters</h3><p class="sub">Phrases grouped by shared stems. ${kindChip("calculated")}</p><div class="grid g2">${clusters.map((c) => h`<div class="card"><b>${c.label}</b> <span class="chip">${c.size} phrase${c.size !== 1 ? "s" : ""}</span>${c.total_volume != null ? h` <span class="chip">${num(c.total_volume)} searches</span>` : ""}<div class="sub">${c.members.map((m) => m.phrase).join(" · ")}</div></div>`)}</div>
  <h3>All keywords</h3><div class="card wrap"><table><tr><th>Keyword</th><th class="n">Search volume</th><th class="n">Competition</th><th>Type</th><th>Source</th></tr>${items.map((k) => h`<tr><td>${k.phrase}</td><td class="n">${num(k.volume)}</td><td class="n">${num(k.competition)}</td><td>${k.o ? kindChip(k.o.kind) : ""}</td><td><small>${short(k.o && k.o.source, 40)}</small></td></tr>`)}</table></div>`}`, after: lookup.after };
}
export async function audit() {
  const html = h`<h2>Listing audit</h2><p class="sub">Rule-based checks of your draft against your keyword list. Limits are adjustable defaults, not Amazon facts: they vary by category, so confirm them in Seller Central's style guide. This tool does not write copy with AI.</p>
  <div class="grid g2" style="align-items:start"><form class="card" id="aud"><label>Title</label><input type="text" name="title"><label>Bullet points (one per line)</label><textarea name="bullets" rows="6"></textarea><label>Description (optional)</label><textarea name="description"></textarea>
  <label>Keywords, one per line, optionally "phrase, volume"</label><textarea name="keywords" rows="6"></textarea><div class="row"><div><label>Title limit (characters)</label><input type="number" name="title_max" value="200"></div><div><label>Bullet limit</label><input type="number" name="bullet_max" value="500"></div></div>
  <h3>Title starter (optional)</h3><div class="row"><div><label>Brand</label><input type="text" name="brand"></div><div><label>Main keyword</label><input type="text" name="primary"></div><div><label>Attributes, comma separated</label><input type="text" name="attributes"></div></div><p><button>Audit listing</button></p></form><div id="out">${empty("Paste a draft and keywords, then run the audit.")}</div></div>`;
  return { html, after(root) {
    root.querySelector("#aud").addEventListener("submit", (e) => {
      e.preventDefault(); const d = formData(e.target), kws = [];
      for (const line of d.keywords.split(/\r?\n/)) { const l = line.trim(); if (!l) continue; const m = l.match(/^(.*?)[,\t]\s*([\d.,]+)$/); kws.push(m ? { phrase: m[1].trim().toLowerCase(), volume: fnum(m[2]) } : { phrase: l.toLowerCase(), volume: null }); }
      const cfg = { title_max: fnum(d.title_max, 200), bullet_max: fnum(d.bullet_max, 500) }, r = auditListing(d.title, d.bullets.split(/\r?\n/), kws, d.description, cfg);
      const sk = d.primary ? titleSkeleton(d.brand, d.primary, d.attributes.split(","), cfg.title_max) : null;
      root.querySelector("#out").innerHTML = h`${sk ? h`<div class="card"><b>Title starter</b><p>${sk}</p><small class="sub">${sk.length} characters. A starting point only: check it reads naturally.</small></div>` : ""}
      <div class="card" style="${sk ? "margin-top:12px" : ""}"><b>Findings</b>${r.findings.length ? r.findings.map((f) => h`<div class="line"><span class="pill-${f.level === "problem" ? "bad" : f.level === "warning" ? "warn" : "ok"}">${f.level}</span><span style="flex:1;padding-left:10px"><b>${f.area}</b>: ${f.message}</span></div>`) : h`<p class="sub">Nothing to report.</p>`}</div>
      ${r.coverage.length ? h`<div class="card" style="margin-top:12px"><b>Keyword coverage${r.coverage_pct != null ? ": " + r.coverage_pct + "%" : ""}</b><div class="wrap"><table><tr><th>Keyword</th><th class="n">Volume</th><th>Title</th><th>Bullets</th><th>Status</th></tr>${r.coverage.map((c) => h`<tr><td>${c.phrase}</td><td class="n">${num(c.volume)}</td><td>${c.in_title ? "yes" : "–"}</td><td>${c.in_bullets ? "yes" : "–"}</td><td>${c.status}</td></tr>`)}</table></div></div>` : ""}
      ${r.readability.flesch != null ? h`<div class="card" style="margin-top:12px"><b>Readability</b> (bullets and description): Flesch ${r.readability.flesch}, ${r.readability.avg_sentence_words} words per sentence. ${kindChip("calculated")}</div>` : ""}`.__raw;
    });
  } };
}

/* ---------------- phase 2: inventory and ads ---------------- */
export async function inventory() {
  const html = h`<h2>Inventory planner</h2><p class="sub">Plans stock from the numbers you enter. It does not forecast: it assumes the daily sales rate you give it, so update it as sales change. ${kindChip("calculated")}</p>
  <div class="grid g2" style="align-items:start"><form class="card" id="inv"><div class="row">${field("daily_sales", "Units sold per day", 5)}${field("lead_time_days", "Lead time (days, order to Amazon stock)", 45)}${field("safety_days", "Safety stock (days)", 14)}${field("target_cover_days", "Days of cover to order for", 60)}${field("on_hand", "Units on hand at Amazon", 120)}${field("inbound", "Units inbound", 0)}${field("unit_cost", "Landed cost per unit", 0)}${field("moq", "Supplier minimum order", 0)}</div></form><div class="card" id="invout"></div></div>`;
  return { html, after(root) {
    const f = root.querySelector("#inv"), go = () => { const d = Object.fromEntries(Object.entries(formData(f)).map(([k, v]) => [k, fnum(v, 0)])), r = plan(d), o = root.querySelector("#invout");
      o.innerHTML = (r.error ? h`<p class="pill-bad">${r.error}</p>` : h`<div class="big ${r.status === "OK for now" ? "pos" : "neg"}">${r.status}</div>
      <div class="line"><span>Days of cover (on hand + inbound)</span><span>${num(r.days_of_cover, 1)}</span></div><div class="line"><span>Stock-out in (no inbound)</span><span>${num(r.stockout_in_days_without_inbound, 1)} days</span></div>
      <div class="line"><span>Reorder point</span><span>${num(r.reorder_point_units)} units</span></div><div class="line"><span>Order within</span><span>${num(r.reorder_in_days, 1)} days</span></div>
      <div class="line"><span>Suggested order</span><span><b>${num(r.suggested_order_units)}</b> units</span></div><div class="line"><span>Order cost</span><span>${num(r.order_cost, 2)}</span></div>
      <p class="sub">Reorder point = daily sales × (lead time + safety days). Suggested order covers lead time plus the cover you chose, minus what you have, and is raised to your minimum order if needed.</p>`).__raw; };
    f.addEventListener("input", go); go();
  } };
}
export async function ads({ store, refresh }) {
  const terms = store.t.ad_terms; let min_clicks = 10, target_acos = 30;
  const draw = (root) => {
    const a = analyse(terms, { min_clicks, target_acos }), t = a.totals;
    root.querySelector("#adout").innerHTML = (!terms.length ? empty("No ad data yet. Import a search-term report above.") : h`<div class="grid g4"><div class="card stat"><b>${money(t.spend)}</b><span>spend</span></div><div class="card stat"><b>${money(t.sales)}</b><span>ad sales</span></div><div class="card stat"><b>${t.acos == null ? "–" : t.acos.toFixed(1) + "%"}</b><span>ACoS</span></div><div class="card stat"><b>${money(t.wasted_spend)}</b><span>spend with clicks but no orders</span></div></div>
    <p class="sub">${a.rules}</p>
    ${[["Wasted spend: consider negative keywords", a.wasted, "wasted"], ["Over your ACoS target", a.over, "over"], ["Working well: consider more budget", a.winners.slice(0, 15), "win"]].map(([title, rows]) => h`<h3>${title}</h3>${rows.length ? h`<div class="card wrap"><table><tr><th>Search term</th><th class="n">Clicks</th><th class="n">Spend</th><th class="n">Orders</th><th class="n">Sales</th><th class="n">ACoS</th><th class="n">CVR</th></tr>${rows.slice(0, 25).map((r) => h`<tr><td>${r.term}</td><td class="n">${num(r.clicks)}</td><td class="n">${num(r.spend, 2)}</td><td class="n">${num(r.orders)}</td><td class="n">${num(r.sales, 2)}</td><td class="n">${r.acos == null ? "–" : r.acos.toFixed(1) + "%"}</td><td class="n">${r.cvr == null ? "–" : r.cvr.toFixed(1) + "%"}</td></tr>`)}</table></div>` : h`<p class="sub">None.</p>`}`)}`).__raw;
  };
  return { html: h`<h2>Ad analysis</h2><p class="sub">Analyse an Amazon Ads search-term report you export yourself. Everything is arithmetic on your numbers. ${kindChip("user_supplied")}</p>
  <form class="card" id="adup" style="max-width:640px"><div class="row">${sel("marketplace", "Marketplace", [["CA", "Amazon.ca"], ["US", "Amazon.com"]], "CA")}<div><label>Source label</label><input type="text" name="source_label" required placeholder="Ads search term report, Oct 2026"></div></div><label>CSV file</label><input type="file" name="file" accept=".csv,text/csv" required><p><button>Import report</button> <button type="button" class="ghost" id="adclear">Remove all ad data</button></p><div id="aderr" class="pill-bad"></div></form>
  <div class="row" style="max-width:420px;margin-top:12px"><div><label>Wasted: at least this many clicks</label><input type="number" id="mc" value="10"></div><div><label>Target ACoS %</label><input type="number" id="ta" value="30"></div></div><div id="adout" style="margin-top:12px"></div>`,
  after(root) {
    draw(root);
    const upd = () => { min_clicks = fnum(root.querySelector("#mc").value, 10); target_acos = fnum(root.querySelector("#ta").value, 30); draw(root); };
    root.querySelector("#mc").addEventListener("input", upd); root.querySelector("#ta").addEventListener("input", upd);
    root.querySelector("#adclear").addEventListener("click", async () => { for (const r of [...store.t.ad_terms]) await store.remove("ad_terms", r.id); refresh(); });
    root.querySelector("#adup").addEventListener("submit", async (e) => { e.preventDefault(); const d = formData(e.target), file = e.target.file.files[0]; try { await importAdTerms(store, await file.text(), { marketplace: d.marketplace, source_label: d.source_label, filename: file.name, kind: store.label === "demo" ? "sample" : "user_supplied" }); refresh(); } catch (err) { root.querySelector("#aderr").textContent = err.message; } });
  } };
}

/* ---------------- projects, reports ---------------- */
function projectTable(store, pid) {
  const [w, p] = scoring(store), cols = ["asin", "marketplace", "title", "price", "rating", "reviews", "bsr", "monthly_units", "est_margin_pct", "opportunity_score", "kinds", "sources", "as_of"];
  const rows = store.t.project_items.filter((i) => i.project_id === pid).map((i) => store.get("products", i.product_id)).filter(Boolean).map((pr) => {
    const lat = latest(store, pr.id), sc = opportunity(scoreInputs(lat), w, p), g = (k) => (lat[k] ? lat[k].value_num : null), vs = Object.values(lat);
    return { asin: pr.asin, marketplace: pr.marketplace, title: pr.title, price: g("price"), rating: g("rating"), reviews: g("reviews"), bsr: g("bsr"), monthly_units: g("monthly_units"), est_margin_pct: g("est_margin_pct"), opportunity_score: sc.score, kinds: [...new Set(vs.map((v) => v.kind))].sort().join("; "), sources: [...new Set(vs.map((v) => v.source))].sort().join("; "), as_of: vs.map((v) => v.as_of).sort().pop() || "" };
  });
  return { cols, rows };
}
export async function projects({ store, refresh }) {
  const rows = store.t.projects.map((p) => ({ p, n: store.t.project_items.filter((i) => i.project_id === p.id).length }));
  return { html: h`<h2>Projects &amp; reports</h2><p class="sub">Group products and calculations into a research project, then download a CSV or open a printable report.</p>
  <form class="card" id="np" style="max-width:520px"><label>New project</label><input type="text" name="name" required maxlength="80"><label>Notes</label><textarea name="notes" rows="2"></textarea><p><button>Create</button></p></form>
  <h3>Projects</h3>${!rows.length ? empty("No projects yet.") : h`<div class="card wrap"><table><tr><th>Name</th><th class="n">Products</th><th>Created</th></tr>${rows.map((r) => h`<tr><td><a href="#/projects/${r.p.id}">${r.p.name}</a></td><td class="n">${r.n}</td><td>${r.p.created_at.slice(0, 10)}</td></tr>`)}</table></div>`}`,
  after(root) { root.querySelector("#np").addEventListener("submit", async (e) => { e.preventDefault(); const d = formData(e.target); if (!store.t.projects.some((p) => p.name === d.name.trim())) await store.add("projects", { name: d.name.trim(), notes: d.notes.slice(0, 2000), created_at: now() }); refresh(); }); } };
}
export async function project({ store, id, mode }) {
  const pr = store.get("projects", id); if (!pr) return { html: empty("Project not found.") };
  const { cols, rows } = projectTable(store, id), calcs = store.t.calc_runs.filter((c) => c.project_id === id);
  return { html: h`<h2>${pr.name}</h2><p class="sub">${pr.notes || ""}</p><p><button id="csv">Download CSV</button> <button class="ghost" id="print">Print report</button></p>
  <div id="rep">${mode === "demo" ? h`<div class="notice warn">Contains FICTIONAL SAMPLE DATA.</div>` : ""}${!rows.length ? empty('No products yet. Open a product and use "Add to research project".') : h`<div class="card wrap"><table><tr>${cols.map((c) => h`<th>${c.replace(/_/g, " ")}</th>`)}</tr>${rows.map((r) => h`<tr>${cols.map((c) => h`<td>${r[c] ?? "–"}</td>`)}</tr>`)}</table></div>`}
  ${snapshotHtml(snapshot(store, id))}
  <h3>Saved calculations</h3>${calcs.length ? calcs.map((c) => h`<div class="card" style="margin-bottom:8px"><b>${c.label || "Calculation"}</b> (${c.marketplace}, ${c.outputs.currency}): price ${money(c.outputs.sell_price, c.outputs.currency)}, profit ${money(c.outputs.profit, c.outputs.currency)} per unit, margin ${num(c.outputs.margin_pct, 1)}%, break-even ${money(c.outputs.break_even_price, c.outputs.currency)}.</div>`) : h`<p class="sub">None. Save one from the profit calculator and choose this project.</p>`}
  <p class="sub">A research aid, not a prediction. Estimated and user-supplied numbers can be wrong. Generated ${now()}.</p></div>`,
  after(root) { root.querySelector("#csv").addEventListener("click", () => download(`${pr.name.replace(/\W+/g, "-")}.csv`, toCSV(cols, rows))); root.querySelector("#print").addEventListener("click", () => window.print()); } };
}

/* ---------------- sources, settings ---------------- */
export async function sources(ctx) {
  const { cloud, env } = ctx, st = await liveStatus(ctx);
  return { html: h`<h2>Data sources</h2><p class="sub">What each source can and cannot provide, what it needs and what it costs. This app never invents numbers a source cannot supply.</p>
  <div class="grid g2">${providers(cloud).map((p) => h`<div class="card"><b>${p.name}</b> <span class="chip ${p.status === "ready" || p.status === "connected" ? "observed" : ""}">${p.status}</span>
  <h3>Can provide</h3><ul>${p.gives.length ? p.gives.map((g) => h`<li>${g}</li>`) : h`<li>–</li>`}</ul><h3>Cannot provide</h3><ul>${p.not.map((g) => h`<li>${g}</li>`)}</ul>
  <div class="line"><span>Needs</span><span>${p.needs}</span></div><div class="line"><span>Cost</span><span>${p.cost}</span></div><p class="sub"><b>What was verified:</b> ${p.verified}</p>${(p.notes || []).map((n) => h`<p class="sub">${n}</p>`)}${p.docs ? h`<a href="${p.docs}" target="_blank" rel="noopener">Official docs</a>` : ""}</div>`)}</div>
  <h3>Live integrations on your server</h3><div class="card">${st.available ? ["spapi", "keepa", "dataforseo"].map((k) => h`<div class="line"><span>${({ spapi: "Amazon SP-API", keepa: "Keepa", dataforseo: "DataForSEO" })[k]}</span><span class="${st[k] ? "pill-ok" : "pill-warn"}">${st[k] ? "secrets set: working only if the account is valid" : "not configured"}</span></div>`) : h`<p>${st.why}</p>`}<p class="sub">"Secrets set" means the server has the credentials; it does not prove they are valid. The first fetch shows the provider's real answer. Until then the app shows only your uploads (and sample data in demo mode).</p></div>
  <h3>Where your data is stored</h3><div class="card"><p>${env}</p></div>` };
}
export async function settings(ctx) {
  const { store, mode, cloud, refresh, migrate, exportAll, importAll } = ctx, sec = await securityCard(ctx);
  const fx = fxRates(store), [w, p] = scoring(store);
  const html = h`<h2>Settings</h2><h3>Exchange rates</h3><form class="card" id="fx" style="max-width:520px"><p class="sub">Entered by you; the app never fetches or guesses rates. ${fx.updated_at ? "Last saved " + fx.updated_at.slice(0, 16) + "." : ""}</p>
  <label>1 USD in CAD</label><input type="number" step="any" min="0" name="usd_cad" value="${fx.USD_CAD ?? ""}"><label>1 CNY in USD (optional, for suppliers priced in yuan)</label><input type="number" step="any" min="0" name="cny_usd" value="${fx.CNY_USD ?? ""}"><p><button>Save rates</button></p></form>
  <h3>Fee profiles</h3><p class="sub">Open Seller Central's FBA Revenue Calculator for a similar product and copy the figures. Tick "verified" only after you have checked every value. Starter values are unverified, and the calculator warns while a profile is unverified.</p>
  <div class="grid g2">${["CA", "US"].map((mp) => { const pr = feeProfile(store, mp); return h`<form class="card prof" data-mp="${mp}"><b>Amazon.${mp === "CA" ? "ca (CAD)" : "com (USD)"}</b> ${pr.verified_at ? h`<span class="chip observed">verified ${pr.verified_at.slice(0, 10)}</span>` : h`<span class="chip estimated">unverified</span>`}
  <div class="row">${Object.entries(pr.data).map(([k, v]) => field(k, k.replace(/_/g, " "), v))}</div><label>Where these figures came from</label><input type="text" name="source_note" value="${pr.source_note || ""}">
  <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="verified" style="width:auto" ${raw(pr.verified_at ? "checked" : "")}> I checked these against Seller Central</label><p><button>Save ${mp} profile</button></p></form>`; })}</div>
  <h3>Opportunity score</h3><form class="card" id="sc"><p class="sub">Weights (relative importance) and the numbers each factor uses. Missing data is skipped and the weights are renormalised.</p><div class="row">${Object.entries(DEFAULT_WEIGHTS).map(([k]) => field(`w_${k}`, "weight: " + k.replace("_", " "), w[k] ?? DEFAULT_WEIGHTS[k]))}</div><div class="row">${Object.entries(DEFAULT_PARAMS).map(([k]) => field(`p_${k}`, k.replace(/_/g, " "), p[k] ?? DEFAULT_PARAMS[k]))}</div><p><button>Save scoring</button></p></form>
  <h3>Your data</h3><div class="card"><p class="sub">Storage: <b>${cloud ? "your account (synced)" : mode === "demo" ? "demo (not saved)" : "this device only"}</b>.</p><p><button id="exp" class="ghost">Download a backup (JSON)</button> <label class="btn ghost" style="display:inline-block;margin:0">Restore a backup<input type="file" id="imp" accept=".json" hidden></label>
  ${cloud ? h` <button id="mig" class="ghost">Copy this device's data into my account</button>` : ""}</p><div id="dmsg" class="pill-ok"></div></div>${sec}`;
  return { html, after(root) {
    root.querySelector("#fx").addEventListener("submit", async (e) => { e.preventDefault(); const d = formData(e.target), a = fnum(d.usd_cad), b = fnum(d.cny_usd); if ((a != null && a <= 0) || (b != null && b <= 0)) return; await store.setSetting("fx", { USD_CAD: a, CNY_USD: b, updated_at: now(), source: "entered by you" }); refresh(); });
    root.querySelectorAll(".prof").forEach((f) => f.addEventListener("submit", async (e) => { e.preventDefault(); const d = formData(f), data = {}; for (const k of Object.keys(feeProfile(store, f.dataset.mp).data)) data[k] = fnum(d[k], 0); await saveFeeProfile(store, f.dataset.mp, data, d.verified === "on", (d.source_note || "").slice(0, 300)); refresh(); }));
    root.querySelector("#sc").addEventListener("submit", async (e) => { e.preventDefault(); const d = formData(e.target); await store.setSetting("score_weights", Object.fromEntries(Object.keys(DEFAULT_WEIGHTS).map((k) => [k, fnum(d["w_" + k], DEFAULT_WEIGHTS[k])]))); await store.setSetting("score_params", Object.fromEntries(Object.keys(DEFAULT_PARAMS).map((k) => [k, fnum(d["p_" + k], DEFAULT_PARAMS[k])]))); refresh(); });
    const msg = (t, bad) => { const m = root.querySelector("#dmsg"); m.className = bad ? "pill-bad" : "pill-ok"; m.textContent = t; };
    root.querySelector("#exp").addEventListener("click", () => exportAll());
    root.querySelector("#imp").addEventListener("change", async (e) => { try { const n = await importAll(await e.target.files[0].text()); msg(`Restored ${n} rows.`); setTimeout(refresh, 800); } catch (err) { msg(err.message, true); } });
    const mig = root.querySelector("#mig"); if (mig) mig.addEventListener("click", async () => { try { msg("Copying…"); const n = await migrate(); msg(`Copied ${n} rows into your account.`); } catch (err) { msg(err.message, true); } });
  } };
}
export { TABLES };
