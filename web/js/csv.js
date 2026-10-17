// RFC 4180-style CSV parser (quotes, escaped quotes, newlines inside quotes) with delimiter detection.
export function detectDelimiter(text) {
  const first = text.split(/\r?\n/, 1)[0] || "";
  let best = ",", bestN = -1;
  for (const d of [",", ";", "\t"]) {
    let n = 0, q = false;
    for (const c of first) { if (c === '"') q = !q; else if (c === d && !q) n++; }
    if (n > bestN) { best = d; bestN = n; }
  }
  return best;
}
export function parseCSV(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const d = detectDelimiter(text), rows = []; let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === d) { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cur); cur = ""; if (row.some((x) => x.trim() !== "")) rows.push(row); row = []; }
    else cur += c;
  }
  row.push(cur); if (row.some((x) => x.trim() !== "")) rows.push(row);
  if (!rows.length) return { headers: [], rows: [] };
  const headers = rows[0].map((h) => h.trim());
  return { headers, rows: rows.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? "").trim()]))) };
}
