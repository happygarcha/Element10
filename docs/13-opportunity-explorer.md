# Amazon Product Opportunity Explorer (your own Seller Central) -> Element10

## What is known
- It is a Seller Central tool that shows **niche-level** figures (for example search volume, clicks, projected sales for a niche), not competitor ASIN sales. Amazon's own page was not readable from the build environment; the details above come from third-party descriptions.
- A third-party source says its data is **not available through the Selling Partner API**. No automatic pull is offered by Element10: that would mean scraping a logged-in Seller Central page, which breaks Amazon's terms and could put your seller account at risk.

## What Element10 does
**Niche research** (menu: Research -> Niche research) imports a CSV you download yourself:
1. Choose the marketplace (Amazon.ca or Amazon.com) and type the period shown in the report (for example "last 90 days").
2. Pick the file. Element10 detects the niche-name column and every mostly-numeric column, and shows them for you to correct. Column names are never assumed; the header text is kept as the label.
3. Import. Rows are stored as **user_supplied** with your source label and the import date. Empty cells are not stored (never turned into zero).
4. Sort, filter by a minimum, search and re-export the niches. Values are shown exactly as the file had them.

Not done (and why): no scoring across niches yet (the columns are not known until a real export is seen), and no linking of a niche to products. Send an export (or just its header row) and these can be added for the real column names.
