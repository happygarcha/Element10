"""Amazon Selling Partner API client (official, seller-authorised).

What it is: Amazon's API for sellers. You register a *private* app in your own seller account and
authorise it for yourself. It returns catalogue data and rank for ASINs, and fee estimates.
What it is not: an unrestricted competitor-research feed. It has no competitor sales, revenue or
search-volume figures. Some reports (e.g. Brand Analytics) need Brand Registry.

Status: written to Amazon's documented request shapes and unit-tested against mocked responses only.
It has not been run against live Amazon from this build, because that needs your seller credentials.
"""

from __future__ import annotations

import httpx

from ..config import Settings
from ..db import now
from .base import NotConfigured

MARKETPLACE_ID = {"CA": "A2EUQ1WTGCTBG2", "US": "ATVPDKIKX0DER"}
CURRENCY = {"CA": "CAD", "US": "USD"}
BASE = "https://sellingpartnerapi-na.amazon.com"  # North America region covers CA and US
LWA = "https://api.amazon.com/auth/o2/token"
SOURCE_CATALOG = "Amazon SP-API Catalog Items 2022-04-01"
SOURCE_FEES = "Amazon SP-API Product Fees v0 (estimate)"


class SpApiClient:
    def __init__(self, settings: Settings, http: httpx.Client | None = None) -> None:
        if not settings.has("SPAPI_LWA_CLIENT_ID", "SPAPI_LWA_CLIENT_SECRET", "SPAPI_REFRESH_TOKEN"):
            raise NotConfigured("Set SPAPI_LWA_CLIENT_ID, SPAPI_LWA_CLIENT_SECRET and SPAPI_REFRESH_TOKEN in .env "
                                "(register a private app in your own Seller Central account).")
        self._s = settings
        self._http = http or httpx.Client(timeout=20)
        self._token: str | None = None

    def _access_token(self) -> str:
        if self._token:
            return self._token
        r = self._http.post(LWA, data={"grant_type": "refresh_token", "refresh_token": self._s.get("SPAPI_REFRESH_TOKEN"),
                                       "client_id": self._s.get("SPAPI_LWA_CLIENT_ID"),
                                       "client_secret": self._s.get("SPAPI_LWA_CLIENT_SECRET")})
        r.raise_for_status()
        self._token = r.json()["access_token"]
        return self._token

    def _headers(self) -> dict:
        return {"x-amz-access-token": self._access_token(), "accept": "application/json"}

    def catalog_item(self, asin: str, marketplace: str) -> dict:
        r = self._http.get(f"{BASE}/catalog/2022-04-01/items/{asin}", headers=self._headers(),
                           params={"marketplaceIds": MARKETPLACE_ID[marketplace], "includedData": "summaries,salesRanks"})
        r.raise_for_status()
        return r.json()

    def fees_estimate(self, asin: str, marketplace: str, price: float) -> dict:
        body = {"FeesEstimateRequest": {"MarketplaceId": MARKETPLACE_ID[marketplace], "IsAmazonFulfilled": True,
                                        "Identifier": f"arp-{asin}",
                                        "PriceToEstimateFees": {"ListingPrice": {"CurrencyCode": CURRENCY[marketplace], "Amount": price}}}}
        r = self._http.post(f"{BASE}/products/fees/v0/items/{asin}/feesEstimate", headers=self._headers(), json=body)
        r.raise_for_status()
        return r.json()


def parse_catalog(payload: dict, marketplace: str) -> dict:
    mid = MARKETPLACE_ID[marketplace]
    summ = next((s for s in payload.get("summaries", []) if s.get("marketplaceId") == mid), {})
    ranks = next((s for s in payload.get("salesRanks", []) if s.get("marketplaceId") == mid), {})
    top = (ranks.get("displayGroupRanks") or ranks.get("classificationRanks") or [{}])[0]
    return {"title": summ.get("itemName"), "brand": summ.get("brand"),
            "category": (summ.get("browseClassification") or {}).get("displayName") or top.get("title"),
            "bsr": top.get("rank")}


def parse_fees(payload: dict) -> dict:
    res = (payload.get("payload") or {}).get("FeesEstimateResult") or {}
    if res.get("Status") not in (None, "Success"):
        raise ValueError(f"Amazon returned status {res.get('Status')}")
    detail = (res.get("FeesEstimate") or {}).get("FeeDetailList") or []
    out = {}
    for d in detail:
        amt = (d.get("FinalFee") or {}).get("Amount")
        if d.get("FeeType") == "ReferralFee":
            out["referral_fee"] = amt
        elif d.get("FeeType") == "FBAFees":
            out["fba_fee"] = amt
    return out


def store_catalog(conn, asin: str, marketplace: str, parsed: dict) -> int | None:
    """Save API results as 'observed'. Returns the product id."""
    conn.execute("INSERT INTO products (asin, marketplace, title, brand, category, first_seen) VALUES (?,?,?,?,?,?) "
                 "ON CONFLICT(asin, marketplace) DO UPDATE SET title=COALESCE(excluded.title,title), "
                 "brand=COALESCE(excluded.brand,brand), category=COALESCE(excluded.category,category)",
                 (asin, marketplace, parsed.get("title"), parsed.get("brand"), parsed.get("category"), now()))
    pid = conn.execute("SELECT id FROM products WHERE asin=? AND marketplace=?", (asin, marketplace)).fetchone()[0]
    if parsed.get("bsr"):
        conn.execute("INSERT INTO observations (product_id, metric, value_num, unit, kind, source, as_of, marketplace) "
                     "VALUES (?,?,?,?,?,?,?,?)", (pid, "bsr", parsed["bsr"], "rank", "observed", SOURCE_CATALOG, now(), marketplace))
    conn.commit()
    return pid


def store_fees(conn, pid: int, marketplace: str, fees: dict) -> None:
    for metric in ("referral_fee", "fba_fee"):
        if fees.get(metric) is not None:
            conn.execute("INSERT INTO observations (product_id, metric, value_num, unit, kind, source, as_of, marketplace) "
                         "VALUES (?,?,?,?,?,?,?,?)", (pid, metric, fees[metric], "currency", "observed", SOURCE_FEES, now(), marketplace))
    conn.commit()
