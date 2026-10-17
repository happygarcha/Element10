// Review analysis over reviews YOU import (CSV exports you are entitled to, or text you paste). Everything here is calculated
// from those rows with simple, visible rules: rating spread, theme counts from an editable keyword lexicon, and most frequent terms in low-rated reviews.
export const DEFAULT_THEMES = {
  "Breaks / stops working": "broke|broken|stopped working|stops working|died|defective|fell apart|cracked|snapped|doesn't work|does not work|malfunction",
  "Size / fit": "too small|too big|too large|too tight|too loose|doesn't fit|does not fit|runs small|runs large|smaller than|bigger than|size",
  "Quality / materials": "cheap|flimsy|thin|poor quality|low quality|plastic|material|feels cheap|stitching|fragile|durable",
  "Smell / chemicals": "smell|smells|odor|odour|chemical|fumes",
  "Not as described": "not as described|misleading|different from|looks nothing|photos|picture|advertised|not as pictured|wrong item|wrong color|wrong colour",
  "Shipping / packaging": "arrived damaged|damaged|packaging|late|missing|box|dented",
  "Instructions / setup": "instructions|assemble|assembly|hard to install|difficult to set up|setup|confusing",
  "Value / price": "overpriced|waste of money|not worth|expensive|rip off|ripoff|refund",
};
const STOP = new Set("the a an and or but if so to of in on for with at by from this that it its is are was were be been i my me we you your they them he she as not no very really just have has had can will would could than then there here do does did out up too one also get got product item amazon buy bought after when what which only more much".split(" "));
const words = (s) => String(s || "").toLowerCase().replace(/[^\p{L}\p{N}\s'-]/gu, " ").split(/\s+/).filter(Boolean);

export function analyseReviews(rows, { themes = DEFAULT_THEMES, lowMax = 3, topTerms = 15, quoteLen = 160 } = {}) {
  const rated = rows.filter((r) => Number.isFinite(r.rating) && r.rating >= 1 && r.rating <= 5), n = rated.length;
  const dist = [1, 2, 3, 4, 5].map((s) => ({ stars: s, count: rated.filter((r) => Math.round(r.rating) === s).length }));
  const low = rated.filter((r) => r.rating <= lowMax), high = rated.filter((r) => r.rating > lowMax);
  const text = (r) => `${r.title || ""} ${r.body || ""}`.toLowerCase();
  const themeRows = Object.entries(themes).map(([name, pattern]) => {
    let re; try { re = new RegExp(`\\b(?:${pattern})\\b`, "i"); } catch (_) { return null; }
    const hitsLow = low.filter((r) => re.test(text(r))), hitsHigh = high.filter((r) => re.test(text(r)));
    const q = hitsLow[0] ? (hitsLow[0].body || hitsLow[0].title || "").replace(/\s+/g, " ").slice(0, quoteLen) : null;
    return { theme: name, low_count: hitsLow.length, low_pct: low.length ? hitsLow.length / low.length * 100 : null, high_count: hitsHigh.length, example: q };
  }).filter(Boolean).sort((a, b) => b.low_count - a.low_count);
  const uni = new Map(), bi = new Map();
  for (const r of low) { const w = words(text(r)).filter((x) => !STOP.has(x) && x.length > 2); const seen = new Set();
    w.forEach((x, i) => { if (!seen.has(x)) { uni.set(x, (uni.get(x) || 0) + 1); seen.add(x); } if (i) { const b = w[i - 1] + " " + x; if (!seen.has(b)) { bi.set(b, (bi.get(b) || 0) + 1); seen.add(b); } } }); }
  const top = (m, min) => [...m.entries()].filter(([, c]) => c >= min).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, topTerms).map(([term, count]) => ({ term, count }));
  return { n, average: n ? rated.reduce((s, r) => s + r.rating, 0) / n : null, distribution: dist, low_count: low.length, low_share: n ? low.length / n * 100 : null, themes: themeRows,
    terms_low: top(uni, 2), phrases_low: top(bi, 2), caveat: n < 30 ? "Fewer than 30 rated reviews: treat these counts as anecdotes, not patterns." : null };
}
