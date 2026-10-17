// Keyword tools that work on lists YOU provide or data you hold. No volumes are invented: sorting by volume only uses numbers that exist.
const norm = (s) => String(s || "").toLowerCase().replace(/[^\p{L}\p{N}\s'-]/gu, " ").replace(/\s+/g, " ").trim();
const bytes = (s) => new TextEncoder().encode(s).length;
export { bytes };

// "Keyword processor": dedupe phrases, filter by word count / required / excluded words, count word frequency, and
// build a unique-word string for a backend-keywords field within a byte budget (Amazon's limit varies by marketplace and category: verify it).
export function processKeywords(text, { minWords = 1, maxWords = 20, include = [], exclude = [], byteLimit = 249, skipWords = [] } = {}) {
  const raw = String(text || "").split(/\r?\n|,/).map(norm).filter(Boolean), seen = new Set(), phrases = [];
  let dupes = 0;
  const inc = include.map(norm).filter(Boolean), exc = exclude.map(norm).filter(Boolean);
  for (const p of raw) {
    if (seen.has(p)) { dupes++; continue; } seen.add(p);
    const w = p.split(" ").length;
    if (w < minWords || w > maxWords) continue;
    if (inc.length && !inc.every((x) => (" " + p + " ").includes(" " + x + " ") || p.includes(x))) continue;
    if (exc.some((x) => (" " + p + " ").includes(" " + x + " "))) continue;
    phrases.push(p);
  }
  const freq = new Map(); for (const p of phrases) for (const w of p.split(" ")) freq.set(w, (freq.get(w) || 0) + 1);
  const words = [...freq.entries()].map(([word, count]) => ({ word, count })).sort((a, b) => b.count - a.count || a.word.localeCompare(b.word));
  const skip = new Set(skipWords.map(norm)), out = []; let used = 0;
  for (const { word } of words) { if (skip.has(word)) continue; const add = bytes(word) + (out.length ? 1 : 0); if (used + add > byteLimit) continue; out.push(word); used += add; }
  return { input: raw.length, duplicates_removed: dupes, phrases, words, backend: out.join(" "), backend_bytes: used, byte_limit: byteLimit, backend_dropped: words.filter((w) => !skip.has(w.word)).length - out.length };
}

// Keyword overlap and gaps between ASINs. sets: { ASIN: [{keyword, rank, volume}] } (rank 1 = best). `mine` is the ASIN being compared to the others.
export function overlapGap(sets, { mine = null, top = 20 } = {}) {
  const asins = Object.keys(sets), byKw = new Map();
  for (const a of asins) for (const r of sets[a]) {
    const k = norm(r.keyword); if (!k) continue; if (!byKw.has(k)) byKw.set(k, { keyword: k, ranks: {}, volume: null });
    const e = byKw.get(k); if (r.rank != null) e.ranks[a] = r.rank; if (r.volume != null) e.volume = r.volume;
  }
  const rows = [...byKw.values()].map((e) => { const rk = Object.values(e.ranks); return { ...e, shared_by: Object.keys(e.ranks).length, best_rank: rk.length ? Math.min(...rk) : null }; });
  const bucket = (e) => (e.shared_by === asins.length ? "shared by all" : mine && e.ranks[mine] == null && Object.values(e.ranks).some((r) => r <= top) ? "gap" : mine && e.ranks[mine] != null && e.shared_by === 1 ? "only yours" : e.shared_by > 1 ? "partial overlap" : "unique to one");
  rows.forEach((e) => { e.group = bucket(e); });
  rows.sort((a, b) => b.shared_by - a.shared_by || (b.volume ?? -1) - (a.volume ?? -1) || a.keyword.localeCompare(b.keyword));
  const counts = {}; for (const e of rows) counts[e.group] = (counts[e.group] || 0) + 1;
  return { asins, rows, counts, note: mine ? `"gap" = at least one other ASIN ranks in the top ${top} for it and ${mine} has no recorded rank.` : "Choose which ASIN is yours to see gaps." };
}
