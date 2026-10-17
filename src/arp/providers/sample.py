"""Fictional demo data. Every row is labelled 'sample', lives in demo.db, and never touches live data."""

from __future__ import annotations

from ..db import now, set_setting
from ..imports import import_keywords, import_products

SAMPLE_LABEL = "SAMPLE (fictional demo data)"

PRODUCTS = """ASIN,Title,Brand,Category,Price,Rating,Reviews,BSR,Monthly Units,Sellers
S0SAMPL001,SAMPLE Silicone Spatula Set 6 Piece,DemoBrand A,Kitchen,24.99,4.1,820,18500,420,9
S0SAMPL002,SAMPLE Bamboo Drawer Organizer,DemoBrand B,Home,32.50,4.5,4100,3200,1500,22
S0SAMPL003,SAMPLE Dog Chew Toy Rope,DemoBrand C,Pet Supplies,14.99,4.3,260,9800,610,5
S0SAMPL004,SAMPLE Yoga Mat Strap,DemoBrand D,Sports,12.99,3.9,95,41000,180,4
S0SAMPL005,SAMPLE Desk Cable Clips,DemoBrand E,Office,9.99,4.4,15200,1500,5200,31
S0SAMPL006,SAMPLE Collapsible Silicone Funnel,DemoBrand F,Kitchen,18.75,4.0,410,26000,260,7
S0SAMPL007,SAMPLE Travel Neck Pillow,DemoBrand G,Luggage,28.00,4.2,2300,6500,980,14
S0SAMPL008,SAMPLE Magnetic Spice Jars,DemoBrand H,Kitchen,39.90,4.6,120,52000,90,3
"""
KEYWORDS = """Keyword,Search Volume,Competition
silicone spatula,18000,900
silicone spatula set,9500,610
heat resistant spatula,4200,380
kitchen utensils,52000,6800
baking tools,7600,1500
cooking utensil set,12500,2900
"""


def seed_demo(conn) -> None:
    if conn.execute("SELECT COUNT(*) FROM products").fetchone()[0]:
        return
    for mp in ("CA", "US"):
        import_products(conn, PRODUCTS, marketplace=mp, source_label=SAMPLE_LABEL, filename="sample_products.csv",
                        as_of="2026-10-01T00:00:00Z", kind="sample")
        # a second snapshot a week later so history, charts and alerts have something to show
        shifted = PRODUCTS.replace("24.99", "22.49").replace("32.50", "34.00").replace("18500", "16200")
        import_products(conn, shifted, marketplace=mp, source_label=SAMPLE_LABEL, filename="sample_products_week2.csv",
                        as_of="2026-10-08T00:00:00Z", kind="sample")
        import_keywords(conn, KEYWORDS, marketplace=mp, source_label=SAMPLE_LABEL, filename="sample_keywords.csv",
                        as_of="2026-10-08T00:00:00Z", kind="sample")
    conn.execute("INSERT OR IGNORE INTO watchlists (name, created_at) VALUES ('Sample watchlist', ?)", (now(),))
    conn.execute("INSERT OR IGNORE INTO watchlist_items SELECT 1, id, ? FROM products WHERE asin IN ('S0SAMPL001','S0SAMPL002')", (now(),))
    conn.execute("INSERT INTO alert_rules (watchlist_id, metric, op, threshold, created_at) VALUES (1,'price','change_pct_gt',5,?)", (now(),))
    set_setting(conn, "demo", True)
    set_setting(conn, "fx", {"USD_CAD": 1.38, "CNY_USD": 0.14, "updated_at": now(), "source": "SAMPLE rate, fictional"})
    conn.commit()
    from ..alerts import evaluate
    evaluate(conn)
