"""CSV import for product and keyword reports you export yourself.

Column names are matched case-insensitively against common aliases and can be remapped in the UI.
Everything imported is stored as user_supplied (or sample in demo mode), with the source label you
give it. The app never presents imported numbers as its own observations.
"""

from __future__ import annotations

import csv
import io
import re
import sqlite3
from dataclasses import dataclass, field

from .db import now

PRODUCT_ALIASES: dict[str, list[str]] = {
    "asin": ["asin", "child asin", "product asin"],
    "title": ["title", "product name", "product details", "name"],
    "brand": ["brand", "manufacturer"],
    "category": ["category", "main category", "product category"],
    "price": ["price", "buy box price", "current price", "price cad", "price usd"],
    "rating": ["rating", "ratings", "review rating", "avg rating", "stars"],
    "reviews": ["reviews", "review count", "number of reviews", "ratings count", "rating count"],
    "bsr": ["bsr", "best sellers rank", "sales rank", "rank", "best seller rank"],
    "monthly_units": ["monthly units", "parent level sales", "asin sales", "monthly sales", "units sold", "sales"],
    "monthly_revenue": ["monthly revenue", "parent level revenue", "asin revenue", "revenue"],
    "seller_count": ["sellers", "seller count", "number of sellers", "offers"],
    "fba_fee": ["fba fee", "fba fees", "fulfillment fee", "fulfilment fee"],
    "referral_fee": ["referral fee", "referral fees"],
    "weight_kg": ["weight kg", "weight (kg)", "weight"],
}
KEYWORD_ALIASES: dict[str, list[str]] = {
    "phrase": ["keyword", "keyword phrase", "phrase", "search term", "search query"],
    "search_volume": ["search volume", "volume", "monthly search volume", "searches", "est. search volume"],
    "competition": ["competition", "competing products", "competitors", "keyword difficulty", "difficulty"],
    "rank": ["rank", "position", "organic rank", "organic position"],
    "asin": ["asin"],
}
NUMERIC = {"price", "rating", "reviews", "bsr", "monthly_units", "monthly_revenue", "seller_count",
           "fba_fee", "referral_fee", "weight_kg"}
UNITS = {"price": "currency", "rating": "stars", "reviews": "count", "bsr": "rank", "monthly_units": "units",
         "monthly_revenue": "currency", "seller_count": "count", "fba_fee": "currency",
         "referral_fee": "currency", "weight_kg": "kg"}
ASIN_RE = re.compile(r"^[A-Z0-9]{10}$")


def parse_number(raw) -> float | None:
    """'$1,234.50' -> 1234.5, '12K' -> 12000, 'N/A' -> None. Never guesses on junk."""
    if raw is None:
        return None
    s = str(raw).strip().replace(",", "").replace("$", "").replace("CA", "").replace("US", "").strip()
    if not s or s.lower() in {"n/a", "na", "-", "--", "none", "null", "nan"}:
        return None
    mult = 1.0
    if s[-1:].lower() in ("k", "m"):
        mult = 1e3 if s[-1].lower() == "k" else 1e6
        s = s[:-1]
    s = s.replace("%", "")
    try:
        return float(s) * mult
    except ValueError:
        return None


def read_rows(text: str) -> tuple[list[str], list[dict]]:
    if text.startswith("﻿"):
        text = text[1:]
    sample = text[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t")
    except csv.Error:
        dialect = csv.excel
    rd = csv.DictReader(io.StringIO(text), dialect=dialect)
    rows = [{(k or "").strip(): (v or "").strip() for k, v in r.items()} for r in rd]
    return [h.strip() for h in (rd.fieldnames or [])], rows


def detect_mapping(headers: list[str], aliases: dict[str, list[str]]) -> dict[str, str]:
    norm = {re.sub(r"\s+", " ", h.strip().lower()): h for h in headers}
    out: dict[str, str] = {}
    for field_name, names in aliases.items():
        for n in names:
            if n in norm:
                out[field_name] = norm[n]
                break
    return out


@dataclass
class ImportResult:
    import_id: int
    ok: int = 0
    skipped: int = 0
    problems: list[str] = field(default_factory=list)


def _record_import(conn, filename, kind, source_label, marketplace, notes="") -> int:
    cur = conn.execute("INSERT INTO imports (filename, kind, source_label, marketplace, uploaded_at, notes) VALUES (?,?,?,?,?,?)",
                       (filename, kind, source_label, marketplace, now(), notes))
    return cur.lastrowid


def import_products(conn: sqlite3.Connection, text: str, *, marketplace: str, source_label: str,
                    filename: str = "upload.csv", as_of: str | None = None, mapping: dict | None = None,
                    kind: str = "user_supplied") -> ImportResult:
    if marketplace not in ("CA", "US"):
        raise ValueError("marketplace must be CA or US")
    if kind not in ("user_supplied", "sample"):
        raise ValueError("imports can only be user_supplied or sample")
    headers, rows = read_rows(text)
    mapping = mapping or detect_mapping(headers, PRODUCT_ALIASES)
    if "asin" not in mapping:
        raise ValueError("No ASIN column found. Map one in the import screen.")
    stamp = as_of or now()
    res = ImportResult(_record_import(conn, filename, "products", source_label, marketplace))
    for n, r in enumerate(rows, start=2):
        asin = (r.get(mapping["asin"], "") or "").strip().upper()
        if not ASIN_RE.match(asin):
            res.skipped += 1
            res.problems.append(f"row {n}: '{asin}' is not a valid ASIN")
            continue
        def get(f, r=r):
            return r.get(mapping[f], "") if f in mapping else ""

        conn.execute(
            "INSERT INTO products (asin, marketplace, title, brand, category, first_seen) VALUES (?,?,?,?,?,?) "
            "ON CONFLICT(asin, marketplace) DO UPDATE SET title=COALESCE(NULLIF(excluded.title,''), title), "
            "brand=COALESCE(NULLIF(excluded.brand,''), brand), category=COALESCE(NULLIF(excluded.category,''), category)",
            (asin, marketplace, get("title"), get("brand"), get("category"), stamp))
        pid = conn.execute("SELECT id FROM products WHERE asin=? AND marketplace=?", (asin, marketplace)).fetchone()[0]
        any_metric = False
        for f in NUMERIC:
            if f not in mapping:
                continue
            v = parse_number(r.get(mapping[f]))
            if v is None:
                continue
            conn.execute(
                "INSERT INTO observations (product_id, metric, value_num, unit, kind, source, as_of, marketplace, import_id) "
                "VALUES (?,?,?,?,?,?,?,?,?)", (pid, f, v, UNITS[f], kind, source_label, stamp, marketplace, res.import_id))
            any_metric = True
        res.ok += 1
        if not any_metric:
            res.problems.append(f"row {n}: {asin} has no numeric metrics")
    conn.execute("UPDATE imports SET rows_ok=?, rows_skipped=? WHERE id=?", (res.ok, res.skipped, res.import_id))
    conn.commit()
    return res


def import_keywords(conn: sqlite3.Connection, text: str, *, marketplace: str, source_label: str,
                    filename: str = "keywords.csv", as_of: str | None = None, mapping: dict | None = None,
                    kind: str = "user_supplied") -> ImportResult:
    if marketplace not in ("CA", "US"):
        raise ValueError("marketplace must be CA or US")
    headers, rows = read_rows(text)
    mapping = mapping or detect_mapping(headers, KEYWORD_ALIASES)
    if "phrase" not in mapping:
        raise ValueError("No keyword column found. Map one in the import screen.")
    stamp = as_of or now()
    res = ImportResult(_record_import(conn, filename, "keywords", source_label, marketplace))
    for n, r in enumerate(rows, start=2):
        phrase = re.sub(r"\s+", " ", (r.get(mapping["phrase"], "") or "").strip().lower())
        if not phrase:
            res.skipped += 1
            res.problems.append(f"row {n}: empty keyword")
            continue
        conn.execute("INSERT OR IGNORE INTO keywords (marketplace, phrase) VALUES (?,?)", (marketplace, phrase))
        kid = conn.execute("SELECT id FROM keywords WHERE marketplace=? AND phrase=?", (marketplace, phrase)).fetchone()[0]
        asin = (r.get(mapping["asin"], "") if "asin" in mapping else "").upper() or None
        for f in ("search_volume", "competition", "rank"):
            if f not in mapping:
                continue
            v = parse_number(r.get(mapping[f]))
            if v is None:
                continue
            conn.execute("INSERT INTO keyword_observations (keyword_id, metric, value_num, asin, kind, source, as_of, import_id) "
                         "VALUES (?,?,?,?,?,?,?,?)", (kid, f, v, asin if f == "rank" else None, kind, source_label, stamp, res.import_id))
        res.ok += 1
    conn.execute("UPDATE imports SET rows_ok=?, rows_skipped=? WHERE id=?", (res.ok, res.skipped, res.import_id))
    conn.commit()
    return res
