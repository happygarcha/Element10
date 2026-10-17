import assert from "node:assert/strict";
import test from "node:test";
import { overlapGap, processKeywords } from "../js/calc/keywords.js";
import { analyseReviews } from "../js/calc/reviews.js";

test("keyword processor: dedupes, filters, counts, respects byte budget", () => {
  const r = processKeywords("Yoga Mat\nyoga  mat\nnon slip yoga mat\nmat, thick yoga mat\nbrandx mat", { exclude: ["brandx"], byteLimit: 20 });
  assert.equal(r.duplicates_removed, 1); assert.ok(!r.phrases.some((p) => p.includes("brandx")));
  assert.equal(r.words[0].word, "mat"); assert.equal(r.words[1].word, "yoga"); assert.ok(r.backend_bytes <= 20); assert.ok(r.backend.split(" ").length >= 1);
  assert.equal(processKeywords("a b c d", { minWords: 3 }).phrases.length, 1);
  assert.equal(processKeywords("").phrases.length, 0);
});
test("multi-byte words count bytes, not characters", () => { const r = processKeywords("日本語", { byteLimit: 5 }); assert.equal(r.backend, ""); });
test("overlap/gap: groups are exact and volumes never invented", () => {
  const o = overlapGap({ MINE: [{ keyword: "yoga mat", rank: 10 }, { keyword: "my only", rank: 5 }], A: [{ keyword: "Yoga Mat", rank: 3, volume: 900 }, { keyword: "thick mat", rank: 4 }], B: [{ keyword: "yoga mat", rank: 20 }] }, { mine: "MINE", top: 10 });
  const g = Object.fromEntries(o.rows.map((r) => [r.keyword, r]));
  assert.equal(g["yoga mat"].group, "shared by all"); assert.equal(g["yoga mat"].volume, 900); assert.equal(g["thick mat"].group, "gap"); assert.equal(g["my only"].group, "only yours");
  assert.equal(g["thick mat"].volume, null);
});
test("review analysis: distribution, themes from low-rated only, caveat on small samples", () => {
  const rows = [{ rating: 1, body: "It broke after a week and smells awful" }, { rating: 2, body: "Broke, cheap plastic" }, { rating: 5, body: "Great, size is perfect" }, { rating: 4, title: "good" }, { rating: "x", body: "bad" }];
  const a = analyseReviews(rows);
  assert.equal(a.n, 4); assert.equal(a.distribution[0].count, 1); assert.equal(a.low_count, 2);
  assert.equal(a.themes[0].theme, "Breaks / stops working"); assert.equal(a.themes[0].low_count, 2);
  assert.equal(a.themes.find((t) => t.theme === "Size / fit").low_count, 0); assert.equal(a.themes.find((t) => t.theme === "Size / fit").high_count, 1);
  assert.match(a.caveat, /anecdotes/);
  assert.ok(a.terms_low.some((t) => t.term === "broke" && t.count === 2));
  assert.equal(analyseReviews([]).average, null);
});
test("bad custom theme regex is skipped, not fatal", () => assert.equal(analyseReviews([{ rating: 1, body: "x" }], { themes: { bad: "(" } }).themes.length, 0));

import { PARITY, STATUSES, summary } from "../js/parity.js";
test("parity matrix: valid statuses, unique ids, evidence required for implemented, no overclaim", () => {
  const ids = new Set();
  for (const r of PARITY) {
    assert.ok(!ids.has(r.id), r.id); ids.add(r.id); assert.ok(STATUSES.includes(r.status), r.id);
    assert.ok(["official", "secondary", "unverified", "n/a"].includes(r.ref), r.id);
    if (r.status === "implemented") assert.ok(r.evidence && r.evidence !== "-", `${r.id} needs evidence`);
    if (r.status === "blocked" || r.status === "missing") assert.ok(r.gap && r.gap !== "-", `${r.id} needs a stated gap`);
    if (r.status !== "implemented") assert.ok(r.gap && r.gap !== "-", `${r.id} must say what differs`);
  }
  const s = summary(); assert.equal(s.total, PARITY.length); assert.ok(s.pct_implemented < 100);
});
