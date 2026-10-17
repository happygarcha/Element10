// Small helpers shared by all modules. No DOM access here so node tests can import it.
export const uid = () => (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36));
export const now = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
export const MARKETS = ["CA", "US"];
export const CURRENCY = { CA: "CAD", US: "USD" };
export const KINDS = ["observed", "user_supplied", "calculated", "estimated", "sample"];
export const KIND_HELP = {
  observed: "Read from an authorised data source by this app.",
  user_supplied: "Came from your upload or entry. Accuracy depends on its source.",
  calculated: "Worked out by this app from other numbers using a stated formula.",
  estimated: "A model's guess. Treat as a rough guide, not a fact.",
  sample: "Demo data. Not real Amazon data.",
};
export const num = (v, d = 0) => (v == null || !isFinite(v) ? "–" : Number(v).toLocaleString("en-CA", { minimumFractionDigits: d, maximumFractionDigits: d }));
export const money = (v, cur = "") => (v == null || !isFinite(v) ? "–" : (cur === "CAD" ? "C$" : cur === "USD" ? "$" : cur) + Number(v).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
export const clamp = (x, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, x));
export function fnum(v, dflt = null) {
  if (v === null || v === undefined || v === "") return dflt;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : dflt;
}
