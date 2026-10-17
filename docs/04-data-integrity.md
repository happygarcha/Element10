# Data integrity rules

1. Every number stored has `kind`, `source`, `as_of` and `marketplace`. The UI shows them on hover, in tables and in reports.
2. CSV imports can only be `user_supplied` (or `sample` in demo mode). A test proves an import cannot claim `observed`.
3. Search volume, sales, revenue, history and rankings are never generated. If a number is missing the screens show "–".
4. A missing value never passes a filter on that value. The opportunity score skips missing factors and says how many it used.
5. Demo mode uses a separate database and a purple banner; sample rows are labelled everywhere and cannot reach live data.
6. Currency conversion uses only rates you enter. With no rate the calculator stops with an error.
7. Fees come from your fee profile. Results show "unverified" until you mark the profile verified.
8. Rank-to-sales estimation is deliberately absent: it needs per-category calibration against real sales data.
9. SP-API data is described as seller-authorised data, not an open competitor feed.
