
from arp import db
from arp.alerts import evaluate
from arp.calc.text import (
    AuditConfig,
    audit_listing,
    cluster_keywords,
    contains_phrase,
    readability,
    stem,
    title_skeleton,
)
from arp.imports import import_products


def test_stem_groups_plurals():
    assert stem("spatulas") == stem("spatula") and stem("batteries") == "battery"
    assert stem("gas") == "gas"  # too short to strip


def test_cluster_groups_related_phrases_and_sums_volume():
    items = [{"phrase": "silicone spatula", "volume": 1000}, {"phrase": "silicone spatulas set", "volume": 400},
             {"phrase": "wooden spoon", "volume": 700}, {"phrase": "spatula silicone heat resistant", "volume": 200}]
    cl = cluster_keywords(items, threshold=0.4)
    top = cl[0]
    assert top["label"] == "silicone spatula" and top["size"] == 3 and top["total_volume"] == 1600
    assert any(g["label"] == "wooden spoon" and g["size"] == 1 for g in cl)


def test_cluster_is_deterministic_and_handles_empty():
    assert cluster_keywords([]) == []
    items = [{"phrase": "a b c"}, {"phrase": "b c d"}]
    assert cluster_keywords(items) == cluster_keywords(items)


def test_contains_phrase_is_word_based():
    assert contains_phrase("Non-stick silicone spatulas for baking", "silicone spatula")
    assert not contains_phrase("silicone baking mat", "silicone spatula")


def test_readability_known_text():
    r = readability("The cat sat on the mat. The dog ran to the log.")
    assert r["sentences"] == 2 and r["words"] == 12 and r["flesch"] > 90
    assert readability("")["flesch"] is None


def test_audit_flags_missing_keywords_and_limits():
    kws = [{"phrase": "silicone spatula", "volume": 5000}, {"phrase": "baking tools", "volume": 900}]
    res = audit_listing("Acme Silicone Spatula Set, 6 Piece", ["Heat resistant to 450F", "Dishwasher safe"], kws,
                        cfg=AuditConfig(title_max=40))
    assert res.coverage[0]["status"] == "exact phrase" and res.coverage[1]["status"] == "missing"
    assert res.coverage_pct == 50.0
    assert any(f.area == "Keywords" and "baking tools" in f.message for f in res.findings)
    assert any(f.area == "Bullets" for f in res.findings)  # only 2 bullets


def test_audit_title_too_long_and_stuffing_and_policy():
    long_title = "Spatula " * 40
    r = audit_listing(long_title, ["best seller guaranteed"], [{"phrase": "spatula", "volume": 10}])
    areas = {(f.level, f.area) for f in r.findings}
    assert ("problem", "Title") in areas and ("warning", "Policy") in areas
    assert any("appears" in f.message and "times" in f.message for f in r.findings)


def test_title_skeleton_trims_on_boundary():
    t = title_skeleton("Acme", "Silicone Spatula Set", ["6 Piece", "Heat Resistant", "Dishwasher Safe"], max_len=45)
    assert t == "Acme Silicone Spatula Set, 6 Piece" and len(t) <= 45


def _setup(conn):
    import_products(conn, "ASIN,Price\nB0ABCDEFGH,20\n", marketplace="US", source_label="s", as_of="2026-10-01T00:00:00Z")
    conn.execute("INSERT INTO watchlists (name, created_at) VALUES ('w','x')")
    conn.execute("INSERT INTO watchlist_items VALUES (1,1,'x')")
    conn.commit()


def test_alert_threshold_and_change_rules_and_no_duplicates():
    conn = db.connect(":memory:")
    _setup(conn)
    conn.execute("INSERT INTO alert_rules (watchlist_id, metric, op, threshold, created_at) VALUES (1,'price','lt',18,'x')")
    conn.execute("INSERT INTO alert_rules (watchlist_id, metric, op, threshold, created_at) VALUES (1,'price','change_pct_gt',10,'x')")
    conn.commit()
    assert evaluate(conn) == 0  # 20 is not below 18 and there is no previous value
    import_products(conn, "ASIN,Price\nB0ABCDEFGH,16\n", marketplace="US", source_label="s", as_of="2026-10-08T00:00:00Z")
    assert evaluate(conn) == 2  # below 18, and -20% change
    assert evaluate(conn) == 0  # same observation: no duplicate alerts
    msgs = [r["message"] for r in conn.execute("SELECT message FROM alerts")]
    assert any("below 18" in m for m in msgs) and any("-20.0%" in m for m in msgs)


def test_alerts_ignore_unwatched_products():
    conn = db.connect(":memory:")
    import_products(conn, "ASIN,Price\nB0ABCDEFGH,5\n", marketplace="US", source_label="s")
    conn.execute("INSERT INTO watchlists (name, created_at) VALUES ('w','x')")
    conn.execute("INSERT INTO alert_rules (watchlist_id, metric, op, threshold, created_at) VALUES (1,'price','lt',10,'x')")
    conn.commit()
    assert evaluate(conn) == 0
