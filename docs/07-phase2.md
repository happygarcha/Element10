# Phase 2

## Decision on "reverse engineering"
Phase 2 was requested "using REA to reverse engineer required elements". REA is a tool for analysing software. Using it on Helium 10's
extension or app would extract proprietary logic and call private endpoints, which is outside the rules agreed for this project
(public documentation and workflows only, independent implementation, no private endpoints, no bypassing access controls). So REA is **not**
used against Helium 10. Features are derived from what its public pages and help articles describe, then implemented from scratch
with original code and the data sources listed in `01-research-and-sources.md`.

## Built in Phase 2
| Item | What it does | Data it uses |
|---|---|---|
| Web edition with login and database | Same tools in the browser, hosted on GitHub Pages, data in your Supabase account | Yours |
| Inventory planner | Days of cover, reorder point, reorder quantity and cost from your sales rate, lead time, safety days, MOQ | What you type (no forecasting) |
| Ad analysis | Imports an Amazon Ads search-term report; ACoS, CTR, CVR; wasted-spend terms (negative-keyword candidates), terms over your ACoS target, winners | Your own report export |
| Backup / restore / device-to-account copy | JSON export, import, migration | Your data |

Inspired by (public descriptions only): Helium 10's inventory and advertising tools. Nothing here is a copy of their code, layout or data.

## Still blocked by data access (not by code)
Reverse-ASIN, search volume, competitor sales and rank history need a licensed provider or seller authorisation. SP-API and Keepa adapters
need a server for credentials. See the feature matrix. Nothing is charged without your approval.
