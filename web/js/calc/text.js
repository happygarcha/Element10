// Keyword clustering and listing audit. Original rule-based logic; no AI text generation. Limits are configurable
// defaults, not Amazon facts: they vary by category and change over time.
const STOP = new Set("a an and the for of to in on with by or at is it your you from as".split(" "));
export const RISKY = ["best seller", "#1", "number one", "guarantee", "guaranteed", "free shipping", "cures", "cure", "treats", "heals", "clinically proven", "100% safe", "fda approved", "bpa free"];

export const tokens = (t) => (t.toLowerCase().match(/[a-z0-9]+(?:'[a-z]+)?/g) || []);
export function stem(w) {
  for (const suf of ["ings", "ing", "ies", "es", "s", "ed"]) if (w.endsWith(suf) && w.length - suf.length >= 3) return w.slice(0, -suf.length) + (suf === "ies" ? "y" : "");
  return w;
}
export const stems = (p) => new Set(tokens(p).filter((t) => !STOP.has(t)).map(stem));

export function clusterKeywords(items, threshold = 0.5) {
  const n = items.length, parent = Array.from({ length: n }, (_, i) => i);
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const sets = items.map((i) => stems(i.phrase));
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
    if (!sets[a].size || !sets[b].size) continue;
    let inter = 0; for (const x of sets[a]) if (sets[b].has(x)) inter++;
    const uni = sets[a].size + sets[b].size - inter;
    if (uni && inter / uni >= threshold) parent[find(b)] = find(a);
  }
  const groups = new Map();
  for (let i = 0; i < n; i++) { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(i); }
  const out = [];
  for (const idxs of groups.values()) {
    const members = idxs.map((i) => items[i]);
    const top = members.reduce((a, b) => ((b.volume || 0) > (a.volume || 0) || ((b.volume || 0) === (a.volume || 0) && b.phrase.length < a.phrase.length) ? b : a));
    const cnt = new Map(); for (const i of idxs) for (const s of sets[i]) cnt.set(s, (cnt.get(s) || 0) + 1);
    const vols = members.map((m) => m.volume).filter((v) => v != null);
    out.push({ label: top.phrase, top_terms: [...cnt.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map((e) => e[0]), size: members.length, total_volume: vols.length ? vols.reduce((a, b) => a + b, 0) : null, members });
  }
  out.sort((a, b) => (b.total_volume || 0) - (a.total_volume || 0) || b.size - a.size || a.label.localeCompare(b.label));
  return out;
}

export function syllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, ""); if (!w) return 0;
  let n = (w.match(/[aeiouy]+/g) || []).length;
  if (w.endsWith("e") && n > 1 && !w.endsWith("le")) n--;
  return Math.max(1, n);
}
export function readability(text) {
  const sentences = text.split(/[.!?]+|\n/).filter((s) => s.trim()), words = tokens(text);
  if (!words.length || !sentences.length) return { words: 0, sentences: 0, avg_sentence_words: null, flesch: null };
  const syl = words.reduce((a, w) => a + syllables(w), 0), wps = words.length / sentences.length, spw = syl / words.length;
  return { words: words.length, sentences: sentences.length, avg_sentence_words: Math.round(wps * 10) / 10, flesch: Math.round((206.835 - 1.015 * wps - 84.6 * spw) * 10) / 10 };
}
export function containsPhrase(text, phrase) {
  const tt = tokens(text).map(stem), pt = tokens(phrase).map(stem);
  if (!pt.length) return false;
  for (let i = 0; i + pt.length <= tt.length; i++) if (pt.every((p, j) => tt[i + j] === p)) return true;
  return false;
}
export function wordsAllPresent(text, phrase) {
  const have = new Set(tokens(text).map(stem)), need = tokens(phrase).filter((t) => !STOP.has(t)).map(stem);
  return need.length > 0 && need.every((w) => have.has(w));
}

export const DEFAULT_AUDIT = { title_max: 200, title_front_chars: 80, bullet_max: 500, bullets_expected: 5, repeat_limit: 3 };
export function auditListing(title, bullets, keywords, description = "", cfgIn = {}) {
  const cfg = { ...DEFAULT_AUDIT, ...cfgIn }, r = { findings: [], coverage: [], coverage_pct: null, readability: {} };
  const add = (level, area, message) => r.findings.push({ level, area, message });
  bullets = bullets.filter((b) => b.trim());
  if (!title.trim()) add("problem", "Title", "Title is empty.");
  else {
    if (title.length > cfg.title_max) add("problem", "Title", `${title.length} characters; the configured limit is ${cfg.title_max}.`);
    else add("ok", "Title", `${title.length} of ${cfg.title_max} characters.`);
    const letters = [...title].filter((c) => /[A-Za-z]/.test(c));
    if (letters.length && letters.filter((c) => c === c.toUpperCase()).length / letters.length > 0.5) add("warning", "Title", "Mostly capital letters; Title Case reads better and some categories restrict all-caps.");
  }
  if (bullets.length < cfg.bullets_expected) add("warning", "Bullets", `${bullets.length} bullets; most categories use ${cfg.bullets_expected}.`);
  bullets.forEach((b, n) => { if (b.length > cfg.bullet_max) add("problem", `Bullet ${n + 1}`, `${b.length} characters; configured limit ${cfg.bullet_max}.`); });
  const full = [title, ...bullets, description].join(" "), low = full.toLowerCase();
  for (const t of RISKY) if (low.includes(t)) add("warning", "Policy", `'${t}' can trigger a policy review. Check Amazon's rules for your category.`);
  const kws = [...keywords].sort((a, b) => (b.volume || 0) - (a.volume || 0));
  let covered = 0;
  for (const k of kws) {
    const ph = k.phrase, inTitle = containsPhrase(title, ph), inBul = bullets.some((b) => containsPhrase(b, ph)), inDesc = containsPhrase(description, ph);
    const status = inTitle || inBul || inDesc ? "exact phrase" : wordsAllPresent(full, ph) ? "words only" : "missing";
    if (status !== "missing") covered++;
    r.coverage.push({ phrase: ph, volume: k.volume, in_title: inTitle, in_bullets: inBul, in_description: inDesc, status });
    if (status === "missing" && (k.volume || 0) > 0) add("warning", "Keywords", `'${ph}' (volume ${Math.round(k.volume).toLocaleString("en-CA")}) is not covered.`);
    if (inTitle && title.toLowerCase().indexOf(ph.toLowerCase()) > cfg.title_front_chars) add("warning", "Title", `'${ph}' appears after the first ${cfg.title_front_chars} characters, which are most visible in search.`);
    const reps = low.split(ph.toLowerCase()).length - 1;
    if (reps > cfg.repeat_limit) add("warning", "Keywords", `'${ph}' appears ${reps} times; repeating it adds nothing and reads as stuffing.`);
  }
  if (kws.length) r.coverage_pct = Math.round(1000 * covered / kws.length) / 10;
  r.readability = readability([...bullets, ...(description ? [description] : [])].join(" "));
  if (r.readability.flesch != null && r.readability.flesch < 40) add("warning", "Readability", `Flesch score ${r.readability.flesch}: dense. Shorter sentences help shoppers skim.`);
  return r;
}
export function titleSkeleton(brand, primary, attributes, maxLen = 200) {
  let out = [brand, primary].map((p) => (p || "").trim()).filter(Boolean).join(" ");
  for (const a of attributes.map((x) => x.trim()).filter(Boolean)) { const t = out ? `${out}, ${a}` : a; if (t.length > maxLen) break; out = t; }
  return out.slice(0, maxLen).replace(/[, ]+$/, "");
}
