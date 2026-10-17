"""The honest map of data sources: what each can provide, what it needs, what it costs."""

from __future__ import annotations

from ..config import Settings
from .base import ProviderInfo


def provider_matrix(settings: Settings) -> list[ProviderInfo]:
    sp_ready = settings.has("SPAPI_LWA_CLIENT_ID", "SPAPI_LWA_CLIENT_SECRET", "SPAPI_REFRESH_TOKEN")
    keepa_ready = settings.has("KEEPA_API_KEY")
    return [
        ProviderInfo(
            "upload", "Your own CSV exports", "ready",
            ["Any column you export from a tool you already pay for or from your own spreadsheets",
             "Repeated imports build price/rank history you can watch and alert on"],
            ["Anything not in the file", "Automatic refresh"],
            "Nothing", "Free",
            "Built and tested in this app (imports are always labelled user-supplied).",
            notes=["Use this for Helium 10, Jungle Scout, Keepa or Seller Central exports you are entitled to download."]),
        ProviderInfo(
            "spapi", "Amazon Selling Partner API (official)", "ready" if sp_ready else "needs credentials",
            ["Catalogue details and best-seller rank for ASINs", "Amazon's own fee estimate for a price (referral and FBA)",
             "Your own listings, orders and inventory data"],
            ["Competitor sales, revenue or search volume", "Historical price or rank", "Keyword rankings",
             "Brand Analytics search reports unless you hold Brand Registry"],
            "Your own Amazon seller account (Amazon.ca and/or Amazon.com) and a private app registered in Seller Central",
            "Free to use; you need an active seller account",
            "Official Amazon docs describe the Pricing API as a competitor price-monitoring tool for registered sellers; "
            "Catalog Items role details were NOT confirmed in this session. Client unit-tested on mocked responses only, never run against live Amazon.",
            docs="https://developer-docs.amazon.com/sp-api/docs/product-pricing-api"),
        ProviderInfo(
            "keepa", "Keepa API", "needs credentials" if keepa_ready else "not built",
            ["Price and rank history for ASINs (documented by Keepa)", "Offer and seller data (costs extra tokens)"],
            ["Search volume", "Keyword research", "Real sales figures (only rank-based signals)"],
            "A paid Keepa API plan", "Paid monthly plans; third-party reviews list tiers from about EUR 49/month (token-based). No free tier found",
            "Pricing from keepa.com/api-docs and a third-party review; confirm on Keepa's own page before buying. Adapter NOT built: "
            "it needs a paid key to develop against and test, and nothing is charged without your approval.",
            docs="https://keepa.com/api-docs/"),
        ProviderInfo(
            "paapi", "Amazon Product Advertising API / Creators API", "not built",
            ["Product details and prices for affiliate links"], ["Sales, rank history, keywords"],
            "An Amazon Associates account with qualifying sales (secondary sources say 10 sales in 30 days)",
            "Free but access-gated",
            "Third-party sources say PA-API 5 retired on 2026-04-30 in favour of the Creators API; not confirmed against Amazon's own page. Not built.",
            docs="https://webservices.amazon.ca/paapi5/documentation/"),
        ProviderInfo(
            "scrape", "Scraping Amazon pages", "not built",
            [], ["(Not offered)"], "n/a", "n/a",
            "Deliberately excluded: it breaks Amazon's terms, is blocked quickly, and produces unreliable data.",
            notes=["If you need broad competitor data, a licensed provider (e.g. Keepa) or your own exports are the supported routes."]),
        ProviderInfo(
            "sample", "Sample data (demo mode)", "demo only",
            ["Fictional products so you can try every screen"], ["Anything real"], "Nothing", "Free",
            "Stored in a separate demo database and labelled SAMPLE everywhere; never mixed with live research."),
    ]
