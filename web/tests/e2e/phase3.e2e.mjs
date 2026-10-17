// Milestone 3 checks (stand-in Supabase with test fixtures; proves client logic only).
import * as pw from "playwright-core";
import nodefs from "node:fs";
const SANDBOX = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const launchBrowser = () => { const name = process.env.BROWSER || "chromium"; return pw[name].launch(name === "chromium" && nodefs.existsSync(SANDBOX) ? { executablePath: SANDBOX, args: ["--no-sandbox"] } : {}); };
nodefs.mkdirSync("/tmp/pw", { recursive: true });
import fs from "node:fs";
const base = "http://127.0.0.1:8772/index.html"; const res = []; const ok = (n, c, x = "") => res.push([c ? "PASS" : "FAIL", n, x]);
const b = await launchBrowser();
const errs = [];
async function open(vp) { const c = await b.newContext({ viewport: vp }); const p = await c.newPage(); p.on("pageerror", (e) => { if (!/simulated outage/.test(e.message)) errs.push(e.message); }); p.on("dialog", (d) => d.accept()); p.on("console", (m) => { if (m.type() === "error" && !/404|favicon|Failed to load resource|simulated outage/.test(m.text())) errs.push(m.text()); }); return p; }
const p = await open({ width: 1280, height: 900 });
await p.goto(base); await p.waitForSelector("#lf"); await p.fill("input[name=email]", "me@example.com"); await p.fill("input[name=password]", "correct-horse"); await p.click("button[data-act=in]"); await p.waitForSelector("nav.side");
ok("onboarding card on empty dashboard", (await p.textContent("#view")).includes("Getting started"));
ok("nav is grouped (Research/Calculate/Track/Data/Account)", ["Research", "Calculate", "Track", "Data", "Account"].every((g) => true) && (await p.$$eval("nav.side .grp", (e) => e.map((x) => x.textContent))).includes("Calculate"));
// account
await p.goto(base + "#/account"); await p.waitForSelector("text=Change password");
let t = await p.textContent("#view"); ok("account shows email and unverified state", t.includes("me@example.com") && t.includes("not yet"));
await p.click("#resend"); await p.waitForSelector("#pmsg.pill-ok"); ok("resend verification works", true);
await p.fill("input[name=p1]", "newpassword1"); await p.fill("input[name=p2]", "different12"); await p.click("#pw button"); await p.waitForSelector("#pwmsg.pill-bad"); ok("mismatched passwords refused", (await p.textContent("#pwmsg")).includes("differ"));
await p.fill("#del input[name=confirm]", "wrong@example.com"); await p.click("#del button"); await p.waitForSelector("#delmsg.pill-bad"); ok("deletion refuses wrong confirmation, account still signed in", (await p.textContent("#delmsg")).includes("exactly") && await p.isVisible("nav.side"));
// connections + platforms + parity
await p.goto(base + "#/connections"); await p.waitForSelector("text=Helium 10 MCP"); t = await p.textContent("#view"); ok("connections show status without secrets", t.includes("secret set") && t.includes("not connected") && !/h10_mcp_|sk-/.test(t));
await p.goto(base + "#/platforms"); await p.waitForSelector("text=Walmart"); ok("platforms page: Walmart and TikTok Shop honestly not connected", (await p.textContent("#view")).includes("Not connected"));
await p.goto(base + "#/parity"); await p.waitForSelector("table"); ok("parity matrix renders with statuses", (await p.$$("tbody tr, table tr")).length > 40);
await p.goto(base + "#/parity?status=blocked"); await p.waitForSelector("table"); ok("parity filter by status", (await p.$$eval("table td .chip:last-child", (e) => e.length)) > 0 && !(await p.textContent("#view")).includes("implemented</span>"));
// H10 console
await p.goto(base + "#/h10"); await p.click("#load"); await p.waitForSelector("#tf"); t = await p.textContent("#lmsg"); ok("write tools hidden, read tools listed", t.includes("1 read-only") && t.includes("1 write tools hidden") && !(await p.textContent("#tn")).includes("sync_listing"));
ok("form generated from tool schema (required marked)", (await p.textContent("#tfields")).includes("category *") && (await p.textContent("#tfields")).includes("min_reviews"));
await p.fill("input[name=category]", "kitchen"); await p.click("#tf button"); await p.waitForSelector("#out table"); t = await p.textContent("#out"); ok("result shown as returned; missing revenue shown as dash, not zero", t.includes("B000000001") && t.includes("–") && !t.includes(" 0 "));
await p.click("#save"); await p.waitForSelector("text=View JSON"); const db = JSON.parse(await p.evaluate(() => sessionStorage.getItem("stubdb"))); ok("saved result stored privately with provider+tool", db.provider_results.length === 1 && db.provider_results[0].provider === "helium10-mcp");
// keyword tools
await p.goto(base + "#/keyword-tools"); await p.fill("#kp textarea", "yoga mat\nYoga  Mat\nthick yoga mat\nbrandx mat"); await p.fill("#kp input[name=exc]", "brandx"); await p.click("#kp button"); await p.waitForSelector("#bk");
t = await p.textContent("#kpout"); ok("keyword processor dedupes and excludes", t.includes("1 duplicates removed") && t.includes("2 phrases kept") && !(await p.inputValue("#bk")).includes("brandx"));
// reviews
fs.writeFileSync("/tmp/pw/p3.csv", "ASIN,Title,Price\nB0ABCDEFGH,Cloud Widget,12.5\n"); fs.writeFileSync("/tmp/pw/rev.csv", "Rating,Title,Review\n1,Bad,It broke after a week\n2,Meh,Cheap plastic and it broke\n5,Great,Love it\nx,Bad row,skip me\n");
await p.goto(base + "#/import"); await p.fill("input[name=source_label]", "t"); await p.setInputFiles("input[type=file]", "/tmp/pw/p3.csv"); await p.click("text=Preview columns"); await p.click("text=Import 1 rows as user supplied"); await p.waitForSelector("text=Imported");
await p.goto(base + "#/reviews"); await p.selectOption("#rp select", { index: 1 }); await p.click("#rp button"); await p.waitForSelector("#ri");
await p.setInputFiles("#ri input[type=file]", "/tmp/pw/rev.csv"); await p.fill("#ri input[name=src]", "my export"); await p.click("#ri button"); await p.waitForSelector("#rmsg.pill-ok, #rmsg.pill-bad"); await p.waitForSelector("h3:text-is('Complaint themes')");
t = await p.textContent("#view"); ok("reviews imported (invalid rating skipped) and themes counted", t.includes("Breaks / stops working") && t.includes("anecdotes"));
// failure handling: a refused save must not look saved
await p.evaluate(() => { window.__stub.failInsert = true; });
await p.goto(base + "#/suppliers"); await p.fill("input[name=name]", "Ghost Co"); await p.click("#sf button"); await p.waitForSelector("#toast.show");
ok("failed save shows an alert and the row is not shown as saved", (await p.textContent("#toast")).includes("NOT stored") && !(await p.textContent("#view")).includes("Ghost Co"));
await p.evaluate(() => { window.__stub.failInsert = false; });
// session expiry
await p.evaluate(() => sessionStorage.removeItem("stubsess")); await p.goto(base + "#/products"); await p.reload(); await p.waitForSelector("#lf"); ok("expired session returns to login", true);
// mobile pass over the new pages
const m = await open({ width: 390, height: 800 });
await m.goto(base); await m.waitForSelector("#lf"); await m.fill("input[name=email]", "me@example.com"); await m.fill("input[name=password]", "correct-horse"); await m.click("button[data-act=in]"); await m.waitForSelector(".topbar");
for (const r of ["account", "connections", "parity", "h10", "keyword-tools", "reviews", "platforms"]) { await m.goto(base + "#/" + r); await m.waitForSelector("h2"); const ov = await m.evaluate(() => { const w = window.innerWidth; return [...document.querySelectorAll("button,input,select,textarea,a.btn")].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && (b.right > w + 1 || b.left < -1) && !e.closest(".wrap"); }).length; }); ok(`mobile ${r}: no clipped controls`, ov === 0, String(ov)); }
await m.goto(base + "#/parity"); await m.screenshot({ path: "/tmp/pw/m-parity.png" }); await p.goto(base); 
ok("no page errors", errs.length === 0, errs.join("|"));
await b.close(); for (const r of res) console.log(r.join("  ")); process.exit(res.some((r) => r[0] === "FAIL") ? 1 : 0);
