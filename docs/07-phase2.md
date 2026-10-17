# Phase 2

## How REA was used (and not used)
See `08-rea-investigation.md`. Short version: REA's browser-inspection tools were used on **Element10 itself** (software we own) to audit what
the shipped app loads, stores and calls. REA was **not** pointed at Helium 10's logged-in app or private APIs: that would need their login, is
forbidden by their Terms of Use, and was not authorised. Helium 10 features are taken from its public descriptions and our own workflows.

## Built in Phase 2
| Item | What it does | Data it uses |
|---|---|---|
| Web edition with login and database | Same tools in the browser, hosted on GitHub Pages, data in your Supabase account | Yours |
| Inventory planner | Days of cover, reorder point, reorder quantity and cost from your sales rate, lead time, safety days, MOQ | What you type (no forecasting) |
| Ad analysis | Imports an Amazon Ads search-term report; ACoS, CTR, CVR; wasted-spend terms (negative-keyword candidates), terms over your ACoS target, winners | Your own report export |
| Live provider integrations | Server functions (`supabase/functions`) for Amazon SP-API, Keepa and DataForSEO; buttons on the product and keyword pages; every stored value labelled with provider, time and kind | Only what a provider returns; blanks stay blank |
| Rank tracker | Organic rank per keyword and ASIN with change since the previous point | Your CSVs or DataForSEO ranked-keywords |
| Suppliers | Your quotes next to products; cost in sale currency using only your own FX rates | What you type |
| Market snapshot | Median price, reviews, rank for the products in a project, with counts of how many had data | Your products |
| Saved product searches | One-click filters | Settings |
| Mobile and install | Phone menu, 44px touch targets, installable app (PWA), offline shell (never caches your data) | n/a |
| Security check | Refuses a service_role key in config.js; checklist in Settings; `supabase/tests/rls_check.sql` | n/a |
| Backup / restore / device-to-account copy | JSON export, import, migration | Your data |

Inspired by (public descriptions only): Helium 10's inventory and advertising tools. Nothing here is a copy of their code, layout or data.

## Still blocked by data access (not by code)
Reverse-ASIN, search volume, competitor sales and rank history need a licensed provider or seller authorisation. SP-API and Keepa adapters
need a server for credentials. See the feature matrix. Nothing is charged without your approval.
