"""FastAPI app: server-rendered pages. Secrets never reach the browser; state-changing requests carry a
CSRF token; demo and live data are separate databases chosen by a cookie."""

from __future__ import annotations

import csv
import io
import json
import secrets
from dataclasses import fields
from pathlib import Path

from fastapi import FastAPI, Form, HTTPException, Request, UploadFile
from fastapi.responses import (
    HTMLResponse,
    JSONResponse,
    PlainTextResponse,
    RedirectResponse,
    Response,
)
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from markupsafe import Markup

from .. import alerts as alerts_mod
from .. import db, services
from ..calc import profit as pf
from ..calc.score import DEFAULT_PARAMS, DEFAULT_WEIGHTS, EXPLAIN, opportunity
from ..calc.text import AuditConfig, audit_listing, cluster_keywords, title_skeleton
from ..config import Settings
from ..imports import (
    KEYWORD_ALIASES,
    PRODUCT_ALIASES,
    detect_mapping,
    import_keywords,
    import_products,
    read_rows,
)
from ..provenance import KIND_HELP
from ..providers.registry import provider_matrix
from ..providers.sample import seed_demo

HERE = Path(__file__).parent
MAX_UPLOAD = 2_000_000


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    app = FastAPI(title="Amazon research workbench", docs_url=None, redoc_url=None)
    app.state.settings = settings
    app.state.conns = {}
    app.mount("/static", StaticFiles(directory=HERE / "static"), name="static")
    tpl = Jinja2Templates(directory=str(HERE / "templates"))

    def fmt_money(v, cur=""):
        return "–" if v is None else f"{cur}{v:,.2f}"

    tpl.env.filters["money"] = fmt_money
    tpl.env.filters["num"] = lambda v, d=0: "–" if v is None else f"{v:,.{d}f}"
    tpl.env.filters["short"] = lambda s, n=60: (s or "")[:n] + ("…" if s and len(s) > n else "")
    tpl.env.globals["KIND_HELP"] = KIND_HELP

    def spark(points, w=140, h=32):
        """Tiny inline SVG line of a metric's history. Built only from stored numbers."""
        vals = [p["value_num"] for p in points if p.get("value_num") is not None]
        if len(vals) < 2:
            return Markup("")
        lo, hi = min(vals), max(vals)
        span = (hi - lo) or 1.0
        pts = " ".join(f"{i * (w - 4) / (len(vals) - 1) + 2:.1f},{h - 3 - (v - lo) / span * (h - 6):.1f}" for i, v in enumerate(vals))
        return Markup(f'<svg class="spark" width="{w}" height="{h}" viewBox="0 0 {w} {h}" role="img" aria-label="history">'
                      f'<polyline fill="none" stroke="currentColor" stroke-width="1.8" points="{pts}"/></svg>')

    tpl.env.globals["spark"] = spark

    def conn_for(mode: str):
        if mode not in app.state.conns:
            c = db.connect(settings.data_dir / f"{mode}.db")
            if mode == "demo":
                seed_demo(c)
            app.state.conns[mode] = c
        return app.state.conns[mode]

    def mode_of(request: Request) -> str:
        chosen = request.cookies.get("arp_mode") or settings.get("ARP_DEFAULT_MODE", "live")
        return "demo" if chosen == "demo" else "live"

    def ctx(request: Request, **kw):
        mode = mode_of(request)
        token = request.cookies.get("arp_csrf") or secrets.token_urlsafe(24)
        request.state.csrf = token
        base = {"request": request, "mode": mode, "csrf": token, "nav": request.url.path}
        base.update(kw)
        return base

    def render(request: Request, name: str, **kw):
        resp = tpl.TemplateResponse(request, name, ctx(request, **kw))
        if not request.cookies.get("arp_csrf"):
            resp.set_cookie("arp_csrf", request.state.csrf, httponly=True, samesite="strict")
        return resp

    async def check_csrf(request: Request, csrf: str | None):
        tok = request.cookies.get("arp_csrf")
        sent = csrf or request.headers.get("x-csrf")
        if not tok or not sent or not secrets.compare_digest(tok, sent):
            raise HTTPException(403, "Security check failed. Reload the page and try again.")

    def C(request: Request):
        return conn_for(mode_of(request))

    def fnum(v, default=None):
        try:
            return float(str(v).replace(",", "")) if v not in (None, "") else default
        except ValueError:
            return default

    # ---------- dashboard ----------
    @app.get("/", response_class=HTMLResponse)
    def home(request: Request):
        conn = C(request)
        rows = services.product_rows(conn, {})
        top = rows[:5]
        counts = {"products": len(rows), "watch": conn.execute("SELECT COUNT(DISTINCT product_id) FROM watchlist_items").fetchone()[0],
                  "keywords": conn.execute("SELECT COUNT(*) FROM keywords").fetchone()[0],
                  "alerts": conn.execute("SELECT COUNT(*) FROM alerts WHERE acknowledged=0").fetchone()[0]}
        imports = conn.execute("SELECT * FROM imports ORDER BY id DESC LIMIT 5").fetchall()
        return render(request, "home.html", top=top, counts=counts, imports=imports,
                      profile_unverified=[m for m in services.MARKETS if not services.fee_profile(conn, m)["verified_at"]],
                      fx_missing=not services.fx_rates(conn).get("USD_CAD"))

    # ---------- mode ----------
    @app.post("/mode")
    async def set_mode(request: Request, mode: str = Form(...), csrf: str = Form("")):
        await check_csrf(request, csrf)
        r = RedirectResponse(request.headers.get("referer") or "/", status_code=303)
        r.set_cookie("arp_mode", "demo" if mode == "demo" else "live", samesite="strict")
        return r

    # ---------- products ----------
    FILTERS = ("marketplace", "q", "category", "sort", "dir")
    NUM_FILTERS = ("price_min", "price_max", "reviews_max", "rating_max", "rank_min", "rank_max", "units_min", "margin_min")

    @app.get("/products", response_class=HTMLResponse)
    def products(request: Request):
        q = request.query_params
        f = {k: q.get(k) for k in FILTERS if q.get(k)}
        for k in NUM_FILTERS:
            f[k] = fnum(q.get(k))
        rows = services.product_rows(C(request), f)
        return render(request, "products.html", rows=rows, f=q, shown=len(rows))

    @app.get("/products/{pid}", response_class=HTMLResponse)
    def product(request: Request, pid: int):
        conn = C(request)
        p = conn.execute("SELECT * FROM products WHERE id=?", (pid,)).fetchone()
        if not p:
            raise HTTPException(404, "Product not found")
        lat = services.latest(conn, pid)
        weights, params = services.get_scoring(conn)
        sc = opportunity(services.score_inputs(lat), weights, params)
        hist = {m: services.series(conn, pid, m) for m in ("price", "bsr", "reviews", "rating")}
        wls = conn.execute("SELECT * FROM watchlists ORDER BY name").fetchall()
        prs = conn.execute("SELECT * FROM projects ORDER BY name").fetchall()
        inwl = [r[0] for r in conn.execute("SELECT watchlist_id FROM watchlist_items WHERE product_id=?", (pid,))]
        return render(request, "product.html", p=p, lat=lat, sc=sc, hist=hist, wls=wls, prs=prs, inwl=inwl, explain=EXPLAIN)

    @app.post("/products/{pid}/watch")
    async def watch_add(request: Request, pid: int, watchlist_id: int = Form(...), csrf: str = Form("")):
        await check_csrf(request, csrf)
        conn = C(request)
        conn.execute("INSERT OR IGNORE INTO watchlist_items VALUES (?,?,?)", (watchlist_id, pid, db.now()))
        conn.commit()
        return RedirectResponse(f"/products/{pid}", 303)

    @app.post("/products/{pid}/project")
    async def project_add(request: Request, pid: int, project_id: int = Form(...), csrf: str = Form("")):
        await check_csrf(request, csrf)
        conn = C(request)
        conn.execute("INSERT OR IGNORE INTO project_items (project_id, product_id) VALUES (?,?)", (project_id, pid))
        conn.commit()
        return RedirectResponse(f"/products/{pid}", 303)

    # ---------- compare ----------
    @app.get("/compare", response_class=HTMLResponse)
    def compare(request: Request):
        conn = C(request)
        ids = [int(x) for x in request.query_params.get("ids", "").split(",") if x.strip().isdigit()][:8]
        weights, params = services.get_scoring(conn)
        items = []
        for pid in ids:
            p = conn.execute("SELECT * FROM products WHERE id=?", (pid,)).fetchone()
            if p:
                lat = services.latest(conn, pid)
                items.append({"p": p, "lat": lat, "sc": opportunity(services.score_inputs(lat), weights, params)})
        rows = [("price", "Price"), ("rating", "Rating"), ("reviews", "Reviews"), ("bsr", "Best Sellers Rank"),
                ("monthly_units", "Monthly units"), ("monthly_revenue", "Monthly revenue"), ("seller_count", "Sellers"),
                ("fba_fee", "FBA fee"), ("referral_fee", "Referral fee"), ("est_margin_pct", "Est. margin %")]
        return render(request, "compare.html", items=items, rows=rows, ids=",".join(map(str, ids)))

    # ---------- import ----------
    @app.get("/import", response_class=HTMLResponse)
    def import_page(request: Request):
        imps = C(request).execute("SELECT * FROM imports ORDER BY id DESC LIMIT 20").fetchall()
        return render(request, "import.html", step="upload", imps=imps, preview=None)

    @app.post("/import/preview", response_class=HTMLResponse)
    async def import_preview(request: Request, file: UploadFile, kind: str = Form("products"), marketplace: str = Form("CA"),
                             source_label: str = Form(...), as_of: str = Form(""), csrf: str = Form("")):
        await check_csrf(request, csrf)
        raw = await file.read(MAX_UPLOAD + 1)
        if len(raw) > MAX_UPLOAD:
            raise HTTPException(413, "File too large (limit 2 MB).")
        text = raw.decode("utf-8-sig", errors="replace")
        headers, rows = read_rows(text)
        aliases = PRODUCT_ALIASES if kind == "products" else KEYWORD_ALIASES
        mapping = detect_mapping(headers, aliases)
        return render(request, "import.html", step="map", imps=[], preview={
            "text": text, "headers": headers, "rows": rows[:5], "total": len(rows), "mapping": mapping, "aliases": list(aliases),
            "kind": kind, "marketplace": marketplace, "source_label": source_label, "as_of": as_of, "filename": file.filename or "upload.csv"})

    @app.post("/import/commit")
    async def import_commit(request: Request):
        form = await request.form()
        await check_csrf(request, str(form.get("csrf", "")))
        kind, mp = str(form["kind"]), str(form["marketplace"])
        mapping = {k[4:]: str(v) for k, v in form.items() if k.startswith("map_") and v}
        stamp = str(form.get("as_of") or "") or None
        if stamp and len(stamp) == 10:
            stamp += "T00:00:00Z"
        conn = C(request)
        dkind = "sample" if mode_of(request) == "demo" else "user_supplied"
        fn = import_products if kind == "products" else import_keywords
        try:
            res = fn(conn, str(form["text"]), marketplace=mp, source_label=str(form["source_label"]),
                     filename=str(form.get("filename") or "upload.csv"), as_of=stamp, mapping=mapping, kind=dkind)
        except ValueError as e:
            raise HTTPException(400, str(e)) from e
        created = alerts_mod.evaluate(conn) if kind == "products" else 0
        return render(request, "import.html", step="done", imps=[], preview={"res": res, "alerts": created, "kind": kind})

    # ---------- calculator ----------
    INPUT_FIELDS = {f.name for f in fields(pf.ProfitInputs)} - {"fx", "marketplace", "ad_mode", "duties_base", "supplier_currency",
                                                                 "freight_currency", "lose_fba_fee_on_return"}

    def build_inputs(conn, data: dict, mp: str) -> pf.ProfitInputs:
        prof = services.fee_profile(conn, mp)["data"]
        kw = {k: fnum(data.get(k), prof.get(k, 0.0)) for k in INPUT_FIELDS}
        kw = {k: (0.0 if v is None else v) for k, v in kw.items()}
        return pf.ProfitInputs(marketplace=mp, ad_mode=data.get("ad_mode") or "acos",
                               duties_base=data.get("duties_base") or "cost_only",
                               supplier_currency=(data.get("supplier_currency") or "USD").upper(),
                               freight_currency=(data.get("freight_currency") or "USD").upper(),
                               lose_fba_fee_on_return=str(data.get("lose_fba_fee_on_return", "1")) not in ("0", "false", "off", ""),
                               fx=services.fx_for(conn, mp), **kw)

    def run_calc(conn, data: dict) -> dict:
        out = {}
        for key, mp in (("primary", data.get("marketplace") or "CA"), ("secondary", None)):
            if key == "secondary":
                if str(data.get("both")) not in ("1", "true", "on"):
                    break
                mp = "US" if (data.get("marketplace") or "CA") == "CA" else "CA"
                d2 = {k[2:]: v for k, v in data.items() if k.startswith("s_")}
                d2 = {**{k: data.get(k) for k in ("supplier_cost", "supplier_currency", "freight_per_unit", "freight_currency")}, **d2}
                inputs = build_inputs(conn, d2, mp)
            else:
                inputs = build_inputs(conn, data, mp)
            try:
                res = pf.compute(inputs)
                prof = services.fee_profile(conn, mp)
                out[key] = {"ok": True, "result": res.as_dict(), "verified": bool(prof["verified_at"]), "sens": pf.sensitivity(
                    inputs, [round(res.sell_price * m, 2) for m in (0.8, 0.9, 1.0, 1.1, 1.2)]) if res.sell_price > 0 else []}
            except pf.CalcError as e:
                out[key] = {"ok": False, "error": str(e), "marketplace": mp}
        return out

    @app.get("/calculator", response_class=HTMLResponse)
    def calculator(request: Request):
        conn = C(request)
        q = dict(request.query_params)
        mp = q.get("marketplace", "CA")
        pid = int(q["product"]) if q.get("product", "").isdigit() else None
        prod = conn.execute("SELECT * FROM products WHERE id=?", (pid,)).fetchone() if pid else None
        if prod:
            mp = prod["marketplace"]
            lat = services.latest(conn, pid)
            for src, dst in (("price", "sell_price"), ("fba_fee", "fba_fee")):
                if src in lat and dst not in q:
                    q[dst] = str(lat[src]["value_num"])
        prof = services.fee_profile(conn, mp)
        vals = {**prof["data"], **q}
        other = "US" if mp == "CA" else "CA"
        oprof = services.fee_profile(conn, other)
        projects = conn.execute("SELECT * FROM projects ORDER BY name").fetchall()
        runs = conn.execute("SELECT * FROM calc_runs ORDER BY id DESC LIMIT 8").fetchall()
        return render(request, "calculator.html", mp=mp, other=other, vals=vals, prof=prof, oprof=oprof, prod=prod,
                      fx=services.fx_rates(conn), projects=projects, runs=runs, initial=run_calc(conn, {**vals, "marketplace": mp, **{k: v for k, v in q.items()}}) if q.get("sell_price") else None)

    @app.post("/api/calc")
    async def api_calc(request: Request):
        await check_csrf(request, None)
        data = await request.json()
        return JSONResponse(run_calc(C(request), data))

    @app.post("/calculator/save")
    async def calc_save(request: Request):
        form = dict(await request.form())
        await check_csrf(request, str(form.get("csrf", "")))
        conn = C(request)
        mp = form.get("marketplace", "CA")
        inputs = build_inputs(conn, form, mp)
        try:
            res = pf.compute(inputs)
        except pf.CalcError as e:
            raise HTTPException(400, str(e)) from e
        pid = int(form["product_id"]) if str(form.get("product_id", "")).isdigit() else None
        prj = int(form["project_id"]) if str(form.get("project_id", "")).isdigit() else None
        services.save_calc(conn, marketplace=mp, inputs=inputs, result=res, label=str(form.get("label", "")), product_id=pid, project_id=prj)
        return RedirectResponse(f"/products/{pid}" if pid else "/calculator", 303)

    # ---------- watchlists & alerts ----------
    @app.get("/watchlists", response_class=HTMLResponse)
    def watchlists(request: Request):
        conn = C(request)
        wls = []
        for w in conn.execute("SELECT * FROM watchlists ORDER BY name"):
            items = [dict(r) for r in conn.execute(
                "SELECT p.* FROM watchlist_items i JOIN products p ON p.id=i.product_id WHERE i.watchlist_id=?", (w["id"],))]
            rules = [dict(r) for r in conn.execute("SELECT * FROM alert_rules WHERE watchlist_id=?", (w["id"],))]
            for it in items:
                it["lat"] = services.latest(conn, it["id"])
                it["price_hist"] = services.series(conn, it["id"], "price")
            wls.append({"w": dict(w), "items": items, "rules": rules})
        return render(request, "watchlists.html", wls=wls, ops=alerts_mod.OPS)

    @app.post("/watchlists")
    async def watchlist_create(request: Request, name: str = Form(...), csrf: str = Form("")):
        await check_csrf(request, csrf)
        conn = C(request)
        conn.execute("INSERT OR IGNORE INTO watchlists (name, created_at) VALUES (?,?)", (name.strip()[:80], db.now()))
        conn.commit()
        return RedirectResponse("/watchlists", 303)

    @app.post("/watchlists/{wid}/rule")
    async def rule_create(request: Request, wid: int, metric: str = Form(...), op: str = Form(...), threshold: float = Form(...), csrf: str = Form("")):
        await check_csrf(request, csrf)
        if op not in alerts_mod.OPS:
            raise HTTPException(400, "Unknown rule type")
        conn = C(request)
        conn.execute("INSERT INTO alert_rules (watchlist_id, metric, op, threshold, created_at) VALUES (?,?,?,?,?)", (wid, metric, op, threshold, db.now()))
        conn.commit()
        alerts_mod.evaluate(conn)
        return RedirectResponse("/watchlists", 303)

    @app.post("/watchlists/{wid}/remove/{pid}")
    async def watch_remove(request: Request, wid: int, pid: int, csrf: str = Form("")):
        await check_csrf(request, csrf)
        conn = C(request)
        conn.execute("DELETE FROM watchlist_items WHERE watchlist_id=? AND product_id=?", (wid, pid))
        conn.commit()
        return RedirectResponse("/watchlists", 303)

    @app.get("/alerts", response_class=HTMLResponse)
    def alerts_page(request: Request):
        rows = C(request).execute("SELECT a.*, p.asin, p.title, p.marketplace FROM alerts a JOIN products p ON p.id=a.product_id ORDER BY a.acknowledged, a.id DESC LIMIT 200").fetchall()
        return render(request, "alerts.html", rows=rows)

    @app.post("/alerts/{aid}/ack")
    async def alert_ack(request: Request, aid: int, csrf: str = Form("")):
        await check_csrf(request, csrf)
        conn = C(request)
        conn.execute("UPDATE alerts SET acknowledged=1 WHERE id=?", (aid,))
        conn.commit()
        return RedirectResponse("/alerts", 303)

    # ---------- keywords ----------
    @app.get("/keywords", response_class=HTMLResponse)
    def keywords(request: Request):
        conn = C(request)
        mp = request.query_params.get("marketplace", "US")
        items = []
        for k in conn.execute("SELECT * FROM keywords WHERE marketplace=? ORDER BY phrase", (mp,)):
            obs = {r["metric"]: dict(r) for r in conn.execute(
                "SELECT o.* FROM keyword_observations o WHERE keyword_id=? AND asin IS NULL ORDER BY as_of, id", (k["id"],))}
            items.append({"phrase": k["phrase"], "volume": (obs.get("search_volume") or {}).get("value_num"),
                          "competition": (obs.get("competition") or {}).get("value_num"), "obs": obs})
        clusters = cluster_keywords([{"phrase": i["phrase"], "volume": i["volume"]} for i in items])
        return render(request, "keywords.html", items=items, clusters=clusters, mp=mp)

    # ---------- listing audit ----------
    @app.get("/listing-audit", response_class=HTMLResponse)
    def audit_page(request: Request):
        return render(request, "audit.html", res=None, form={}, skeleton=None)

    @app.post("/listing-audit", response_class=HTMLResponse)
    async def audit_run(request: Request):
        form = dict(await request.form())
        await check_csrf(request, str(form.get("csrf", "")))
        kws = []
        for line in str(form.get("keywords", "")).splitlines():
            line = line.strip()
            if not line:
                continue
            parts = [p.strip() for p in line.replace("\t", ",").rsplit(",", 1)]
            vol = fnum(parts[1]) if len(parts) == 2 else None
            kws.append({"phrase": parts[0].lower() if vol is not None or len(parts) == 1 else line.lower(), "volume": vol})
        cfg = AuditConfig(title_max=int(fnum(form.get("title_max"), 200)), bullet_max=int(fnum(form.get("bullet_max"), 500)))
        res = audit_listing(str(form.get("title", "")), str(form.get("bullets", "")).splitlines(), kws, str(form.get("description", "")), cfg)
        sk = None
        if form.get("primary"):
            sk = title_skeleton(str(form.get("brand", "")), str(form["primary"]), [a for a in str(form.get("attributes", "")).split(",")], cfg.title_max)
        return render(request, "audit.html", res=res, form=form, skeleton=sk)

    # ---------- projects & reports ----------
    @app.get("/projects", response_class=HTMLResponse)
    def projects(request: Request):
        conn = C(request)
        rows = conn.execute("SELECT p.*, (SELECT COUNT(*) FROM project_items i WHERE i.project_id=p.id) n FROM projects p ORDER BY name").fetchall()
        return render(request, "projects.html", rows=rows)

    @app.post("/projects")
    async def project_create(request: Request, name: str = Form(...), notes: str = Form(""), csrf: str = Form("")):
        await check_csrf(request, csrf)
        conn = C(request)
        conn.execute("INSERT OR IGNORE INTO projects (name, notes, created_at) VALUES (?,?,?)", (name.strip()[:80], notes[:2000], db.now()))
        conn.commit()
        return RedirectResponse("/projects", 303)

    def project_table(conn, pid: int):
        weights, params = services.get_scoring(conn)
        cols = ["asin", "marketplace", "title", "price", "rating", "reviews", "bsr", "monthly_units", "est_margin_pct", "opportunity_score", "kinds", "sources", "as_of"]
        out = []
        for r in conn.execute("SELECT p.* FROM project_items i JOIN products p ON p.id=i.product_id WHERE i.project_id=?", (pid,)):
            lat = services.latest(conn, r["id"])
            sc = opportunity(services.score_inputs(lat), weights, params)
            def g(k, lat=lat):
                return (lat.get(k) or {}).get("value_num")

            out.append({"asin": r["asin"], "marketplace": r["marketplace"], "title": r["title"], "price": g("price"), "rating": g("rating"),
                        "reviews": g("reviews"), "bsr": g("bsr"), "monthly_units": g("monthly_units"), "est_margin_pct": g("est_margin_pct"),
                        "opportunity_score": sc.score, "kinds": "; ".join(sorted({v["kind"] for v in lat.values()})),
                        "sources": "; ".join(sorted({v["source"] for v in lat.values()})), "as_of": max((v["as_of"] for v in lat.values()), default="")})
        return cols, out

    @app.get("/projects/{pid}", response_class=HTMLResponse)
    def project_view(request: Request, pid: int):
        conn = C(request)
        pr = conn.execute("SELECT * FROM projects WHERE id=?", (pid,)).fetchone()
        if not pr:
            raise HTTPException(404, "Project not found")
        cols, rows = project_table(conn, pid)
        calcs = conn.execute("SELECT * FROM calc_runs WHERE project_id=? ORDER BY id DESC", (pid,)).fetchall()
        return render(request, "project.html", pr=pr, cols=cols, rows=rows, calcs=calcs)

    @app.get("/projects/{pid}/report.csv")
    def project_csv(request: Request, pid: int):
        conn = C(request)
        cols, rows = project_table(conn, pid)
        buf = io.StringIO()
        w = csv.DictWriter(buf, fieldnames=cols)
        w.writeheader()
        for r in rows:
            w.writerow({k: ("" if v is None else v) for k, v in r.items()})
        return Response(buf.getvalue(), media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="project-{pid}.csv"'})

    @app.get("/projects/{pid}/report", response_class=HTMLResponse)
    def project_report(request: Request, pid: int):
        conn = C(request)
        pr = conn.execute("SELECT * FROM projects WHERE id=?", (pid,)).fetchone()
        if not pr:
            raise HTTPException(404, "Project not found")
        cols, rows = project_table(conn, pid)
        calcs = [(c, json.loads(c["outputs"])) for c in conn.execute("SELECT * FROM calc_runs WHERE project_id=? ORDER BY id", (pid,))]
        return render(request, "report.html", pr=pr, cols=cols, rows=rows, calcs=calcs, generated=db.now())

    # ---------- sources & settings ----------
    @app.get("/sources", response_class=HTMLResponse)
    def sources(request: Request):
        return render(request, "sources.html", providers=provider_matrix(settings), env=settings.redacted())

    @app.get("/settings", response_class=HTMLResponse)
    def settings_page(request: Request):
        conn = C(request)
        w, p = services.get_scoring(conn)
        return render(request, "settings.html", fx=services.fx_rates(conn), profiles={m: services.fee_profile(conn, m) for m in services.MARKETS},
                      weights=w, params=p, DEFAULT_WEIGHTS=DEFAULT_WEIGHTS)

    @app.post("/settings/fx")
    async def save_fx(request: Request, csrf: str = Form(""), usd_cad: str = Form(""), cny_usd: str = Form("")):
        await check_csrf(request, csrf)
        conn = C(request)
        a, b = fnum(usd_cad), fnum(cny_usd)
        if (a is not None and a <= 0) or (b is not None and b <= 0):
            raise HTTPException(400, "Rates must be positive.")
        db.set_setting(conn, "fx", {"USD_CAD": a, "CNY_USD": b, "updated_at": db.now(), "source": "entered by you"})
        return RedirectResponse("/settings", 303)

    @app.post("/settings/profile/{mp}")
    async def save_profile(request: Request, mp: str):
        form = dict(await request.form())
        await check_csrf(request, str(form.get("csrf", "")))
        if mp not in services.MARKETS:
            raise HTTPException(404)
        keys = list(pf.STARTER_PROFILES["CA"].keys())
        data = {k: (fnum(form.get(k), 0.0) or 0.0) for k in keys}
        services.save_fee_profile(C(request), mp, data, str(form.get("verified")) == "on", str(form.get("source_note", ""))[:300])
        return RedirectResponse("/settings", 303)

    @app.post("/settings/scoring")
    async def save_scoring(request: Request):
        form = dict(await request.form())
        await check_csrf(request, str(form.get("csrf", "")))
        conn = C(request)
        db.set_setting(conn, "score_weights", {k: fnum(form.get(f"w_{k}"), v) for k, v in DEFAULT_WEIGHTS.items()})
        db.set_setting(conn, "score_params", {k: fnum(form.get(f"p_{k}"), v) for k, v in DEFAULT_PARAMS.items()})
        return RedirectResponse("/settings", 303)

    @app.get("/health", response_class=PlainTextResponse)
    def health():
        return "ok"

    return app


app = None  # created by `python -m arp` or uvicorn --factory arp.web.app:create_app
