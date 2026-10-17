# Calculations

**Profit per unit** = price − (landed cost + referral + FBA fee + other Amazon fees + storage + advertising + expected returns).
- Landed = (supplier cost + freight, each converted to the marketplace currency) + duties + other landed. Duties default to a
  % of supplier cost (customs value usually excludes international freight); switchable to cost + freight. Assumption: confirm with your broker.
- Referral = max(price × referral %, referral minimum).
- Storage per unit = monthly rate per cu ft × cu ft × months stored.
- Advertising = price × ACoS, or a fixed amount per unit.
- Expected returns = return rate × (FBA fee if lost on return + return processing fee + refund admin fee + unresellable share × landed cost).
  Assumption: the outbound FBA fee is not refunded on a customer return. Check against Amazon's current policy.
- Margin = profit / price. ROI = profit / landed cost.
- **Break-even price** solves price × (1 − referral% − ACoS%) = fixed costs, with a second branch when the referral minimum applies.
  **Price for margin m** solves price × (1 − referral% − ACoS% − m) = fixed costs. "Not reachable" when percentage fees leave nothing.
Tested: simple case, FX, duties bases, returns model, storage, ad modes, both break-even branches, target margins, validation.

**Opportunity score** (0–100): weighted mean of five factors, each from stored numbers, weights editable in Settings.
Demand (rank, log scale, a category-specific proxy), competition (reviews, log), price band, quality gap (rating below target),
margin (from your saved calculator runs). Missing factors are skipped and weights renormalised; the score reports "n of 5".

**Keyword clustering**: stem each phrase, group phrases with Jaccard overlap ≥ threshold (single-link union-find), label by the highest-volume member.
**Listing audit**: configurable limits (not Amazon facts), word-based keyword coverage, repetition, all-caps and policy-risk phrase flags, Flesch reading ease.
