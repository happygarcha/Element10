// Phase 2 screens: live provider cards, rank tracker, supplier quotes, market snapshot, security check.
import { callFn, fetchStatus, ingestKeepa, ingestSpCatalog, ingestSpFees, ingestVolumes } from "./live.js";
import { configChecks } from "./security.js";
import { feeProfile, fxFor, latest } from "./services.js";
import { h, kindChip, mpChip, raw, toCSV, download } from "./ui.js";
import { CURRENCY, fnum, money, now, num } from "./util.js";

const empty = (m) => h`<div class="empty">${raw(m)}</div>`;
const fd = (f) => Object.fromEntries(new FormData(f).entries());
const median = (a) => { const v = a.filter((x) => x != null).sort((x, y) => x - y); if (!v.length) return null; const m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };

// ---- live status (cached for the page session)
let statusCache = null;
export async function liveStatus(ctx) {
  if (!ctx.cloud || !ctx.client) return { available: false, why: "Live data needs your account (cloud mode)." };
  if (statusCache && Date.now() - statusCache.t < 60_000) return statusCache.v;
  let v;
  try { v = { available: true, ...(await fetchStatus(ctx.client)) }; } catch (e) { v = { available: false, why: e.message }; }
  statusCache = { t: Date.now(), v }; return v;
}
export const resetStatus = () => { statusCache = null; };

function resultBox(root, sel, ok, text) { const el = root.querySelector(sel); if (el) { el.className = ok ? "pill-ok" : "pill-bad"; el.textContent = text; } }

// ---- product page: live data card
export async function liveCard(ctx, p) {
  const st = await liveStatus(ctx);
  if (!st.available) return { html: h`<div class="card"><h3 style="margin-top:0">Live data</h3><p class="sub">${st.why} Sample and uploaded data work without it.</p></div>`, after() {} };
  const row = (id, name, on, cost) => h`<div class="line"><span>${name}<br><small>${cost}</small></span>${on ? h`<button data-live="${id}">Fetch now</button>` : h`<small class="pill-warn">not configured on server</small>`}</div>`;
  const html = h`<div class="card"><h3 style="margin-top:0">Live data</h3><p class="sub">Each click calls a provider through your own Supabase function and may use paid allowance. Nothing runs automatically.</p>
  ${row("keepa", "Keepa: price, rank, rating, history", st.keepa, "Uses about 1 Keepa token (your paid plan)")}
  ${row("spcat", "Amazon SP-API: catalogue + rank", st.spapi, "Free; needs your seller account")}
  ${row("spfee", "Amazon SP-API: fee estimate at current price", st.spapi, "Free; needs your seller account and a stored price")}
  ${row("ranked", "DataForSEO: keywords this ASIN ranks for", st.dataforseo, "Pay-as-you-go; cost returned with the result")}
  <div id="liveres" aria-live="polite"></div></div>`;
  return { html, after(root) {
    root.querySelectorAll("[data-live]").forEach((b) => b.addEventListener("click", async () => {
      const id = b.dataset.live, mp = p.marketplace, price = (latest(ctx.store, p.id).price || {}).value_num;
      if (id === "spfee" && !(price > 0)) return resultBox(root, "#liveres", false, "Add a price first (import or Keepa).");
      const prompt = { keepa: "Spend about 1 Keepa token on this product?", ranked: "This is a paid DataForSEO call. Continue?" }[id];
      if (prompt && !confirm(prompt)) return;
      b.disabled = true; resultBox(root, "#liveres", true, "Working…");
      try {
        let msg;
        if (id === "keepa") { const r = await callFn(ctx.client, "keepa", { marketplace: mp, asins: [p.asin] }); const o = await ingestKeepa(ctx.store, mp, r); msg = `Saved ${o.observations} new data points. Tokens left: ${r.tokens_left ?? "unknown"}.`; }
        else if (id === "spcat") { const r = await callFn(ctx.client, "spapi", { marketplace: mp, action: "catalog", asins: [p.asin] }); msg = `Saved ${await ingestSpCatalog(ctx.store, mp, r)} data points.`; }
        else if (id === "spfee") { const r = await callFn(ctx.client, "spapi", { marketplace: mp, action: "fees", asin: p.asin, price }); msg = `Saved ${await ingestSpFees(ctx.store, mp, r)} fee estimates.`; }
        else { const r = await callFn(ctx.client, "dataforseo", { marketplace: mp, action: "ranked", asin: p.asin, limit: 50 }); const o = await ingestVolumes(ctx.store, mp, r); msg = `Saved ${o.kept} keyword volumes. Provider cost: ${r.cost_usd ?? "unknown"} USD.`; }
        resultBox(root, "#liveres", true, msg); setTimeout(ctx.refresh, 900);
      } catch (e) { resultBox(root, "#liveres", false, e.message); b.disabled = false; }
    }));
  } };
}

// ---- keywords page: volume lookup
export async function keywordLookup(ctx, mp) {
  const st = await liveStatus(ctx);
  if (!st.available || !st.dataforseo) return { html: h`<div class="card"><h3 style="margin-top:0">Look up search volume</h3><p class="sub">${st.available ? "DataForSEO is not configured on your server." : st.why} Volumes are never guessed: without a licensed provider, import a CSV you are entitled to export.</p></div>`, after() {} };
  return { html: h`<div class="card"><h3 style="margin-top:0">Look up search volume (paid, DataForSEO)</h3><form id="kv"><label>Keywords, one per line (max 100)</label><textarea name="k" rows="4" required></textarea><p><button>Look up</button> <span class="sub">You confirm before anything is charged. Volumes are the provider's estimates.</span></p></form><div id="kvres" aria-live="polite"></div></div>`,
    after(root) { root.querySelector("#kv").addEventListener("submit", async (e) => {
      e.preventDefault(); const kws = [...new Set(fd(e.target).k.split("\n").map((s) => s.trim().toLowerCase()).filter(Boolean))].slice(0, 100);
      if (!confirm(`Look up ${kws.length} keyword(s) on Amazon.${mp === "CA" ? "ca" : ".com"}? DataForSEO bills your account for this.`)) return;
      resultBox(root, "#kvres", true, "Working…");
      try { const r = await callFn(ctx.client, "dataforseo", { marketplace: mp, action: "volume", keywords: kws }); const o = await ingestVolumes(ctx.store, mp, r); resultBox(root, "#kvres", true, `Saved ${o.kept} volumes; ${o.no_data} had no data from the provider (left blank). Cost: ${r.cost_usd ?? "unknown"} USD.`); setTimeout(ctx.refresh, 900); }
      catch (err) { resultBox(root, "#kvres", false, err.message); }
    }); } };
}

// ---- rank tracker (built from keyword rank observations: CSV imports or DataForSEO)
export async function ranks({ store, q }) {
  const mp = q.get("marketplace") || "US", kw = new Map(store.t.keywords.map((k) => [k.id, k]));
  const groups = new Map();
  for (const o of store.t.keyword_observations) { if (o.metric !== "rank" || !o.asin || !kw.has(o.keyword_id) || kw.get(o.keyword_id).marketplace !== mp) continue; const key = o.keyword_id + "|" + o.asin; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(o); }
  const rows = [...groups.values()].map((g) => { g.sort((a, b) => (a.as_of < b.as_of ? -1 : 1)); const last = g[g.length - 1], prev = g[g.length - 2]; return { phrase: kw.get(last.keyword_id).phrase, asin: last.asin, rank: last.value_num, change: prev ? prev.value_num - last.value_num : null, n: g.length, as_of: last.as_of, kind: last.kind, source: last.source }; }).sort((a, b) => a.phrase.localeCompare(b.phrase) || a.asin.localeCompare(b.asin));
  return { html: h`<h2>Rank tracker</h2><p class="sub">Organic position of an ASIN for a keyword, from your imports (a keyword CSV with ASIN and rank columns) or the DataForSEO button on a product. There is no free source for this; nothing here is estimated by Element10. Each new import adds a history point.</p>
  <p><a class="btn ${mp === "US" ? "" : "ghost"}" href="#/ranks?marketplace=US">Amazon.com</a> <a class="btn ${mp === "CA" ? "" : "ghost"}" href="#/ranks?marketplace=CA">Amazon.ca</a> <a class="btn ghost" href="#/import">Import ranks</a></p>
  ${!rows.length ? empty("No rank data yet for this marketplace.") : h`<div class="card wrap"><table><tr><th>Keyword</th><th>ASIN</th><th class="n">Rank</th><th class="n">Change</th><th class="n">Points</th><th>Type</th><th>As of</th></tr>${rows.map((r) => h`<tr><td>${r.phrase}</td><td>${r.asin}</td><td class="n">${num(r.rank)}</td><td class="n ${r.change > 0 ? "pos" : r.change < 0 ? "neg" : ""}">${r.change == null ? "–" : (r.change > 0 ? "▲ " : r.change < 0 ? "▼ " : "") + Math.abs(r.change)}</td><td class="n">${r.n}</td><td>${kindChip(r.kind)}</td><td><small>${(r.as_of || "").slice(0, 10)}</small></td></tr>`)}</table></div><p class="sub">▲ means the rank number got smaller (better) since the previous point.</p>`}` };
}

// ---- supplier quotes (your own entries; landed-cost comparison uses only exchange rates you entered)
export async function suppliers({ store, refresh }) {
  const prods = store.t.products, byId = new Map(prods.map((p) => [p.id, p]));
  const rows = store.t.suppliers.map((s) => {
    const p = s.product_id ? byId.get(s.product_id) : null; let cost = null, note = "";
    if (p && s.quote_unit_cost != null) { const cur = CURRENCY[p.marketplace]; if (s.currency === cur) cost = s.quote_unit_cost; else { const r = fxFor(store, p.marketplace)[s.currency]; if (r) cost = s.quote_unit_cost * r; else note = `Enter a ${s.currency}→${cur} rate in Settings`; } }
    const price = p ? (latest(store, p.id).price || {}).value_num : null;
    return { s, p, cost, price, pct: cost != null && price ? cost / price * 100 : null, note };
  }).sort((a, b) => (a.s.name || "").localeCompare(b.s.name || ""));
  const html = h`<h2>Suppliers</h2><p class="sub">Your own quotes, kept next to the products they are for. Nothing is looked up for you. Cost is converted only with exchange rates you entered in Settings.</p>
  <form class="card" id="sf" style="max-width:640px"><div class="row"><div><label>Supplier</label><input type="text" name="name" required maxlength="80"></div>
  <div><label>Product</label><select name="product_id"><option value="">(none)</option>${prods.map((p) => h`<option value="${p.id}">${p.asin} ${(p.title || "").slice(0, 40)} (${p.marketplace})</option>`)}</select></div>
  <div><label>Unit cost quoted</label><input type="number" step="any" min="0" name="cost"></div><div><label>Currency</label><select name="currency"><option>USD</option><option>CAD</option><option>CNY</option></select></div>
  <div><label>MOQ</label><input type="number" min="0" name="moq"></div><div><label>Lead time (days)</label><input type="number" min="0" name="lead"></div></div>
  <label>Notes / contact</label><textarea name="notes" rows="2"></textarea><p><button>Save quote</button></p></form>
  <h3>Quotes</h3>${!rows.length ? empty("No quotes yet.") : h`<div class="card wrap"><table><tr><th>Supplier</th><th>Product</th><th class="n">Quote</th><th class="n">In sale currency</th><th class="n">% of sell price</th><th class="n">MOQ</th><th class="n">Lead</th><th></th></tr>${rows.map((r) => h`<tr><td>${r.s.name}<br><small>${(r.s.notes || "").slice(0, 80)}</small></td><td>${r.p ? h`<a href="#/products/${r.p.id}">${r.p.asin}</a> ${mpChip(r.p.marketplace)}` : "–"}</td><td class="n">${r.s.quote_unit_cost == null ? "–" : money(r.s.quote_unit_cost, r.s.currency)}</td><td class="n">${r.cost == null ? h`<small>${r.note || "–"}</small>` : money(r.cost, CURRENCY[r.p.marketplace])}</td><td class="n">${r.pct == null ? "–" : num(r.pct, 1) + "%"}</td><td class="n">${num(r.s.moq)}</td><td class="n">${num(r.s.lead_days)}</td><td><button class="link" data-del="${r.s.id}">Delete</button></td></tr>`)}</table></div><p class="sub">% of sell price uses the latest price on file for the product; it is cost only, not profit. Use the profit calculator for fees and duties.</p>`}`;
  return { html, after(root) {
    root.querySelector("#sf").addEventListener("submit", async (e) => { e.preventDefault(); const d = fd(e.target); await store.add("suppliers", { name: d.name.trim(), product_id: d.product_id || null, quote_unit_cost: fnum(d.cost), currency: d.currency, moq: fnum(d.moq), lead_days: fnum(d.lead), quoted_at: now(), notes: (d.notes || "").slice(0, 1000) }); refresh(); });
    root.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => { if (confirm("Delete this quote?")) { await store.remove("suppliers", b.dataset.del); refresh(); } }));
  } };
}

// ---- market snapshot over the products in a project (calculated from YOUR data, not the whole market)
export function snapshot(store, projectId) {
  const ids = store.t.project_items.filter((i) => i.project_id === projectId).map((i) => i.product_id), lat = ids.map((id) => latest(store, id));
  const col = (m) => lat.map((l) => (l[m] ? l[m].value_num : null)).filter((v) => v != null), price = col("price"), reviews = col("reviews"), bsr = col("bsr"), rating = col("rating");
  return { n: ids.length, price: { n: price.length, min: price.length ? Math.min(...price) : null, median: median(price), max: price.length ? Math.max(...price) : null },
    reviews: { n: reviews.length, median: median(reviews), under100: reviews.length ? reviews.filter((v) => v < 100).length / reviews.length * 100 : null },
    bsr: { n: bsr.length, median: median(bsr) }, rating: { n: rating.length, median: median(rating) } };
}
export const snapshotHtml = (s) => !s.n ? raw("") : h`<h3>Market snapshot</h3><div class="card"><p class="sub">${kindChip("calculated")} Worked out from the ${s.n} product${s.n > 1 ? "s" : ""} in this project, not from the whole market. Each figure says how many products had data.</p><div class="grid g4">
  <div class="stat"><b>${num(s.price.median, 2)}</b><span>median price (${s.price.n} with data; ${num(s.price.min, 2)}–${num(s.price.max, 2)})</span></div>
  <div class="stat"><b>${num(s.reviews.median)}</b><span>median reviews (${s.reviews.n})</span></div>
  <div class="stat"><b>${s.reviews.under100 == null ? "–" : num(s.reviews.under100) + "%"}</b><span>with under 100 reviews</span></div>
  <div class="stat"><b>${num(s.bsr.median)}</b><span>median rank (${s.bsr.n})</span></div></div></div>`;

// ---- settings: security check
export async function securityCard(ctx) {
  const cfg = window.ELEMENT10_CONFIG || {}, checks = configChecks(cfg, location), st = ctx.cloud ? await liveStatus(ctx) : null;
  return h`<h3>Security check</h3><div class="card">${checks.map((c) => h`<div class="line"><span>${c.ok ? "✔" : "✖"} ${c.name}<br><small>${c.detail}</small></span><span class="${c.ok ? "pill-ok" : "pill-bad"}">${c.ok ? "ok" : "fix"}</span></div>`)}
  ${st ? h`<div class="line"><span>Server functions reachable<br><small>${st.available ? "Providers configured on the server: " + (["spapi", "keepa", "dataforseo"].filter((k) => st[k]).join(", ") || "none") : st.why}</small></span><span class="${st.available ? "pill-ok" : "pill-warn"}">${st.available ? "ok" : "not deployed"}</span></div>` : ""}
  <p class="sub">Row-level security can only be proven in your Supabase project: run supabase/tests/rls_check.sql there (docs/06).</p></div>`;
}
