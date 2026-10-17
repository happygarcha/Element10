// Tiny HTML helpers. Everything interpolated is escaped unless wrapped with raw(), so imported text can never run as markup.
import { KIND_HELP } from "./util.js";
export const raw = (s) => ({ __raw: String(s) });
const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
const one = (v) => (v && v.__raw !== undefined ? v.__raw : esc(v));
export function h(strings, ...vals) {
  let out = "";
  strings.forEach((s, i) => { out += s; if (i < vals.length) { const v = vals[i]; out += Array.isArray(v) ? v.map(one).join("") : one(v); } });
  return raw(out);
}
export const kindChip = (k) => h`<span class="chip ${k}" title="${KIND_HELP[k] || ""}">${String(k).replace("_", " ")}</span>`;
export const mpChip = (m) => h`<span class="chip mp">${m}</span>`;
export function spark(points, w = 140, ht = 32) {
  const vals = points.map((p) => p.value_num).filter((v) => v != null);
  if (vals.length < 2) return raw("");
  const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
  const pts = vals.map((v, i) => `${(i * (w - 4) / (vals.length - 1) + 2).toFixed(1)},${(ht - 3 - (v - lo) / span * (ht - 6)).toFixed(1)}`).join(" ");
  return raw(`<svg class="spark" width="${w}" height="${ht}" viewBox="0 0 ${w} ${ht}" role="img" aria-label="history"><polyline fill="none" stroke="currentColor" stroke-width="1.8" points="${pts}"/></svg>`);
}
export function download(name, text, type = "text/csv") {
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); a.remove();
}
export const toCSV = (cols, rows) => [cols.join(","), ...rows.map((r) => cols.map((c) => { const v = r[c] == null ? "" : String(r[c]); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }).join(","))].join("\n");
