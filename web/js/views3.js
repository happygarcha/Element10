// Milestone 3 screens: account, connections/platforms, Helium 10 MCP console, keyword tools, reviews, parity matrix.
import { callFn } from "./live.js";
import { overlapGap, processKeywords } from "./calc/keywords.js";
import { DEFAULT_THEMES, analyseReviews } from "./calc/reviews.js";
import { parseCSV } from "./csv.js";
import { detectMapping, parseNumber } from "./imports.js";
import { PARITY, PLATFORMS, STATUSES, summary } from "./parity.js";
import { latest } from "./services.js";
import { h, kindChip, mpChip, raw, toCSV, download } from "./ui.js";
import { liveStatus, resetStatus } from "./views2.js";
import { now, num, uid } from "./util.js";

const empty = (m) => h`<div class="empty">${raw(m)}</div>`;
const fd = (f) => Object.fromEntries(new FormData(f).entries());
const say = (root, sel, ok, t) => { const el = root.querySelector(sel); if (el) { el.className = ok ? "pill-ok" : "pill-bad"; el.textContent = t; } };

// ---------------- account ----------------
export async function account(ctx) {
  const { client, user, cloud, store, exportAll } = ctx, st = cloud ? await liveStatus(ctx) : null;
  if (!cloud) return { html: h`<h2>Account</h2><div class="card"><p>You are using <b>${ctx.mode === "demo" ? "demo mode" : "this device only"}</b>, so there is no account to manage. Go back to the sign-in screen and sign in to sync across devices.</p></div>`, after() {} };
  const verified = !!(user && user.email_confirmed_at), created = user && user.created_at ? user.created_at.slice(0, 10) : "–";
  const html = h`<h2>Account</h2><div class="grid g2">
  <div class="card"><h3 style="margin-top:0">Profile</h3><div class="line"><span>Email</span><span>${user.email}</span></div><div class="line"><span>Email verified</span><span class="${verified ? "pill-ok" : "pill-warn"}">${verified ? "yes" : "not yet"}</span></div><div class="line"><span>Created</span><span>${created}</span></div>
  ${verified ? "" : h`<p><button class="ghost" id="resend">Resend verification email</button></p>`}<div id="pmsg" aria-live="polite"></div>
  <p class="sub">Your data lives in your private Supabase database and syncs to every device where you sign in.</p></div>
  <div class="card"><h3 style="margin-top:0">Change password</h3><form id="pw"><label>New password (8+ characters)</label><input type="password" name="p1" minlength="8" required autocomplete="new-password"><label>Repeat</label><input type="password" name="p2" minlength="8" required autocomplete="new-password"><p><button>Change password</button></p><div id="pwmsg" aria-live="polite"></div></form>
  <p><button class="ghost" id="allout">Sign out on all devices</button></p></div></div>
  <h3>Your data</h3><div class="card"><p class="sub">${store.t.products.length} products, ${store.t.keywords.length} keywords, ${store.t.watchlists.length} watchlists, ${store.t.projects.length} projects.</p><p><button class="ghost" id="exp">Download a full backup (JSON)</button></p></div>
  <h3>Delete account</h3><div class="card"><p>This permanently deletes your login and <b>every row you saved</b>. It cannot be undone. Download a backup first.</p>
  ${st && st.available && st.account_delete ? h`<form id="del"><label>Type your email (${user.email}) to confirm</label><input type="text" name="confirm" autocomplete="off" required><p><button class="danger">Delete my account and data</button></p><div id="delmsg" aria-live="polite"></div></form>` : h`<p class="pill-warn">Self-service deletion needs the <code>account</code> function deployed on your server (docs/06). Until then, delete the user in Supabase → Authentication → Users; all rows are removed with it.</p>`}</div>`;
  return { html, after(root) {
    const rs = root.querySelector("#resend"); if (rs) rs.addEventListener("click", async () => { const { error } = await client.auth.resend({ type: "signup", email: user.email }); say(root, "#pmsg", !error, error ? error.message : "Verification email sent."); });
    root.querySelector("#pw").addEventListener("submit", async (e) => { e.preventDefault(); const d = fd(e.target); if (d.p1 !== d.p2) return say(root, "#pwmsg", false, "The two passwords differ."); const { error } = await client.auth.updateUser({ password: d.p1 }); say(root, "#pwmsg", !error, error ? error.message : "Password changed."); if (!error) e.target.reset(); });
    root.querySelector("#allout").addEventListener("click", async () => { await client.auth.signOut({ scope: "global" }); location.reload(); });
    root.querySelector("#exp").addEventListener("click", () => exportAll());
    const del = root.querySelector("#del"); if (del) del.addEventListener("submit", async (e) => { e.preventDefault();
      if (!confirm("Last chance: permanently delete your account and all data?")) return;
      try { await callFn(client, "account", { action: "delete", confirm: fd(del).confirm }); await client.auth.signOut(); localStorage.removeItem("element10.mode"); location.reload(); } catch (err) { say(root, "#delmsg", false, err.message); } });
  } };
}

// ---------------- connections and platforms ----------------
const PROVIDERS = [
  ["spapi", "Amazon Selling Partner API", "Your seller account + private app", "SPAPI_LWA_CLIENT_ID, SPAPI_LWA_CLIENT_SECRET, SPAPI_REFRESH_TOKEN"],
  ["keepa", "Keepa", "Paid Keepa API plan", "KEEPA_API_KEY"],
  ["dataforseo", "DataForSEO Labs (Amazon)", "Pay-as-you-go account", "DATAFORSEO_LOGIN, DATAFORSEO_PASSWORD"],
  ["h10mcp", "Helium 10 MCP (your own account)", "Helium 10 plan that includes MCP + API token", "H10_MCP_TOKEN"],
];
export async function connections(ctx) {
  const st = await liveStatus(ctx);
  const html = h`<h2>Connections</h2><p class="sub">Provider credentials live only in your Supabase server settings. This page shows whether each is present; it can never read or display them.</p>
  ${st.available ? "" : h`<div class="notice warn">${st.why}</div>`}
  <div class="grid g2">${PROVIDERS.map(([id, name, needs, secrets]) => h`<div class="card"><b>${name}</b> <span class="chip ${st[id] ? "observed" : ""}">${!st.available ? "unknown" : st[id] ? "secret set" : "not connected"}</span>
  <div class="line"><span>Needs</span><span>${needs}</span></div><details><summary>Connect / disconnect</summary><p class="sub">Connect: <code>supabase secrets set ${secrets}=…</code> then redeploy not needed. Disconnect: <code>supabase secrets unset ${secrets.split(", ")[0]} …</code> (all names listed). This removes access immediately; stored results stay in your database until you delete them.</p></details></div>`)}</div>
  <h3>Selling accounts</h3><div class="card"><p>Amazon seller account: ${st.available && st.spapi ? "SP-API credentials are present on the server (validity is only proven by a real fetch)." : "not connected."} Walmart and TikTok Shop: not connected (no adapter yet).</p><p class="sub">Nothing here can change listings, ads, inventory or messages. Actions like that are not built, and would require your explicit authorisation per action.</p></div>
  <p><button class="ghost" id="refresh">Re-check status</button></p>`;
  return { html, after(root) { root.querySelector("#refresh").addEventListener("click", () => { resetStatus(); ctx.refresh(); }); } };
}
export async function platforms() {
  return { html: h`<h2>Platforms and parity</h2><p class="sub">Helium 10 supports more platforms than Element10 connects. Facts about Helium 10 are labelled by how well they were verified.</p>
  <div class="grid g2">${PLATFORMS.map((p) => h`<div class="card"><b>${p.name}</b><h3>Helium 10</h3><p class="sub">${p.helium10}</p><h3>Element10</h3><p>${p.element10}</p></div>`)}</div>
  <p><a class="btn" href="#/parity">Open the full feature-parity matrix</a></p>` };
}

// ---------------- parity matrix ----------------
export async function parity({ q }) {
  const s = summary(), status = q.get("status") || "", area = q.get("area") || "", rows = PARITY.filter((r) => (!status || r.status === status) && (!area || r.area === area)), areas = [...new Set(PARITY.map((r) => r.area))];
  return { html: h`<h2>Feature-parity matrix</h2><p class="sub">Helium 10 capability → Element10 equivalent, with honest status. This is the checklist for the whole project; the platform is not complete until it is mostly "implemented".</p>
  <div class="grid g4">${[["total", "capabilities"], ...STATUSES.map((x) => [x, x])].map(([k, l]) => h`<div class="stat card"><b>${s[k]}</b><span>${l}</span></div>`)}</div>
  <form class="card filters" id="pf"><div class="row"><div><label>Status</label><select name="status"><option value="">All</option>${STATUSES.map((x) => h`<option ${raw(x === status ? "selected" : "")}>${x}</option>`)}</select></div>
  <div><label>Area</label><select name="area"><option value="">All</option>${areas.map((x) => h`<option ${raw(x === area ? "selected" : "")}>${x}</option>`)}</select></div></div><p style="margin:10px 0 0"><button>Filter</button> <button type="button" class="ghost" id="csv">Download CSV</button></p></form>
  <p class="sub">Helium 10 source: <b>official</b> = helium10/Helium10-MCP README; <b>secondary</b> = third-party reviews (helium10.com was unreachable from the build environment); <b>unverified</b> = not checked.</p>
  <div class="card wrap"><table><tr><th>ID</th><th>Helium 10 capability</th><th>Element10 equivalent</th><th>Data source</th><th>Access / cost</th><th>Status</th><th>Evidence</th><th>Remaining difference</th></tr>
  ${rows.map((r) => h`<tr><td>${r.id}</td><td>${r.h10}<br><small class="chip">${r.ref}</small><br><small>${r.platforms}</small></td><td>${r.e10}<br><small>${r.workflow}</small></td><td><small>${r.sources}</small></td><td><small>${r.access}</small></td><td><span class="chip ${r.status === "implemented" ? "observed" : r.status === "partial" ? "calculated" : r.status === "blocked" ? "estimated" : ""}">${r.status}</span></td><td><small>${r.evidence}</small></td><td><small>${r.gap}</small></td></tr>`)}</table></div>`,
    after(root) {
      root.querySelector("#pf").addEventListener("submit", (e) => { e.preventDefault(); const d = fd(e.target), p = new URLSearchParams(); for (const [k, v] of Object.entries(d)) if (v) p.set(k, v); location.hash = "#/parity" + (p.toString() ? "?" + p : ""); });
      root.querySelector("#csv").addEventListener("click", () => download("element10-parity.csv", toCSV(["id", "area", "h10", "ref", "platforms", "e10", "workflow", "sources", "access", "accept", "status", "evidence", "gap"], PARITY)));
    } };
}

// ---------------- Helium 10 MCP console ----------------
function findRows(d) {
  if (Array.isArray(d) && d.length && typeof d[0] === "object") return d;
  if (d && typeof d === "object") for (const v of Object.values(d)) { const r = findRows(v); if (r) return r; }
  return null;
}
const cellText = (v) => (v == null ? "–" : typeof v === "object" ? JSON.stringify(v).slice(0, 80) : String(v));
function fieldFor(name, sch, required) {
  const t = Array.isArray(sch.type) ? sch.type.find((x) => x !== "null") : sch.type, label = `${name}${required ? " *" : ""}${sch.description ? " — " + String(sch.description).slice(0, 90) : ""}`;
  if (sch.enum) return h`<div><label>${label}</label><select name="${name}" data-t="enum"><option value="">(none)</option>${sch.enum.map((v) => h`<option>${v}</option>`)}</select></div>`;
  if (t === "boolean") return h`<div><label>${label}</label><select name="${name}" data-t="boolean"><option value="">(default)</option><option>true</option><option>false</option></select></div>`;
  if (t === "number" || t === "integer") return h`<div><label>${label}</label><input type="number" step="any" name="${name}" data-t="number"></div>`;
  if (t === "array") return h`<div><label>${label} (comma separated)</label><input type="text" name="${name}" data-t="array"></div>`;
  if (t === "object") return h`<div><label>${label} (JSON)</label><textarea name="${name}" data-t="json" rows="3"></textarea></div>`;
  return h`<div><label>${label}</label><input type="text" name="${name}" data-t="string"></div>`;
}
export function buildArgs(schema, form) {
  const out = {};
  for (const el of form.querySelectorAll("[data-t]")) {
    const v = el.value.trim(); if (v === "") continue;
    const t = el.dataset.t; out[el.name] = t === "number" ? Number(v) : t === "boolean" ? v === "true" : t === "array" ? v.split(",").map((s) => s.trim()).filter(Boolean) : t === "json" ? JSON.parse(v) : v;
  }
  return out;
}
export async function h10(ctx) {
  const st = await liveStatus(ctx), saved = ctx.store.t.provider_results.filter((r) => r.provider === "helium10-mcp").sort((a, b) => (a.retrieved_at < b.retrieved_at ? 1 : -1));
  const head = h`<h2>Helium 10 MCP</h2><p class="sub">Use your own Helium 10 account's official MCP tools (research, keyword tracking, listings, profits, inventory, ads queries) from here. Read-only tools only. Requires a Helium 10 plan that includes MCP and an API token stored as a server secret. Each call counts against your Helium 10 allowance. Results are shown exactly as returned; Element10 does not remap or re-label them as its own measurements.</p>`;
  if (!st.available || !st.h10mcp) return { html: h`${head}<div class="notice warn">${!st.available ? st.why : "Not connected: set H10_MCP_TOKEN on your server (Settings → MCP → Create API Key in Helium 10, then `supabase secrets set H10_MCP_TOKEN=…`)."}</div>${savedList(saved)}`, after: (root) => savedAfter(root, ctx, saved) };
  return { html: h`${head}<p><button id="load">Load my available tools</button> <span id="lmsg" aria-live="polite"></span></p><div id="tool"></div><div id="out" aria-live="polite"></div>${savedList(saved)}`,
    after(root) {
      savedAfter(root, ctx, saved); let tools = [], last = null;
      root.querySelector("#load").addEventListener("click", async () => {
        say(root, "#lmsg", true, "Loading…");
        try {
          const r = await callFn(ctx.client, "h10mcp", { action: "tools" }); tools = r.tools.filter((t) => t.allowed); say(root, "#lmsg", true, `${tools.length} read-only tools available to your account (${r.tools.length - tools.length} write tools hidden).`);
          root.querySelector("#tool").innerHTML = h`<form class="card" id="tf"><label>Tool</label><select id="tn">${tools.map((t) => h`<option value="${t.name}">${t.name}</option>`)}</select><p class="sub" id="td"></p><div class="row" id="tfields"></div><p><button>Run (uses allowance)</button></p></form>`.__raw;
          const draw = () => { const t = tools.find((x) => x.name === root.querySelector("#tn").value), props = (t.inputSchema || {}).properties || {}, req = (t.inputSchema || {}).required || [];
            root.querySelector("#td").textContent = t.description; root.querySelector("#tfields").innerHTML = Object.entries(props).map(([n, s]) => fieldFor(n, s, req.includes(n)).__raw).join(""); };
          root.querySelector("#tn").addEventListener("change", draw); draw();
          root.querySelector("#tf").addEventListener("submit", async (e) => { e.preventDefault(); const t = root.querySelector("#tn").value; let args;
            try { args = buildArgs({}, e.target); } catch (_) { return say(root, "#out", false, "A JSON field is not valid JSON."); }
            if (!confirm(`Run ${t}? This counts against your Helium 10 MCP allowance.`)) return; say(root, "#out", true, "Running…");
            try { last = await callFn(ctx.client, "h10mcp", { action: "call", tool: t, arguments: args }); last.args = args; showResult(root, last); } catch (err) { say(root, "#out", false, err.message); } });
        } catch (err) { say(root, "#lmsg", false, err.message); }
      });
      function showResult(root2, r) {
        const rows = findRows(r.data), cols = rows ? [...new Set(rows.slice(0, 50).flatMap((x) => Object.keys(x)))].slice(0, 14) : [];
        root2.querySelector("#out").innerHTML = h`<div class="card"><b>${r.tool}</b> ${r.is_error ? h`<span class="chip estimated">tool reported an error</span>` : ""} <span class="chip">Helium 10 MCP</span> <span class="chip">${r.as_of}</span>
        ${rows ? h`<div class="wrap"><table><tr>${cols.map((c) => h`<th>${c}</th>`)}</tr>${rows.slice(0, 200).map((x) => h`<tr>${cols.map((c) => h`<td>${cellText(x[c])}</td>`)}</tr>`)}</table></div><p class="sub">${rows.length} rows (first 200 shown). Missing values show as – and are not filled in.</p>` : h`<pre style="white-space:pre-wrap;overflow:auto;max-height:420px">${r.data != null ? JSON.stringify(r.data, null, 2) : r.text}</pre>`}
        <p><button id="save" class="ghost">Save this result to my account</button> <span class="sub">Saved results are private to you. Check Helium 10's terms before keeping their data long-term.</span></p></div>`.__raw;
        root2.querySelector("#save").addEventListener("click", async () => { await ctx.store.add("provider_results", { provider: "helium10-mcp", tool: r.tool, marketplace: r.args && r.args.marketplace || null, params: r.args || {}, result: r.data ?? { text: r.text }, retrieved_at: r.as_of, note: "" }); ctx.refresh(); });
      }
    } };
}
const savedList = (saved) => h`<h3>Saved results</h3>${saved.length ? h`<div class="card wrap"><table><tr><th>Tool</th><th>Retrieved</th><th></th></tr>${saved.map((r) => h`<tr><td>${r.tool}</td><td>${(r.retrieved_at || "").slice(0, 16)}</td><td><button class="link" data-view="${r.id}">View JSON</button> <button class="link" data-del="${r.id}">Delete</button></td></tr>`)}</table></div><div id="viewer"></div>` : empty("Nothing saved.")}`;
function savedAfter(root, ctx, saved) {
  root.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => { const r = saved.find((x) => x.id === b.dataset.view); root.querySelector("#viewer").innerHTML = h`<pre class="card" style="white-space:pre-wrap;overflow:auto;max-height:420px">${JSON.stringify(r.result, null, 2)}</pre>`.__raw; }));
  root.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => { if (confirm("Delete this saved result?")) { await ctx.store.remove("provider_results", b.dataset.del); ctx.refresh(); } }));
}

// ---------------- keyword tools ----------------
export async function keywordTools({ store, q, refresh }) {
  const mp = q.get("marketplace") || "US", kw = new Map(store.t.keywords.filter((k) => k.marketplace === mp).map((k) => [k.id, k]));
  const lastRank = new Map(), vol = new Map();
  for (const o of store.t.keyword_observations) { const k = kw.get(o.keyword_id); if (!k) continue;
    if (o.metric === "rank" && o.asin) { const key = o.keyword_id + "|" + o.asin, c = lastRank.get(key); if (!c || o.as_of >= c.as_of) lastRank.set(key, o); }
    if (o.metric === "search_volume") { const c = vol.get(o.keyword_id); if (!c || o.as_of >= c.as_of) vol.set(o.keyword_id, o); } }
  const byAsin = {}; for (const o of lastRank.values()) (byAsin[o.asin] ||= []).push({ keyword: kw.get(o.keyword_id).phrase, rank: o.value_num, volume: (vol.get(o.keyword_id) || {}).value_num ?? null });
  const asinList = Object.keys(byAsin).sort();
  return { html: h`<h2>Keyword tools</h2><p class="sub"><a class="btn ${mp === "US" ? "" : "ghost"}" href="#/keyword-tools?marketplace=US">Amazon.com</a> <a class="btn ${mp === "CA" ? "" : "ghost"}" href="#/keyword-tools?marketplace=CA">Amazon.ca</a></p>
  <h3>Keyword processor</h3><form class="card" id="kp"><p class="sub">Paste a keyword list (one per line or comma separated). Removes duplicates, filters, counts words and builds a backend-keywords string within a byte budget. Amazon's limit varies by marketplace/category: check Seller Central and set it here.</p>
  <div class="row"><div><label>Min words</label><input type="number" name="min" min="1" value="1"></div><div><label>Max words</label><input type="number" name="max" min="1" value="20"></div><div><label>Must contain</label><input type="text" name="inc" placeholder="comma separated"></div><div><label>Exclude words</label><input type="text" name="exc" placeholder="brand names, etc."></div><div><label>Words already in your title (skip in backend)</label><input type="text" name="skip"></div><div><label>Byte budget</label><input type="number" name="bytes" min="1" value="249"></div></div>
  <label>Keywords</label><textarea name="list" rows="6" required></textarea><p><button>Process</button></p></form><div id="kpout"></div>
  <h3>Keyword overlap and gaps (from rank data you hold)</h3>${asinList.length < 2 ? empty("Needs rank data for at least two ASINs in this marketplace. Import a keyword CSV with ASIN and rank columns, or use the DataForSEO ranked-keywords button on product pages.") : h`<form class="card" id="og"><p class="sub">Tick the ASINs to compare and choose yours.</p>${asinList.map((a) => h`<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" style="width:auto" name="asin" value="${a}" checked> ${a} <span class="sub">(${byAsin[a].length} ranked keywords)</span></label>`)}<label>My ASIN</label><select name="mine"><option value="">(none)</option>${asinList.map((a) => h`<option>${a}</option>`)}</select><label>Gap = another ASIN ranks within top</label><input type="number" name="top" value="20" min="1"><p><button>Compare</button></p></form><div id="ogout"></div>`}`,
    after(root) {
      root.querySelector("#kp").addEventListener("submit", (e) => { e.preventDefault(); const d = fd(e.target), L = (s) => (s || "").split(",").map((x) => x.trim()).filter(Boolean);
        const r = processKeywords(d.list, { minWords: Number(d.min) || 1, maxWords: Number(d.max) || 20, include: L(d.inc), exclude: L(d.exc), skipWords: L(d.skip).flatMap((x) => x.split(/\s+/)), byteLimit: Number(d.bytes) || 249 });
        root.querySelector("#kpout").innerHTML = h`<div class="card"><p>${r.input} lines in, ${r.duplicates_removed} duplicates removed, <b>${r.phrases.length}</b> phrases kept.</p>
        <label>Backend keywords (${r.backend_bytes}/${r.byte_limit} bytes${r.backend_dropped ? `; ${r.backend_dropped} words did not fit` : ""})</label><textarea readonly rows="3" id="bk">${r.backend}</textarea><p><button class="ghost" id="cp">Copy</button> <button class="ghost" id="dl">Download phrases CSV</button></p>
        <h3>Word frequency</h3><div class="wrap"><table><tr><th>Word</th><th class="n">Phrases</th></tr>${r.words.slice(0, 40).map((w) => h`<tr><td>${w.word}</td><td class="n">${w.count}</td></tr>`)}</table></div></div>`.__raw;
        root.querySelector("#cp").addEventListener("click", () => navigator.clipboard && navigator.clipboard.writeText(r.backend)); root.querySelector("#dl").addEventListener("click", () => download("keywords.csv", toCSV(["keyword"], r.phrases.map((keyword) => ({ keyword })))));
      });
      const og = root.querySelector("#og"); if (og) og.addEventListener("submit", (e) => { e.preventDefault(); const picked = [...og.querySelectorAll("input[name=asin]:checked")].map((x) => x.value), d = fd(og);
        if (picked.length < 2) return; const sets = Object.fromEntries(picked.map((a) => [a, byAsin[a]])), o = overlapGap(sets, { mine: d.mine || null, top: Number(d.top) || 20 });
        root.querySelector("#ogout").innerHTML = h`<div class="card"><p>${Object.entries(o.counts).map(([k, v]) => h`<span class="chip">${k}: ${v}</span> `)}</p><p class="sub">${o.note} ${kindChip("calculated")}</p><div class="wrap"><table><tr><th>Keyword</th><th>Group</th><th class="n">Volume</th>${o.asins.map((a) => h`<th class="n">${a}</th>`)}</tr>${o.rows.slice(0, 300).map((r) => h`<tr><td>${r.keyword}</td><td>${r.group}</td><td class="n">${num(r.volume)}</td>${o.asins.map((a) => h`<td class="n">${r.ranks[a] ?? "–"}</td>`)}</tr>`)}</table></div></div>`.__raw; });
    } };
}

// ---------------- reviews ----------------
const REVIEW_ALIASES = { rating: ["rating", "stars", "star rating", "review rating"], title: ["title", "review title", "headline"], body: ["body", "review", "review text", "text", "content", "comment"], date: ["date", "review date", "reviewed at"] };
export async function reviews({ store, q, refresh }) {
  const pid = q.get("product") || "", prods = store.t.products, p = pid ? store.get("products", pid) : null, rows = p ? store.t.reviews.filter((r) => r.product_id === pid) : [];
  const a = p ? analyseReviews(rows.map((r) => ({ rating: r.rating, title: r.title, body: r.body }))) : null;
  return { html: h`<h2>Review analysis</h2><p class="sub">Import reviews you are entitled to export (CSV with rating and text columns) and see rating spread, recurring complaint themes and frequent terms in low-rated reviews. Everything is counted from your rows with visible rules ${kindChip("calculated")}. No reviews are collected automatically, and themes are keyword matches, not AI.</p>
  <form class="card" id="rp"><label>Product</label><select name="product"><option value="">(choose)</option>${prods.map((x) => h`<option value="${x.id}" ${raw(x.id === pid ? "selected" : "")}>${x.asin} ${(x.title || "").slice(0, 50)} (${x.marketplace})</option>`)}</select><p><button>Open</button></p></form>
  ${!p ? empty("Choose a product (import products first).") : h`<h3>${p.asin} ${mpChip(p.marketplace)}</h3>
  <form class="card" id="ri"><label>Import reviews CSV</label><input type="file" accept=".csv,text/csv" required><label>Source label (where the file came from)</label><input type="text" name="src" required maxlength="80"><p><button>Import</button> <span id="rmsg" aria-live="polite"></span></p></form>
  ${!rows.length ? empty("No reviews for this product yet.") : h`<div class="grid g2"><div class="card"><b>${a.n}</b> rated reviews, average <b>${num(a.average, 2)}</b>, <b>${num(a.low_share, 0)}%</b> at 3 stars or below. ${a.caveat ? h`<p class="pill-warn">${a.caveat}</p>` : ""}
  <table>${a.distribution.slice().reverse().map((d) => h`<tr><td>${d.stars}★</td><td class="n">${d.count}</td><td><div style="background:var(--accent);height:8px;width:${a.n ? d.count / a.n * 100 : 0}%"></div></td></tr>`)}</table></div>
  <div class="card"><b>Frequent terms in low-rated reviews</b><div>${a.terms_low.map((t) => h`<span class="chip">${t.term} ${t.count}</span> `)}${a.terms_low.length ? "" : h`<span class="sub">none repeated twice</span>`}</div><div style="margin-top:8px">${a.phrases_low.map((t) => h`<span class="chip">${t.term} ${t.count}</span> `)}</div></div></div>
  <h3>Complaint themes</h3><div class="card wrap"><table><tr><th>Theme</th><th class="n">Low-rated mentioning</th><th class="n">% of low-rated</th><th class="n">High-rated mentioning</th><th>Example (low-rated)</th></tr>${a.themes.map((t) => h`<tr><td>${t.theme}</td><td class="n">${t.low_count}</td><td class="n">${num(t.low_pct, 0)}%</td><td class="n">${t.high_count}</td><td><small>${t.example || "–"}</small></td></tr>`)}</table></div>
  <p class="sub">Theme rules (editable in code or Settings later): ${Object.keys(DEFAULT_THEMES).join(", ")}. A theme count means "reviews containing one of its phrases", nothing more.</p>`}`}`,
    after(root) {
      root.querySelector("#rp").addEventListener("submit", (e) => { e.preventDefault(); location.hash = "#/reviews" + (fd(e.target).product ? "?product=" + fd(e.target).product : ""); });
      const ri = root.querySelector("#ri"); if (ri) ri.addEventListener("submit", async (e) => { e.preventDefault();
        try { const text = await ri.querySelector("input[type=file]").files[0].text(), { headers, rows: r } = parseCSV(text), map = detectMapping(headers, REVIEW_ALIASES);
          if (!map.rating || !map.body) throw new Error("Need a rating column and a review text column.");
          const imp = await store.add("imports", { filename: "reviews.csv", kind: "reviews", source_label: fd(ri).src, marketplace: p.marketplace, uploaded_at: now(), rows_ok: 0, rows_skipped: 0 });
          const out = []; let skipped = 0; for (const x of r) { const rating = parseNumber(x[map.rating]); if (rating == null || rating < 1 || rating > 5) { skipped++; continue; } out.push({ product_id: pid, marketplace: p.marketplace, rating, title: map.title ? x[map.title] : "", body: (x[map.body] || "").slice(0, 4000), reviewed_at: map.date && !isNaN(Date.parse(x[map.date])) ? new Date(x[map.date]).toISOString() : null, source: fd(ri).src, kind: "user_supplied", import_id: imp.id }); }
          await store.addMany("reviews", out); await store.update("imports", imp.id, { rows_ok: out.length, rows_skipped: skipped }); say(root, "#rmsg", true, `Imported ${out.length}, skipped ${skipped} (invalid rating).`); setTimeout(refresh, 700);
        } catch (err) { say(root, "#rmsg", false, err.message); } });
    } };
}
