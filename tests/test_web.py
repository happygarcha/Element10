
import pytest
from fastapi.testclient import TestClient

from arp.config import Settings
from arp.web.app import create_app

CSV = b"ASIN,Title,Price,Reviews,Rating,BSR\nB0ABCDEFGH,Widget One,19.99,120,4.2,15000\nB0ZZZZZZZZ,Gadget Two,34.50,3000,4.6,2500\n"


@pytest.fixture
def client(tmp_path):
    s = Settings(env={"ARP_DATA_DIR": str(tmp_path), "KEEPA_API_KEY": "kk-super-secret-value"}, dotenv=None)
    c = TestClient(create_app(s), follow_redirects=False)
    c.get("/")  # sets the csrf cookie
    return c


def tok(c):
    return c.cookies.get("arp_csrf")


def post(c, url, data=None, **kw):
    return c.post(url, data={**(data or {}), "csrf": tok(c)}, **kw)


def test_pages_render_in_empty_live_mode(client):
    for url in ["/", "/products", "/compare", "/import", "/calculator", "/watchlists", "/alerts", "/keywords",
                "/listing-audit", "/projects", "/sources", "/settings"]:
        r = client.get(url)
        assert r.status_code == 200, url
    home = client.get("/").text
    assert "Nothing here yet" in home and "DEMO MODE" not in home


def test_csrf_is_enforced(client):
    assert client.post("/watchlists", data={"name": "x"}).status_code == 403
    assert client.post("/watchlists", data={"name": "x", "csrf": "wrong"}).status_code == 403
    assert post(client, "/watchlists", {"name": "x"}).status_code == 303
    assert client.post("/api/calc", json={}).status_code == 403


def test_secrets_never_reach_the_browser(client):
    html = client.get("/sources").text
    assert "kk-super-secret-value" not in html and "set (hidden)" in html
    assert "scrape" not in html.lower() or "Not offered" in html


def test_demo_and_live_data_never_mix(client):
    client.cookies.set("arp_mode", "demo")
    demo = client.get("/products").text
    assert "SAMPLE" in demo and "DEMO MODE" in client.get("/").text
    client.cookies.set("arp_mode", "live")
    assert "SAMPLE" not in client.get("/products").text


def _import(c, mp="CA", label="My export"):
    r = c.post("/import/preview", data={"kind": "products", "marketplace": mp, "source_label": label, "as_of": "2026-10-10", "csrf": tok(c)},
               files={"file": ("x.csv", CSV, "text/csv")})
    assert r.status_code == 200 and "Check how the columns were matched" in r.text
    form = {"kind": "products", "marketplace": mp, "source_label": label, "as_of": "2026-10-10", "filename": "x.csv", "text": CSV.decode(),
            "csrf": tok(c), "map_asin": "ASIN", "map_title": "Title", "map_price": "Price", "map_reviews": "Reviews", "map_rating": "Rating", "map_bsr": "BSR"}
    return c.post("/import/commit", data=form)


def test_import_flow_and_products_page(client):
    r = _import(client)
    assert r.status_code == 200 and "Imported" in r.text
    page = client.get("/products").text
    assert "Widget One" in page
    f = client.get("/products?price_max=25").text
    assert "Widget One" in f and "Gadget Two" not in f
    assert "Gadget Two" in client.get("/products?reviews_max=5000&rank_max=3000").text
    detail = client.get("/products/1").text
    assert "user supplied" in detail and "My export" in detail and "Opportunity score" in detail


def test_import_validation_errors(client):
    r = client.post("/import/commit", data={"kind": "products", "marketplace": "CA", "source_label": "x", "text": "Title\nx\n", "csrf": tok(client)})
    assert r.status_code == 400 and "ASIN" in r.text
    big = b"A" * 2_100_000
    r = client.post("/import/preview", data={"kind": "products", "marketplace": "CA", "source_label": "x", "csrf": tok(client)},
                    files={"file": ("big.csv", big, "text/csv")})
    assert r.status_code == 413


def test_compare_page(client):
    _import(client)
    r = client.get("/compare?ids=1,2")
    assert r.status_code == 200 and "Widget One" in r.text and "Gadget Two" in r.text and "Opportunity score" in r.text


def _calc_payload(**kw):
    d = {"marketplace": "US", "sell_price": "30", "supplier_cost": "5", "supplier_currency": "USD", "freight_per_unit": "1", "freight_currency": "USD",
         "fba_fee": "5", "referral_pct": "15", "referral_min": "0.3", "acos_pct": "0", "return_rate_pct": "0", "both": "0"}
    d.update(kw)
    return d


def test_calculator_api_us_and_ca_with_fx(client):
    r = client.post("/api/calc", json=_calc_payload(), headers={"X-CSRF": tok(client)}).json()
    assert r["primary"]["ok"] and r["primary"]["result"]["profit"] == pytest.approx(14.5) and r["primary"]["verified"] is False
    ca = client.post("/api/calc", json=_calc_payload(marketplace="CA"), headers={"X-CSRF": tok(client)}).json()
    assert ca["primary"]["ok"] is False and "exchange rate" in ca["primary"]["error"]  # never guessed
    post(client, "/settings/fx", {"usd_cad": "1.4", "cny_usd": ""})
    ca = client.post("/api/calc", json=_calc_payload(marketplace="CA", fba_fee="6", sell_price="40"), headers={"X-CSRF": tok(client)}).json()
    assert ca["primary"]["ok"] and ca["primary"]["result"]["currency"] == "CAD"
    assert ca["primary"]["result"]["landed_cost"] == pytest.approx(8.4)
    both = client.post("/api/calc", json=_calc_payload(marketplace="CA", both="1", s_sell_price="28", s_fba_fee="5"), headers={"X-CSRF": tok(client)}).json()
    assert both["secondary"]["ok"] and both["secondary"]["result"]["currency"] == "USD"


def test_fee_profile_verification_flag(client):
    post(client, "/settings/profile/US", {"referral_pct": "15", "referral_min": "0.3", "fba_fee": "4.5", "verified": "on", "source_note": "Seller Central calc"})
    r = client.post("/api/calc", json=_calc_payload(fba_fee="4.5"), headers={"X-CSRF": tok(client)}).json()
    assert r["primary"]["verified"] is True
    assert "Seller Central calc" in client.get("/settings").text


def test_save_calc_links_calculated_margin_to_product(client):
    _import(client, mp="US")
    r = post(client, "/calculator/save", _calc_payload(product_id="1", label="test"))
    assert r.status_code == 303
    detail = client.get("/products/1").text
    assert "calculated" in detail and "Profit calculator run #1" in detail and "fee profile verified: NO" in detail
    assert "Widget One" in client.get("/products?margin_min=10").text


def test_watchlist_rule_and_alert_flow(client):
    _import(client)
    post(client, "/watchlists", {"name": "Main"})
    post(client, "/products/1/watch", {"watchlist_id": "1"})
    post(client, "/watchlists/1/rule", {"metric": "price", "op": "lt", "threshold": "25"})
    assert "Widget One" in client.get("/alerts").text
    assert "dismiss" in client.get("/alerts").text
    post(client, "/alerts/1/ack")
    assert "dismiss" not in client.get("/alerts").text


def test_projects_and_reports(client):
    _import(client)
    post(client, "/projects", {"name": "Spatulas", "notes": "n"})
    post(client, "/products/1/project", {"project_id": "1"})
    csv_ = client.get("/projects/1/report.csv")
    assert csv_.status_code == 200 and "Widget One" in csv_.text and "user_supplied" in csv_.text and "My export" in csv_.text
    rep = client.get("/projects/1/report")
    assert "Widget One" in rep.text and "not a prediction" in rep.text


def test_listing_audit_page(client):
    r = post(client, "/listing-audit", {"title": "Acme Silicone Spatula", "bullets": "Heat resistant\nDishwasher safe", "keywords": "silicone spatula, 5000\nbaking tools, 900",
                                        "brand": "Acme", "primary": "Silicone Spatula", "attributes": "6 Piece"})
    assert r.status_code == 200 and "Keyword coverage" in r.text and "Acme Silicone Spatula, 6 Piece" in r.text


def test_keywords_page_after_import(client):
    kw = b"Keyword,Search Volume\nsilicone spatula,1500\nsilicone spatulas set,600\n"
    r = client.post("/import/commit", data={"kind": "keywords", "marketplace": "US", "source_label": "kw", "filename": "k.csv", "text": kw.decode(),
                                            "csrf": tok(client), "map_phrase": "Keyword", "map_search_volume": "Search Volume"})
    assert r.status_code == 200
    page = client.get("/keywords?marketplace=US").text
    assert "silicone spatula" in page and "searches" in page and "Reverse-ASIN" in page


def test_xss_is_escaped(client):
    evil = b"ASIN,Title,Price\nB0ABCDEFGH,<script>alert(1)</script>,5\n"
    client.post("/import/commit", data={"kind": "products", "marketplace": "CA", "source_label": "x", "filename": "e.csv", "text": evil.decode(),
                                        "csrf": tok(client), "map_asin": "ASIN", "map_title": "Title", "map_price": "Price"})
    page = client.get("/products").text
    assert "<script>alert(1)</script>" not in page and "&lt;script&gt;" in page
