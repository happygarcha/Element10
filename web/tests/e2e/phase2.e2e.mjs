// Phase 2 + mobile checks. Uses the Supabase STAND-IN (see README): proves our client logic, not the real services.
import * as pw from "playwright-core";
import nodefs from "node:fs";
const SANDBOX = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const launchBrowser = () => { const name = process.env.BROWSER || "chromium"; return pw[name].launch(name === "chromium" && nodefs.existsSync(SANDBOX) ? { executablePath: SANDBOX, args: ["--no-sandbox"] } : {}); };
nodefs.mkdirSync("/tmp/pw", { recursive: true });
import fs from "node:fs";
const base = "http://127.0.0.1:8772/index.html"; const res = []; const ok = (n, c, x = "") => res.push([c ? "PASS" : "FAIL", n, x]);
const b = await launchBrowser();
const ctx = await b.newContext({ viewport: { width: 390, height: 800 }, ...(process.env.BROWSER === "firefox" ? {} : { hasTouch: true, isMobile: true }) });
const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message)); p.on("dialog", (d) => d.accept()); p.on("console", (m) => { if (m.type() === "error" && !/404|favicon/.test(m.text())) errs.push(m.text()); });
await p.goto(base); await p.waitForSelector("#lf");
await p.fill("input[name=email]", "me@example.com"); await p.fill("input[name=password]", "correct-horse"); await p.click("button[data-act=in]"); await p.waitForSelector(".topbar");
ok("mobile: menu button visible, side nav hidden until opened", await p.isVisible("#menu") && !(await p.isVisible("nav.side")));
await p.click("#menu"); ok("mobile: menu opens", await p.isVisible("nav.side"));
await p.click("nav.side a[href='#/products']"); await p.waitForSelector("h2"); ok("mobile: choosing a link closes the menu", !(await p.isVisible("nav.side")));
const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2); ok("mobile: no horizontal page scroll on products", !overflow);
// product + live card
fs.writeFileSync("/tmp/pw/p2.csv", "ASIN,Title,Price\nB0ABCDEFGH,Cloud Widget,12.5\n");
await p.goto(base + "#/import"); await p.fill("input[name=source_label]", "t"); await p.setInputFiles("input[type=file]", "/tmp/pw/p2.csv"); await p.click("text=Preview columns"); await p.click("text=Import 1 rows as user supplied"); await p.waitForSelector("text=Imported");
await p.goto(base + "#/products"); await p.click("text=Cloud Widget"); await p.waitForSelector("text=Fetch now");
const t = await p.textContent("#view"); ok("live card lists configured providers only", t.includes("Keepa") && t.includes("not configured on server"));
await p.click("button[data-live=keepa]"); await p.waitForSelector("#liveres.pill-ok:not(:empty)");
await p.waitForFunction(() => document.querySelector("#view").textContent.includes("4,321"));
const st = JSON.parse(await p.evaluate(() => sessionStorage.getItem("stubdb")));
const bsr = st.observations.find((o) => o.metric === "bsr");
ok("live Keepa data stored as observed with provider source", bsr && bsr.kind === "observed" && /Keepa API/.test(bsr.source));
ok("function was called with the ASIN only, no keys in the browser", JSON.stringify(await p.evaluate(() => window.__stub.calls.filter((c) => c.name === "keepa"))) .includes("B0ABCDEFGH") && !JSON.stringify(await p.evaluate(() => window.__stub.calls)).match(/api[_-]?key|secret/i));
// keyword lookup
await p.goto(base + "#/keywords?marketplace=US"); await p.waitForSelector("#kv"); await p.fill("#kv textarea", "yoga mat\nunknown thing"); await p.click("#kv button");
await p.waitForFunction(() => document.querySelector("#kvres").textContent.includes("Saved 1 volumes"));
ok("keyword lookup keeps blanks blank (1 saved, 1 no data)", (await p.textContent("#kvres")).includes("1 had no data"));
await p.waitForFunction(() => document.querySelector("#view").textContent.includes("yoga mat")); ok("only the keyword with data is listed", !(await p.textContent("#view")).includes("unknown thing"));
// finder + seed expansion
await p.goto(base + "#/products"); await p.waitForSelector("#pf2"); await p.fill("#pf2 input[name=price_max]", "30"); await p.click("#pf2 button"); await p.waitForSelector(".fa");
ok("product finder lists ASINs from the provider", (await p.$$(".fa")).length === 2);
await p.click("#fd"); await p.waitForFunction(() => document.querySelector("#fdres") && document.querySelector("#fdres").textContent.includes("Saved"));
ok("finder details fetched and stored (observed)", JSON.parse(await p.evaluate(() => sessionStorage.getItem("stubdb"))).products.some((x) => x.asin === "B0FINDER01"));
await p.goto(base + "#/keywords?marketplace=US"); await p.waitForSelector("#kx"); await p.fill("#kx input[name=seed]", "yoga mat"); await p.click("#kx button"); await p.waitForFunction(() => document.querySelector("#kxres").textContent.includes("Saved 1 related"));
ok("seed expansion saves only keywords that have volume", (await p.textContent("#kxres")).includes("1 had no volume"));
// suppliers, ranks, sources, settings
await p.goto(base + "#/suppliers"); await p.fill("input[name=name]", "Acme"); await p.fill("input[name=cost]", "3.5"); await p.click("#sf button"); await p.waitForSelector("text=Acme");
ok("supplier quote saved", (await p.textContent("#view")).includes("Acme"));
await p.goto(base + "#/ranks"); await p.waitForSelector("h2"); ok("rank tracker empty state is honest", (await p.textContent("#view")).includes("No rank data yet"));
await p.goto(base + "#/sources"); await p.waitForSelector("text=Live integrations"); ok("sources page shows server status", (await p.textContent("#view")).includes("DataForSEO"));
await p.goto(base + "#/settings"); await p.waitForSelector("text=Security check"); ok("settings shows security check", (await p.textContent("#view")).includes("Public sign-up closed"));
// PWA files
for (const f of ["manifest.webmanifest", "sw.js", "icon-192.png", "icon-512.png"]) { const r = await p.request.get(base.replace("index.html", f)); ok(`served ${f}`, r.ok()); }
await p.waitForTimeout(500); ok("service worker registered", await p.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())));
await p.screenshot({ path: "/tmp/pw/mobile-settings.png" });
ok("no page errors", errs.length === 0, errs.join("|"));
await b.close(); for (const r of res) console.log(r.join("  ")); process.exit(res.some((r) => r[0] === "FAIL") ? 1 : 0);
