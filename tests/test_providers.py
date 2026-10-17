import httpx
import pytest

from arp import db
from arp.config import Settings
from arp.providers import sp_api
from arp.providers.base import NotConfigured
from arp.providers.registry import provider_matrix
from arp.providers.sample import SAMPLE_LABEL, seed_demo


def test_sp_api_requires_credentials():
    with pytest.raises(NotConfigured):
        sp_api.SpApiClient(Settings(env={}, dotenv=None))


def _client(handler):
    s = Settings(env={"SPAPI_LWA_CLIENT_ID": "id", "SPAPI_LWA_CLIENT_SECRET": "sec", "SPAPI_REFRESH_TOKEN": "rt"})
    return sp_api.SpApiClient(s, httpx.Client(transport=httpx.MockTransport(handler)))


def test_sp_api_flow_with_mocked_amazon():
    calls = []

    def handler(req: httpx.Request):
        calls.append((req.method, req.url.path))
        if req.url.host == "api.amazon.com":
            assert b"refresh_token" in req.content
            return httpx.Response(200, json={"access_token": "tok"})
        assert req.headers["x-amz-access-token"] == "tok"
        if "catalog" in req.url.path:
            assert req.url.params["marketplaceIds"] == "A2EUQ1WTGCTBG2"
            return httpx.Response(200, json={"asin": "B0ABCDEFGH", "summaries": [{"marketplaceId": "A2EUQ1WTGCTBG2", "itemName": "Widget", "brand": "Acme"}],
                                             "salesRanks": [{"marketplaceId": "A2EUQ1WTGCTBG2", "displayGroupRanks": [{"title": "Kitchen", "rank": 1234}]}]})
        return httpx.Response(200, json={"payload": {"FeesEstimateResult": {"Status": "Success", "FeesEstimate": {"FeeDetailList": [
            {"FeeType": "ReferralFee", "FinalFee": {"Amount": 3.0}}, {"FeeType": "FBAFees", "FinalFee": {"Amount": 5.5}}]}}}})

    c = _client(handler)
    conn = db.connect(":memory:")
    parsed = sp_api.parse_catalog(c.catalog_item("B0ABCDEFGH", "CA"), "CA")
    assert parsed == {"title": "Widget", "brand": "Acme", "category": "Kitchen", "bsr": 1234}
    pid = sp_api.store_catalog(conn, "B0ABCDEFGH", "CA", parsed)
    sp_api.store_fees(conn, pid, "CA", sp_api.parse_fees(c.fees_estimate("B0ABCDEFGH", "CA", 20.0)))
    rows = {r["metric"]: r for r in conn.execute("SELECT * FROM observations")}
    assert rows["bsr"]["kind"] == "observed" and rows["bsr"]["source"].startswith("Amazon SP-API")
    assert rows["fba_fee"]["value_num"] == 5.5 and rows["referral_fee"]["value_num"] == 3.0
    assert sum(1 for m, _ in calls if m == "POST") == 2  # token fetched once for both calls... plus the fee POST
    assert sum(1 for _, p in calls if p == "/auth/o2/token") == 1


def test_parse_fees_rejects_failed_status():
    with pytest.raises(ValueError):
        sp_api.parse_fees({"payload": {"FeesEstimateResult": {"Status": "ClientError"}}})


def test_matrix_is_honest_and_never_lists_scraping_as_available():
    m = {p.id: p for p in provider_matrix(Settings(env={}, dotenv=None))}
    assert m["upload"].status == "ready" and m["spapi"].status == "needs credentials"
    assert m["scrape"].status == "not built" and "terms" in m["scrape"].verified
    assert "Competitor sales, revenue or search volume" in m["spapi"].does_not_give
    assert Settings(env={"KEEPA_API_KEY": "k"}).redacted()["KEEPA_API_KEY"] == "set (hidden)"
    assert "k" not in str(Settings(env={"KEEPA_API_KEY": "kk-secret"}).redacted().values()).replace("set (hidden)", "")


def test_demo_data_is_labelled_sample_and_idempotent():
    conn = db.connect(":memory:")
    seed_demo(conn)
    seed_demo(conn)
    assert conn.execute("SELECT COUNT(DISTINCT kind) FROM observations").fetchone()[0] == 1
    assert conn.execute("SELECT kind FROM observations LIMIT 1").fetchone()[0] == "sample"
    assert conn.execute("SELECT COUNT(*) FROM products").fetchone()[0] == 16
    assert all(r["source"] == SAMPLE_LABEL for r in conn.execute("SELECT source FROM observations"))
    assert conn.execute("SELECT COUNT(*) FROM alerts").fetchone()[0] >= 1
