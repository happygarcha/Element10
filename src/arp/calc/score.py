"""Opportunity score. Transparent, adjustable and honest about missing data.

Each factor scores 0-100 from stored numbers. Factors with no data are skipped and the remaining
weights are renormalised, and the result reports how many factors it actually used. Rank-based demand
is a proxy: Best Sellers Rank is category-specific, so ranks are only comparable within a category.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

DEFAULT_WEIGHTS = {"demand": 30, "competition": 25, "price": 15, "quality_gap": 10, "margin": 20}
DEFAULT_PARAMS = {"price_low": 20.0, "price_high": 70.0, "rank_best": 1000, "rank_worst": 200000,
                  "reviews_hard": 5000, "rating_target": 4.6, "margin_target_pct": 40.0}

EXPLAIN = {
    "demand": "Lower Best Sellers Rank scores higher (log scale between rank_best and rank_worst). A proxy: ranks are category-specific.",
    "competition": "Fewer reviews scores higher (log scale up to reviews_hard). Few reviews usually means an easier market to enter.",
    "price": "100 inside your target price band, falling off linearly outside it.",
    "quality_gap": "A rating below the target suggests room to do better: (target - rating) scaled to 100.",
    "margin": "Estimated margin from your profit calculator, scaled to margin_target_pct.",
}


@dataclass
class Factor:
    name: str
    score: float | None
    weight: float
    detail: str


@dataclass
class ScoreResult:
    score: float | None
    used: int
    total: int
    factors: list[Factor]


def _clamp(x: float) -> float:
    return max(0.0, min(100.0, x))


def factor_scores(m: dict, p: dict) -> dict[str, tuple[float | None, str]]:
    out: dict[str, tuple[float | None, str]] = {}
    rank = m.get("bsr")
    if rank and rank > 0:
        lo, hi = math.log10(p["rank_best"]), math.log10(p["rank_worst"])
        out["demand"] = (_clamp(100 * (1 - (math.log10(rank) - lo) / (hi - lo))), f"rank {rank:,.0f}")
    else:
        out["demand"] = (None, "no rank")
    rv = m.get("reviews")
    if rv is not None and rv >= 0:
        out["competition"] = (_clamp(100 * (1 - math.log10(rv + 1) / math.log10(p["reviews_hard"] + 1))), f"{rv:,.0f} reviews")
    else:
        out["competition"] = (None, "no review count")
    pr = m.get("price")
    if pr is not None and pr > 0:
        lo, hi = p["price_low"], p["price_high"]
        s = 100.0 if lo <= pr <= hi else _clamp(100 * (1 - (lo - pr) / lo)) if pr < lo else _clamp(100 * (1 - (pr - hi) / hi))
        out["price"] = (s, f"price {pr:,.2f} vs band {lo:g}-{hi:g}")
    else:
        out["price"] = (None, "no price")
    rt = m.get("rating")
    if rt is not None and rt > 0:
        out["quality_gap"] = (_clamp((p["rating_target"] - rt) / 1.0 * 100), f"rating {rt:.1f}")
    else:
        out["quality_gap"] = (None, "no rating")
    mg = m.get("est_margin_pct")
    if mg is not None:
        out["margin"] = (_clamp(mg / p["margin_target_pct"] * 100), f"margin {mg:.1f}%")
    else:
        out["margin"] = (None, "no margin estimate")
    return out


def opportunity(m: dict, weights: dict | None = None, params: dict | None = None) -> ScoreResult:
    w = {**DEFAULT_WEIGHTS, **(weights or {})}
    p = {**DEFAULT_PARAMS, **(params or {})}
    fs = factor_scores(m, p)
    factors = [Factor(n, s, float(w.get(n, 0)), d) for n, (s, d) in fs.items()]
    live = [f for f in factors if f.score is not None and f.weight > 0]
    if not live:
        return ScoreResult(None, 0, len(factors), factors)
    tot = sum(f.weight for f in live)
    return ScoreResult(round(sum(f.score * f.weight for f in live) / tot, 1), len(live), len(factors), factors)
