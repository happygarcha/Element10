"use strict";
// Live recalculation on the calculator page. The server does the maths; this only sends the form.
(function () {
  const form = document.getElementById("calc");
  if (!form) return;
  const csrf = document.querySelector('meta[name="csrf"]').content;
  let t;
  const money = (v, c) => (v == null ? "–" : (c === "CAD" ? "C$" : "$") + v.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  function render(box, r) {
    box.textContent = "";
    if (!r) return;
    if (!r.ok) { const p = document.createElement("p"); p.className = "pill-bad"; p.textContent = r.error; box.appendChild(p); return; }
    const x = r.result, cur = x.currency;
    const big = document.createElement("div"); big.className = "big " + (x.profit >= 0 ? "pos" : "neg");
    big.textContent = money(x.profit, cur) + " profit per unit"; box.appendChild(big);
    const meta = document.createElement("div"); meta.className = "sub";
    meta.textContent = "Margin " + (x.margin_pct == null ? "–" : x.margin_pct.toFixed(1) + "%") + "  ·  ROI " + (x.roi_pct == null ? "–" : x.roi_pct.toFixed(0) + "%") +
      "  ·  Break-even price " + money(x.break_even_price, cur); box.appendChild(meta);
    if (!r.verified) { const w = document.createElement("div"); w.className = "notice warn"; w.textContent = "Fee profile is not marked verified. Confirm each fee in Settings against Seller Central before trusting this result."; box.appendChild(w); }
    for (const l of x.lines) { const d = document.createElement("div"); d.className = "line"; const a = document.createElement("span"); a.textContent = l.label; const n = document.createElement("small"); n.textContent = " " + l.note; a.appendChild(n); const b = document.createElement("span"); b.textContent = money(l.amount, cur); d.appendChild(a); d.appendChild(b); box.appendChild(d); }
    const tp = document.createElement("div"); tp.className = "sub"; tp.style.marginTop = "8px";
    tp.textContent = "Price needed for margin: " + Object.entries(x.price_for_margin).map(([m, p]) => m + "% → " + (p == null ? "not reachable" : money(p, cur))).join("  ·  "); box.appendChild(tp);
    if (r.sens && r.sens.length) { const tb = document.createElement("table"); const h = document.createElement("tr"); for (const c of ["Price", "Profit", "Margin"]) { const th = document.createElement("th"); th.textContent = c; h.appendChild(th); } tb.appendChild(h); for (const s of r.sens) { const tr = document.createElement("tr"); for (const v of [money(s.price, cur), money(s.profit, cur), s.margin_pct == null ? "–" : s.margin_pct.toFixed(1) + "%"]) { const td = document.createElement("td"); td.textContent = v; tr.appendChild(td); } tb.appendChild(tr); } box.appendChild(tb); }
  }
  async function calc() {
    const data = {}; new FormData(form).forEach((v, k) => { data[k] = v; });
    const both = document.getElementById("both"); data.both = both && both.checked ? "1" : "0";
    try {
      const r = await fetch("/api/calc", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF": csrf }, body: JSON.stringify(data) });
      const j = await r.json();
      render(document.getElementById("res1"), j.primary); render(document.getElementById("res2"), j.secondary);
    } catch (e) { document.getElementById("res1").textContent = "Could not calculate: " + e.message; }
  }
  form.addEventListener("input", () => { clearTimeout(t); t = setTimeout(calc, 250); });
  calc();
})();
