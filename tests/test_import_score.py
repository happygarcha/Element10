import pytest

from arp import db
from arp.calc.score import opportunity
from arp.imports import (
    PRODUCT_ALIASES,
    detect_mapping,
    import_keywords,
    import_products,
    parse_number,
    read_rows,
)


@pytest.fixture
def conn():
    return db.connect(":memory:")


def test_parse_number_variants():
    assert parse_number("$1,234.50") == 1234.5
    assert parse_number("12K") == 12000
    assert parse_number("1.5M") == 1_500_000
    assert parse_number("N/A") is None and parse_number("") is None and parse_number("abc") is None
    assert parse_number("4.5") == 4.5 and parse_number("85%") == 85.0


def test_read_rows_handles_bom_and_semicolons():
    h, rows = read_rows("﻿ASIN;Price\nB000000001;9,99\n")
    assert h == ["ASIN", "Price"] and rows[0]["ASIN"] == "B000000001"


def test_detect_mapping_aliases():
    m = detect_mapping(["ASIN", "Product Details", "Price", "Review Count", "BSR", "Weird"], PRODUCT_ALIASES)
    assert m == {"asin": "ASIN", "title": "Product Details", "price": "Price", "reviews": "Review Count", "bsr": "BSR"}


CSV = "ASIN,Title,Price,Reviews,Rating,BSR\nB0ABCDEFGH,Widget,$19.99,1.2K,4.3,15000\nBAD,Nope,5,1,1,1\nB0ZZZZZZZZ,Gadget,N/A,50,,\n"


def test_import_products_stores_provenance_and_skips_bad_rows(conn):
    r = import_products(conn, CSV, marketplace="CA", source_label="My H10 export, 2026-10-17")
    assert (r.ok, r.skipped) == (2, 1)
    assert any("not a valid ASIN" in p for p in r.problems)
    row = conn.execute("SELECT * FROM observations WHERE metric='price'").fetchone()
    assert row["kind"] == "user_supplied" and row["source"].startswith("My H10") and row["marketplace"] == "CA"
    assert conn.execute("SELECT value_num FROM observations WHERE metric='reviews' AND value_num=1200").fetchone()
    assert not conn.execute("SELECT 1 FROM observations WHERE kind='observed'").fetchone()


def test_reimport_adds_history_not_duplicates(conn):
    import_products(conn, CSV, marketplace="US", source_label="a", as_of="2026-10-01T00:00:00Z")
    import_products(conn, CSV.replace("19.99", "17.99"), marketplace="US", source_label="a", as_of="2026-10-08T00:00:00Z")
    assert conn.execute("SELECT COUNT(*) FROM products").fetchone()[0] == 2
    assert conn.execute("SELECT COUNT(*) FROM observations WHERE metric='price' AND product_id=1").fetchone()[0] == 2


def test_same_asin_in_two_marketplaces_is_separate(conn):
    import_products(conn, CSV, marketplace="CA", source_label="a")
    import_products(conn, CSV, marketplace="US", source_label="a")
    assert conn.execute("SELECT COUNT(*) FROM products WHERE asin='B0ABCDEFGH'").fetchone()[0] == 2


def test_import_requires_asin_and_valid_kind(conn):
    with pytest.raises(ValueError, match="ASIN"):
        import_products(conn, "Title,Price\nx,1\n", marketplace="CA", source_label="a")
    with pytest.raises(ValueError):
        import_products(conn, CSV, marketplace="CA", source_label="a", kind="observed")  # imports can never claim 'observed'


def test_import_keywords(conn):
    r = import_keywords(conn, "Keyword,Search Volume,Competition\nSilicone  Spatula,1.5K,230\n,5,5\n", marketplace="US", source_label="kw")
    assert (r.ok, r.skipped) == (1, 1)
    row = conn.execute("SELECT k.phrase, o.value_num FROM keyword_observations o JOIN keywords k ON k.id=o.keyword_id WHERE o.metric='search_volume'").fetchone()
    assert row["phrase"] == "silicone spatula" and row["value_num"] == 1500


def test_opportunity_renormalises_when_data_missing():
    full = opportunity({"bsr": 5000, "reviews": 100, "price": 30, "rating": 4.0, "est_margin_pct": 30})
    assert full.used == 5 and 0 <= full.score <= 100
    part = opportunity({"price": 30})
    assert part.used == 1 and part.score == 100.0
    none = opportunity({})
    assert none.score is None and none.used == 0


def test_opportunity_directions():
    good = opportunity({"bsr": 2000, "reviews": 20})
    bad = opportunity({"bsr": 150000, "reviews": 8000})
    assert good.score > bad.score
    assert opportunity({"price": 5}).score < opportunity({"price": 30}).score
