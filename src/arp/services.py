"""Read/write helpers that turn raw observation rows into what the screens need."""

from __future__ import annotations

import json
import sqlite3
from dataclasses import asdict

from . import db
from .calc import profit as pf
from .calc.score import DEFAULT_PARAMS, DEFAULT_WEIGHTS, opportunity

MARKETS = ("CA", "US")


def latest(conn: sqlite3.Connection, product_id: int) -> dict[str, dict]:
    """Newest observation per metric, with its provenance."""
    rows = conn.execute(
        "SELECT o.* FROM observations o JOIN (SELECT metric, MAX(as_of || printf('%010d', id)) k FROM observations "
        "WHERE product_id=? GROUP BY metric) m ON o.metric=m.metric AND (o.as_of || printf('%010d', o.id))=m.k "
        "WHERE o.product_id=?", (product_id, product_id)).fetchall()
    return {r["metric"]: dict(r) for r in rows}


def series(conn: sqlite3.Connection, product_id: int, metric: str) -> list[dict]:
    return [dict(r) for r in conn.execute(
        "SELECT as_of, value_num, kind, source FROM observations WHERE product_id=? AND metric=? AND value_num IS NOT NULL "
        "ORDER BY as_of, id", (product_id, metric))]


def score_inputs(lat: dict[str, dict]) -> dict:
    return {k: v["value_num"] for k, v in lat.items() if v.get("value_num") is not None}


def get_scoring(conn):
    return (db.get_setting(conn, "score_weights", DEFAULT_WEIGHTS), db.get_setting(conn, "score_params", DEFAULT_PARAMS))


def product_rows(conn, f: dict) -> list[dict]:
    where, args = [], []
    if f.get("marketplace") in MARKETS:
        where.append("p.marketplace=?")
        args.append(f["marketplace"])
    if f.get("q"):
        where.append("(p.title LIKE ? OR p.asin LIKE ? OR p.brand LIKE ?)")
        args += [f"%{f['q']}%"] * 3
    if f.get("category"):
        where.append("p.category LIKE ?")
        args.append(f"%{f['category']}%")
    w = " WHERE " + " AND ".join(where) if where else ""
    weights, params = get_scoring(conn)
    out = []
    for p in conn.execute(f"SELECT p.* FROM products p{w} ORDER BY p.id", args):
        lat = latest(conn, p["id"])
        m = score_inputs(lat)
        sc = opportunity(m, weights, params)
        row = {"p": dict(p), "m": m, "lat": lat, "score": sc.score, "used": sc.used, "total": sc.total}
        out.append(row)

    def ok(r):
        m = r["m"]
        for key, lo_key, hi_key in (("price", "price_min", "price_max"), ("reviews", None, "reviews_max"),
                                    ("rating", None, "rating_max"), ("bsr", "rank_min", "rank_max"),
                                    ("monthly_units", "units_min", None)):
            v = m.get(key)
            lo = f.get(lo_key) if lo_key else None
            hi = f.get(hi_key) if hi_key else None
            if (lo is not None or hi is not None) and v is None:
                return False  # a missing value never passes a filter on that value
            if lo is not None and v < lo:
                return False
            if hi is not None and v > hi:
                return False
        if f.get("margin_min") is not None and (m.get("est_margin_pct") is None or m["est_margin_pct"] < f["margin_min"]):
            return False
        return True

    out = [r for r in out if ok(r)]
    sort = f.get("sort") or "score"
    rev = f.get("dir", "desc") == "desc"
    keyf = (lambda r: (r["score"] is None, -(r["score"] or 0))) if sort == "score" and rev else None
    if keyf:
        out.sort(key=keyf)
    else:
        def val(r):
            if sort in ("title", "asin"):
                return (r["p"].get(sort) or "").lower()
            return r["m"].get(sort) if r["m"].get(sort) is not None else float("-inf") if rev else float("inf")
        out.sort(key=val, reverse=rev)
    return out


def fee_profile(conn, marketplace: str) -> dict:
    r = conn.execute("SELECT * FROM fee_profiles WHERE marketplace=?", (marketplace,)).fetchone()
    if r:
        return {"data": json.loads(r["data"]), "verified_at": r["verified_at"], "source_note": r["source_note"]}
    return {"data": dict(pf.STARTER_PROFILES[marketplace]), "verified_at": None, "source_note": "Starter values, unverified"}


def save_fee_profile(conn, marketplace: str, data: dict, verified: bool, note: str) -> None:
    conn.execute("INSERT INTO fee_profiles VALUES (?,?,?,?) ON CONFLICT(marketplace) DO UPDATE SET data=excluded.data, "
                 "verified_at=excluded.verified_at, source_note=excluded.source_note",
                 (marketplace, json.dumps(data), db.now() if verified else None, note))
    conn.commit()


def fx_rates(conn) -> dict:
    return db.get_setting(conn, "fx", {"USD_CAD": None})


def fx_for(conn, marketplace: str) -> dict:
    """fx dict for profit.compute: currency -> rate into the marketplace currency."""
    r = fx_rates(conn)
    usd_cad = r.get("USD_CAD")
    out = {}
    cny = r.get("CNY_USD")
    if marketplace == "CA":
        if usd_cad:
            out["USD"] = usd_cad
            if cny:
                out["CNY"] = cny * usd_cad
    else:
        if usd_cad:
            out["CAD"] = 1 / usd_cad
        if cny:
            out["CNY"] = cny
    return out


def save_calc(conn, *, marketplace, inputs: pf.ProfitInputs, result: pf.ProfitResult, label="", product_id=None,
              project_id=None) -> int:
    cur = conn.execute("INSERT INTO calc_runs (project_id, product_id, label, marketplace, inputs, outputs, created_at) VALUES (?,?,?,?,?,?,?)",
                       (project_id, product_id, label, marketplace, json.dumps(asdict(inputs)), json.dumps(result.as_dict()), db.now()))
    rid = cur.lastrowid
    if product_id and result.margin_pct is not None:
        conn.execute("INSERT INTO observations (product_id, metric, value_num, unit, kind, source, as_of, marketplace) VALUES (?,?,?,?,?,?,?,?)",
                     (product_id, "est_margin_pct", round(result.margin_pct, 2), "%", "calculated",
                      f"Profit calculator run #{rid} (fee profile verified: {'yes' if fee_profile(conn, marketplace)['verified_at'] else 'NO'})", db.now(), marketplace))
    conn.commit()
    return rid
