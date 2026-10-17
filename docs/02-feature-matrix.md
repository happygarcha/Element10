# Feature matrix

Status: **Built** works with the data you give it. **Interface only** has screens/adapter but needs an account or paid data.
Difficulty: S small, M medium, L large. Cost is the recurring cost of the data source, not of this app (which is free to run locally).

| # | Capability | Data source | Status | Difficulty | Recurring cost | MVP |
|---|---|---|---|---|---|---|
| 1 | Product filters (price, reviews, rating, rank, units, margin, category) | Your CSVs, SP-API | Built | S | 0 | 1 |
| 1 | Demand estimate from search volume or sales | Needs licensed data or your calibration | Not built: rank-based proxy only, labelled | L | Keepa/other paid | later |
| 1 | Seasonality | Needs price/rank history (Keepa) or your repeated imports | Not built | M | paid or manual | later |
| 2 | Side-by-side ASIN comparison | CSV, SP-API | Built | S | 0 | 1 |
| 2 | Opportunity score (transparent, adjustable) | Stored numbers | Built | S | 0 | 1 |
| 2 | Historical prices/rank | Builds from repeated imports; Keepa gives full history | Built (own history) / Interface only (Keepa) | S / M | 0 / ~EUR 49+ | 1 |
| 2 | Variations, seller competition detail | Keepa offers; SP-API limited | Not built | M | paid | later |
| 3 | Keyword import, clustering | Your CSVs | Built | S | 0 | 1 |
| 3 | Keyword discovery with volume | Brand Analytics (Brand Registry) or paid provider | Interface only | M | varies | later |
| 3 | Reverse ASIN | Licensed provider only | Not built (no accessible source) | L | paid | later |
| 3 | Rank tracking | Your recorded ranks (CSV); automatic needs a provider | Manual only | M | paid for auto | later |
| 4 | Listing audit: coverage, limits, readability, policy flags, title starter | Your text + keywords | Built | S | 0 | 1 |
| 5 | Profit calculator CA and US, both at once, break-even, target-margin price | Your fee profiles, FX you enter | Built | M | 0 | 1 |
| 5 | Official fee estimate for an ASIN | SP-API Product Fees | Interface only (needs seller account) | S | 0 | 2 |
| 6 | Watchlists and alerts (price, rank, any metric, % change) | Whatever you import | Built | S | 0 | 1 |
| 6 | Automatic monitoring | Needs a live source on a schedule | Not built | M | paid | later |
| 7 | Projects, CSV export, printable report | Stored numbers | Built | S | 0 | 1 |
| 8 | Inventory planning | Numbers you enter | Built (web edition, phase 2) | S | 0 | 2 |
| 8 | Ad search-term analysis | Your Amazon Ads export | Built (web edition, phase 2) | S | 0 | 2 |
| 9 | Login + database, use from GitHub link on any device | Supabase free tier | Built, untested against a real Supabase project | M | 0 | 2 |
| 8 | Browser extension | Would need data source and review | Not built | M | 0 | later |

Why some items are not built: no accessible, permitted data source exists without a paid licence or a seller account, and
nothing is charged without your approval.
