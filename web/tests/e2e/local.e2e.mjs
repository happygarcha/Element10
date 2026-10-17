import { chromium } from "playwright-core";
import fs from "node:fs";
const base = "http://127.0.0.1:8771/index.html";
const results = []; const ok = (name, cond, extra = "") => { results.push([cond ? "PASS" : "FAIL", name, extra]); };
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await ctx.newPage(); const errors = [];
page.on("pageerror", (e) => errors.push(e.message)); page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.goto(base + "#/"); await page.waitForSelector("h2");
ok("local mode boots with no config", (await page.textContent("nav.side")).includes("This device only"));
ok("empty state shown", (await page.textContent("#view")).includes("Nothing here yet"));

// import a CSV through the real UI
await page.goto(base + "#/import");
fs.writeFileSync("/tmp/pw/p.csv", "ASIN,Title,Price,Reviews,Rating,BSR\nB0ABCDEFGH,Widget One,19.99,120,4.2,15000\nB0ZZZZZZZZ,<b>Gadget</b> Two,34.50,3000,4.6,2500\n");
await page.fill("input[name=source_label]", "My test export"); await page.setInputFiles("input[type=file]", "/tmp/pw/p.csv"); await page.click("text=Preview columns");
await page.waitForSelector("text=Check how the columns were matched").catch(() => {});
ok("mapping step shows detected columns", (await page.textContent("#view")).includes("2 rows found"));
await page.click("text=Import 2 rows as user supplied"); await page.waitForSelector("text=Imported");
ok("import completes", (await page.textContent("#view")).includes("Imported 2 rows"));

await page.goto(base + "#/products"); await page.waitForSelector("table");
const html = await page.innerHTML("#view");
ok("products listed", html.includes("Widget One"));
ok("imported markup is escaped (no live <b> in a title)", !html.includes("<b>Gadget</b>") && html.includes("&lt;b&gt;Gadget"));
// persistence across reload (IndexedDB)
await page.reload(); await page.waitForSelector("table");
ok("data survives a reload (IndexedDB)", (await page.textContent("#view")).includes("Widget One"));

// calculator: fx error then computed result
await page.goto(base + "#/calculator?marketplace=CA&sell_price=40&supplier_cost=5&fba_fee=6");
await page.waitForSelector("#res1");
ok("CA calc without FX stops with an error", (await page.textContent("#res1")).includes("Missing exchange rate"));
await page.goto(base + "#/settings"); await page.fill("input[name=usd_cad]", "1.4"); await page.click("text=Save rates");
await page.goto(base + "#/calculator?marketplace=CA&sell_price=40&supplier_cost=5&fba_fee=6"); await page.waitForSelector("#res1 .big");
const txt = await page.textContent("#res1");
ok("CA calc computes in CAD with an unverified warning", txt.includes("profit per unit") && txt.includes("C$") && txt.includes("not marked verified"), txt.slice(0, 80));
await page.check("#both"); await page.fill("input[name=s_sell_price]", "30"); await page.waitForTimeout(400);
ok("second marketplace computed in USD", (await page.textContent("#res2")).includes("$"));
// verify profile then warning disappears
await page.goto(base + "#/settings"); await page.fill(".prof[data-mp=CA] input[name=fba_fee]", "6"); await page.check(".prof[data-mp=CA] input[name=verified]"); await page.click("text=Save CA profile");
await page.goto(base + "#/calculator?marketplace=CA&sell_price=40&supplier_cost=5"); await page.waitForSelector("#res1 .big");
ok("verified profile removes the warning", !(await page.textContent("#res1")).includes("not marked verified"));

// watchlist + rule + alert
await page.goto(base + "#/watchlists"); await page.fill("#newwl input[name=name]", "Main"); await page.click("#newwl button");
await page.goto(base + "#/products"); await page.click("a:has-text('Widget One')"); await page.waitForSelector("#addwl"); await page.click("#addwl");
await page.goto(base + "#/watchlists"); await page.waitForSelector(".addrule"); await page.fill(".addrule input[name=threshold]", "25"); await page.click(".addrule button");
await page.goto(base + "#/alerts"); await page.waitForSelector("h2");
ok("alert created for price below 25", (await page.textContent("#view")).includes("below 25"));

// inventory + audit + ads
await page.goto(base + "#/inventory"); await page.waitForSelector("#invout .big");
ok("inventory planner computes", (await page.textContent("#invout")).includes("Reorder point"));
await page.goto(base + "#/audit"); await page.fill("input[name=title]", "Acme Silicone Spatula"); await page.fill("textarea[name=keywords]", "silicone spatula, 5000\nbaking tools, 900"); await page.click("text=Audit listing");
await page.waitForSelector("text=Keyword coverage");
ok("listing audit runs", (await page.textContent("#out")).includes("baking tools"));
await page.goto(base + "#/ads"); fs.writeFileSync("/tmp/pw/ads.csv", "Customer Search Term,Impressions,Clicks,Spend,7 Day Total Sales,7 Day Total Orders (#)\nspatula,1000,40,25.5,0,0\nbaking set,500,20,10,100,4\n");
await page.fill("input[name=source_label]", "ads test"); await page.setInputFiles("#adup input[type=file]", "/tmp/pw/ads.csv"); await page.click("text=Import report"); await page.waitForSelector("text=Wasted spend");
ok("ad analysis flags wasted spend", (await page.textContent("#adout")).includes("spatula"));

// backup + restore round trip
const [dl] = await Promise.all([page.waitForEvent("download"), (async () => { await page.goto(base + "#/settings"); await page.click("#exp"); })()]);
const backup = await dl.path(); const data = JSON.parse(fs.readFileSync(backup, "utf8"));
ok("backup contains the imported products", data.tables.products.length === 2 && data.tables.observations.length > 5);

// demo mode never touches local data
await page.evaluate(() => localStorage.setItem("element10.mode", "demo")); await page.goto(base + "#/products"); await page.reload(); await page.waitForSelector("table");
const demo = await page.textContent("#view");
ok("demo shows sample data and banner", demo.includes("SAMPLE") && (await page.textContent("main")).includes("DEMO MODE") && !demo.includes("Widget One"));
await page.evaluate(() => localStorage.setItem("element10.mode", "local")); await page.reload(); await page.waitForSelector("table");
ok("local data untouched by demo", (await page.textContent("#view")).includes("Widget One") && !(await page.textContent("#view")).includes("SAMPLE"));
ok("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
await page.screenshot({ path: "/tmp/e10_final.png" });
await browser.close();
for (const r of results) console.log(r.join("  "));
process.exit(results.some((r) => r[0] === "FAIL") ? 1 : 0);
