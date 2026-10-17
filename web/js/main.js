// Element10 boot: storage mode (account / this device / demo), login, router.
import * as V from "./views.js";
import { h, raw, esc, download } from "./ui.js";
import { LocalAdapter, MemoryAdapter, Store, SupabaseAdapter, TABLES } from "./store.js";
import { seedDemo } from "./sample.js";

const cfg = window.ELEMENT10_CONFIG || {};
const app = document.getElementById("app");
const cloudConfigured = !!(cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase);
const ls = { get: (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* storage unavailable */ } } };

const S = { mode: null, store: null, client: null, user: null };
const NAV = [["#/", "Dashboard"], ["#/products", "Products"], ["#/import", "Import CSV"], ["#/calculator", "Profit calculator"], ["#/watchlists", "Watchlists"], ["#/alerts", "Alerts"], ["#/keywords", "Keywords"], ["#/audit", "Listing audit"], ["#/inventory", "Inventory planner"], ["#/ads", "Ad analysis"], ["#/projects", "Projects & reports"], ["#/sources", "Data sources"], ["#/settings", "Settings"]];
const ROUTES = [[/^$/, V.home], [/^products$/, V.products], [/^products\/(.+)$/, V.product], [/^compare$/, V.compare], [/^import$/, V.importPage], [/^calculator$/, V.calculator], [/^watchlists$/, V.watchlists], [/^alerts$/, V.alertsPage], [/^keywords$/, V.keywords], [/^audit$/, V.audit], [/^inventory$/, V.inventory], [/^ads$/, V.ads], [/^projects$/, V.projects], [/^projects\/(.+)$/, V.project], [/^sources$/, V.sources], [/^settings$/, V.settings]];

function ensureClient() {
  if (!S.client && cloudConfigured) S.client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true } });
  return S.client;
}

function loginScreen(message = "", recovery = false) {
  app.innerHTML = h`<div class="login"><h1>Element10</h1><p class="sub">Private Amazon FBA research workbench.</p>
  <form class="card" id="lf">${recovery ? h`<p><b>Choose a new password</b></p><label>New password</label><input type="password" name="password" minlength="8" required autocomplete="new-password">` : h`<label>Email</label><input type="email" name="email" required autocomplete="email"><label>Password</label><input type="password" name="password" minlength="8" required autocomplete="current-password">`}
  <p style="display:flex;gap:8px;flex-wrap:wrap"><button type="submit" data-act="${recovery ? "setpw" : "in"}">${recovery ? "Save password" : "Sign in"}</button>${!recovery && cfg.allowSignup !== false ? h`<button type="button" class="ghost" data-act="up">Create account</button>` : ""}</p><div id="msg" class="${message.startsWith("OK:") ? "pill-ok" : "pill-bad"}">${message.replace(/^OK:/, "")}</div></form>
  ${cloudConfigured ? "" : h`<div class="notice warn">No account database is connected yet, so sign-in is unavailable. Use this device only, or follow docs/06-hosting-and-login.md to connect a free Supabase project.</div>`}
  <div class="linkrow"><a href="#" id="local">Use on this device only (no account)</a><a href="#" id="demo">Try demo mode</a>${!recovery && cloudConfigured ? h`<a href="#" id="forgot">Forgot password</a>` : ""}</div></div>`.__raw;
  const msg = (t, ok) => { const m = document.getElementById("msg"); m.className = ok ? "pill-ok" : "pill-bad"; m.textContent = t; };
  document.getElementById("local").addEventListener("click", (e) => { e.preventDefault(); setMode("local"); });
  document.getElementById("demo").addEventListener("click", (e) => { e.preventDefault(); setMode("demo"); });
  const f = document.getElementById("lf"), client = ensureClient();
  const act = async (a) => {
    const email = f.email ? f.email.value.trim() : "", password = f.password.value;
    if (!client) return msg("Account database is not connected.");
    try {
      if (a === "setpw") { const { error } = await client.auth.updateUser({ password }); if (error) throw error; history.replaceState(null, "", location.pathname); return boot(); }
      if (a === "up") { const { data, error } = await client.auth.signUp({ email, password }); if (error) throw error; return data.session ? boot() : msg("Account created. Check your email to confirm, then sign in.", true); }
      const { error } = await client.auth.signInWithPassword({ email, password }); if (error) throw error; boot();
    } catch (e) { msg(e.message || "Sign-in failed."); }
  };
  f.addEventListener("submit", (e) => { e.preventDefault(); act(e.submitter ? e.submitter.dataset.act : "in"); });
  f.querySelectorAll("button[data-act='up']").forEach((b) => b.addEventListener("click", () => act("up")));
  const fg = document.getElementById("forgot");
  if (fg) fg.addEventListener("click", async (e) => { e.preventDefault(); const email = f.email && f.email.value.trim(); if (!email) return msg("Type your email first."); const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }); msg(error ? error.message : "If that email has an account, a reset link is on its way.", !error); });
}

function setMode(m) { ls.set("element10.mode", m); boot(); }

async function signOut() { if (S.client) await S.client.auth.signOut(); S.user = null; ls.set("element10.mode", cloudConfigured ? "cloud" : "local"); boot(); }

function shell() {
  const here = location.hash.split("?")[0] || "#/";
  const label = S.mode === "cloud" ? "Your account" : S.mode === "local" ? "This device only" : "Demo mode";
  app.innerHTML = h`<div class="shell"><nav class="side" aria-label="Main"><h1>Element10</h1>
  ${NAV.map(([href, l]) => h`<a href="${href}" class="${href === here || (href !== "#/" && here.startsWith(href)) ? "on" : ""}">${l}</a>`)}
  <div class="grp">Storage</div><div class="who">${label}${S.user ? h`<br>${S.user.email}` : ""}</div>
  <div style="padding:6px 10px;display:grid;gap:6px">${cloudConfigured && S.mode !== "cloud" ? h`<button class="ghost" data-m="cloud">Use my account</button>` : ""}${S.mode !== "local" ? h`<button class="ghost" data-m="local">Use this device</button>` : ""}${S.mode !== "demo" ? h`<button class="ghost" data-m="demo">Demo mode</button>` : ""}${S.mode === "cloud" ? h`<button class="ghost" id="so">Sign out</button>` : ""}</div></nav>
  <main>${S.mode === "demo" ? h`<div class="banner"><b>DEMO MODE.</b> Everything here is fictional sample data, kept in memory only and never mixed with your real research.</div>` : ""}<div id="view"></div></main></div>`.__raw;
  app.querySelectorAll("[data-m]").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.m)));
  const so = document.getElementById("so"); if (so) so.addEventListener("click", signOut);
}

async function route() {
  if (!S.store) return;
  shell();
  const view = document.getElementById("view"), [path, qs] = (location.hash.slice(2) || "").split("?"), q = new URLSearchParams(qs || "");
  for (const [re, fn] of ROUTES) {
    const m = path.match(re); if (!m) continue;
    try {
      const ctx = { store: S.store, mode: S.mode, cloud: S.mode === "cloud", q, id: m[1], refresh: route, env: S.mode === "cloud" ? "Your Supabase database (private to your login)." : S.mode === "local" ? "Only in this browser on this device (IndexedDB). Clearing site data deletes it, so download a backup from Settings." : "Nowhere: demo data lives in memory and disappears when you leave.", migrate, exportAll, importAll };
      const r = await fn(ctx); view.innerHTML = r.html.__raw; if (r.after) r.after(view); window.scrollTo(0, 0);
    } catch (e) { view.innerHTML = h`<div class="notice warn"><b>Something went wrong:</b> ${e.message}</div>`.__raw; console.error(e); }
    return;
  }
  view.innerHTML = '<div class="empty">Page not found.</div>';
}

function exportAll() {
  const out = { app: "element10", version: 1, exported_at: new Date().toISOString(), tables: S.store.t };
  download(`element10-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(out), "application/json");
}
async function importAll(text) {
  const d = JSON.parse(text); if (d.app !== "element10" || !d.tables) throw new Error("That file is not an Element10 backup.");
  let n = 0;
  for (const t of TABLES) {
    const have = new Set(S.store.t[t].map((r) => r.id)), rows = (d.tables[t] || []).filter((r) => r && r.id && !have.has(r.id));
    if (rows.length) { await S.store.addMany(t, rows); n += rows.length; }
  }
  return n;
}
async function migrate() {
  const local = new Store(new LocalAdapter(), "local"); await local.load();
  if (TABLES.some((t) => S.store.t[t].length)) throw new Error("Your account already has data. Download a backup of this device from the local mode Settings and restore it instead.");
  let n = 0; for (const t of TABLES) { const rows = local.t[t]; if (rows.length) { await S.store.addMany(t, rows.map((r) => ({ ...r }))); n += rows.length; } }
  return n;
}

async function boot() {
  let mode = ls.get("element10.mode") || (cloudConfigured ? "cloud" : "local");
  if (mode === "cloud" && !cloudConfigured) mode = "local";
  S.mode = mode; S.user = null; S.store = null;
  try {
    if (mode === "cloud") {
      const client = ensureClient(), { data } = await client.auth.getSession();
      if (!data.session) return loginScreen();
      S.user = data.session.user; S.store = new Store(new SupabaseAdapter(client), "cloud");
    } else if (mode === "demo") { S.store = new Store(new MemoryAdapter(), "demo"); }
    else S.store = new Store(new LocalAdapter(), "local");
    app.innerHTML = '<p style="padding:20px">Loading your data…</p>';
    await S.store.load();
    if (mode === "demo") await seedDemo(S.store);
  } catch (e) { app.innerHTML = h`<div class="login"><div class="notice warn"><b>Could not load data:</b> ${e.message}</div><p><a href="#" id="r">Try again</a> · <a href="#" id="l">Use this device only</a></p></div>`.__raw; document.getElementById("r").onclick = (ev) => { ev.preventDefault(); boot(); }; document.getElementById("l").onclick = (ev) => { ev.preventDefault(); setMode("local"); }; return; }
  route();
}

window.addEventListener("hashchange", route);
if (cloudConfigured) ensureClient().auth.onAuthStateChange((ev) => { if (ev === "PASSWORD_RECOVERY") loginScreen("", true); });
boot();
