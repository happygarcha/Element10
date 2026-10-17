# Research notes: what was verified and what was not

Checked 2026-10-17 with web searches. "Verified" means a source says it; "unverified" means I could not
confirm it on an official page. Where sources disagree, both are recorded.

## Helium 10 (benchmark for features only; nothing of theirs is copied)
Verified from Helium 10's own pages and knowledge base:
- Black Box: product research with filters such as monthly revenue, price, review count, size.
- Xray: Chrome-extension snapshot of the same data while browsing Amazon.
- Cerebro: reverse-ASIN lookup (keywords competitors rank for, volumes).
- Magnet: reverse keyword lookup with related terms, volume, competition, a custom "Magnet IQ" score.
- Listing Builder: listing writing aid with a keyword-usage score.
- Alerts: notifications such as lost Buy Box or unauthorised listing changes.
- Profitability Calculator: freight, storage, referral fees, unit cost, time in storage.
- Plan limits exist (example found: Black Box 250 uses/day on one tier). Pages are of mixed age; do not rely on numbers.
Sources: https://www.helium10.com/tools/ ,
https://kb.helium10.com/hc/en-us/articles/360033391574-How-Can-Helium-10-Help-Me-Crush-It ,
https://kb.helium10.com/hc/en-us/articles/1260803831790-Which-Helium-10-Plan-Is-the-Right-One-for-Me

## Amazon data access
- Selling Partner API (SP-API), official: Product Pricing API docs describe it as a tool for sellers to monitor pricing and
  competitor price points. https://developer-docs.amazon.com/sp-api/docs/product-pricing-api
  UNVERIFIED in this session: exact roles for the Catalog Items API, anything about 2026 policy changes, Brand Analytics
  requirements (commonly described as needing Brand Registry). Treat SP-API as seller-authorised data, not an open
  competitor-research feed. It has no competitor sales, revenue or search-volume figures.
- Product Advertising API 5.0: sources say it is retired in favour of the Creators API (Amazon-hosted notice and a developer
  post give 2026-04-30; a plugin changelog says 2026-01-31, not confirmed). Access is tied to affiliate sales (secondary
  sources: 10 qualified sales in 30 days). https://dev.to/th3nate/amazon-pa-api-v5-is-shutting-down-april-30-2026-here-is-what-changes-at-the-auth-layer-22ek ,
  https://programma-affiliazione.amazon.it/creatorsapi/docs/en-us/paapiv5-deprecation
- Keepa API (licensed third party): prepaid monthly token plans; product request costs 1 token per ASIN; third-party review
  lists EUR 49/month for 20 tokens/min as the entry tier and no free tier. Prices change; confirm before buying.
  https://keepa.com/api-docs/plans-tokens.html , https://revenuegeeks.com/keepa-pricing/
- Scraping Amazon: excluded on purpose (terms, blocking, unreliable data).

## Amazon fees (the weakest area)
Searches returned only secondary blogs that disagree, plus one Amazon.ca seller-forum post saying there are no increases to
Canada referral and FBA fees for 2026 and a 3.5% fuel surcharge mentioned by one guide from 2026-04-17. Referral rates are
described as roughly 8-15% typical (6-17% in another), storage near US$0.78/cu ft Jan-Sep (blogs), FBA tables unlabelled by
currency. **None of this is hard-coded.** The calculator uses a fee profile you fill from Seller Central's FBA Revenue
Calculator and mark verified. Starter values (15% referral, 0.30 minimum) are common defaults, flagged unverified.
Sources: https://sellercentral.amazon.ca/seller-forums/discussions/t/a9383e96-87ef-484e-bbe7-cc07584331bb ,
https://ecomcalctools.com/blog/fees-amazon/amazon-fees-canada-2026/ , https://shipbob.com/blog/amazon-fba-fees
