"""What a number is and where it came from.

Kinds:
  observed       read directly from an authorised source by this app (API response)
  user_supplied  typed or uploaded by you; the app does not vouch for it
  calculated     derived by this app from other stored numbers, formula shown
  estimated      a model's guess (needs your calibration; never shown as fact)
  sample         demo data. Never mixed into live research.
"""

from __future__ import annotations

KINDS = ("observed", "user_supplied", "calculated", "estimated", "sample")

KIND_HELP = {
    "observed": "Read from an authorised data source by this app.",
    "user_supplied": "Came from your upload or entry. Accuracy depends on its source.",
    "calculated": "Worked out by this app from other numbers using a stated formula.",
    "estimated": "A model's guess. Treat as a rough guide, not a fact.",
    "sample": "Demo data. Not real Amazon data.",
}

# metric -> (label, unit, higher_is)
METRICS = {
    "price": ("Price", "currency", None),
    "rating": ("Rating", "stars", None),
    "reviews": ("Reviews", "count", None),
    "bsr": ("Best Sellers Rank", "rank", None),
    "monthly_units": ("Monthly units", "units", None),
    "monthly_revenue": ("Monthly revenue", "currency", None),
    "seller_count": ("Sellers", "count", None),
    "fba_fee": ("FBA fee", "currency", None),
    "referral_fee": ("Referral fee", "currency", None),
    "weight_kg": ("Weight", "kg", None),
    "est_margin_pct": ("Estimated margin", "%", None),
    "opportunity_score": ("Opportunity score", "0-100", None),
}
