"""Per-unit profit model for Amazon.ca and Amazon.com (FBA).

Every input is explicit and configurable. Nothing here knows Amazon's current fee schedule: the
numbers come from a fee profile you confirm against Seller Central's FBA Revenue Calculator.

Assumptions (also listed in docs/05-calculations.md):
* Prices and Amazon fees are in the marketplace currency (CA = CAD, US = USD).
* Supplier cost and freight may be in other currencies; `fx` converts them to the marketplace
  currency (rate = marketplace-currency units per 1 unit of that currency).
* Duties are charged on supplier cost (customs value excludes international freight by default).
* Referral fee = max(price x referral %, referral minimum).
* A returned unit costs you: the FBA fulfilment fee (if `lose_fba_fee_on_return`), the return
  processing fee, the refund administration fee, and the landed cost of units that cannot be resold.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field

CURRENCY = {"CA": "CAD", "US": "USD"}


class CalcError(ValueError):
    pass


@dataclass
class ProfitInputs:
    marketplace: str = "CA"
    sell_price: float = 0.0
    supplier_cost: float = 0.0
    supplier_currency: str = "USD"
    freight_per_unit: float = 0.0
    freight_currency: str = "USD"
    duties_pct: float = 0.0
    duties_base: str = "cost_only"  # or "cost_plus_freight"
    other_landed_per_unit: float = 0.0  # marketplace currency
    referral_pct: float = 15.0
    referral_min: float = 0.0
    fba_fee: float = 0.0
    other_amazon_fees: float = 0.0
    storage_rate_per_cuft_month: float = 0.0
    cubic_ft: float = 0.0
    months_in_storage: float = 1.0
    ad_mode: str = "acos"  # "acos" (% of price) or "per_unit"
    acos_pct: float = 0.0
    ad_per_unit: float = 0.0
    return_rate_pct: float = 0.0
    resellable_pct: float = 100.0
    return_processing_fee: float = 0.0
    refund_admin_fee: float = 0.0
    lose_fba_fee_on_return: bool = True
    fx: dict = field(default_factory=dict)  # currency code -> rate into marketplace currency


@dataclass
class Line:
    label: str
    amount: float  # marketplace currency, per unit sold
    kind: str  # "input" | "calculated"
    note: str = ""


@dataclass
class ProfitResult:
    marketplace: str
    currency: str
    sell_price: float
    lines: list[Line]
    landed_cost: float
    total_cost: float
    profit: float
    margin_pct: float | None
    roi_pct: float | None
    break_even_price: float | None
    price_for_margin: dict[int, float | None]

    def as_dict(self) -> dict:
        d = asdict(self)
        return d


def _pct(x: float) -> float:
    return x / 100.0


def _validate(i: ProfitInputs) -> None:
    if i.marketplace not in CURRENCY:
        raise CalcError("marketplace must be CA or US")
    if i.ad_mode not in ("acos", "per_unit"):
        raise CalcError("ad_mode must be acos or per_unit")
    if i.duties_base not in ("cost_only", "cost_plus_freight"):
        raise CalcError("duties_base must be cost_only or cost_plus_freight")
    for name in ("sell_price", "supplier_cost", "freight_per_unit", "duties_pct", "referral_pct",
                 "referral_min", "fba_fee", "other_amazon_fees", "storage_rate_per_cuft_month",
                 "cubic_ft", "months_in_storage", "acos_pct", "ad_per_unit", "return_rate_pct",
                 "return_processing_fee", "refund_admin_fee", "other_landed_per_unit"):
        if getattr(i, name) < 0:
            raise CalcError(f"{name} cannot be negative")
    if not 0 <= i.resellable_pct <= 100 or not 0 <= i.return_rate_pct <= 100:
        raise CalcError("return and resellable percentages must be between 0 and 100")
    if i.referral_pct >= 100 or i.acos_pct >= 100:
        raise CalcError("percentages must be below 100")


def to_marketplace(amount: float, currency: str, marketplace: str, fx: dict) -> float:
    mp = CURRENCY[marketplace]
    if currency == mp:
        return amount
    if currency not in fx or not fx[currency] or fx[currency] <= 0:
        raise CalcError(f"Missing exchange rate {currency} -> {mp}. Add it in Settings.")
    return amount * fx[currency]


def _solve_price(fixed: float, ref_pct: float, ref_min: float, ad_pct: float, margin: float) -> float | None:
    """Price p such that p - fixed - referral(p) - ad_pct*p = margin*p, referral = max(p*ref, min)."""
    denom = 1 - ref_pct - ad_pct - margin
    if denom > 1e-9:
        p = fixed / denom
        if p * ref_pct >= ref_min - 1e-9:
            return p
    denom2 = 1 - ad_pct - margin
    if denom2 > 1e-9:
        p2 = (fixed + ref_min) / denom2
        if p2 * ref_pct <= ref_min + 1e-9:
            return p2
    return None


def compute(i: ProfitInputs) -> ProfitResult:
    _validate(i)
    cur = CURRENCY[i.marketplace]
    cost = to_marketplace(i.supplier_cost, i.supplier_currency, i.marketplace, i.fx)
    freight = to_marketplace(i.freight_per_unit, i.freight_currency, i.marketplace, i.fx)
    duty_base = cost + (freight if i.duties_base == "cost_plus_freight" else 0.0)
    duties = duty_base * _pct(i.duties_pct)
    landed = cost + freight + duties + i.other_landed_per_unit

    referral = max(i.sell_price * _pct(i.referral_pct), i.referral_min) if i.sell_price > 0 else 0.0
    storage = i.storage_rate_per_cuft_month * i.cubic_ft * i.months_in_storage
    ads = i.sell_price * _pct(i.acos_pct) if i.ad_mode == "acos" else i.ad_per_unit
    rr = _pct(i.return_rate_pct)
    unsellable = 1 - _pct(i.resellable_pct)
    returns = rr * ((i.fba_fee if i.lose_fba_fee_on_return else 0.0) + i.return_processing_fee
                    + i.refund_admin_fee + unsellable * landed)

    lines = [
        Line("Supplier cost", cost, "input", f"{i.supplier_cost:g} {i.supplier_currency} converted"),
        Line("Freight to Amazon", freight, "input", f"{i.freight_per_unit:g} {i.freight_currency} converted"),
        Line("Duties", duties, "calculated", f"{i.duties_pct:g}% of {i.duties_base.replace('_', ' ')}"),
        Line("Other landed costs", i.other_landed_per_unit, "input"),
        Line("Referral fee", referral, "calculated", f"{i.referral_pct:g}% of price, minimum {i.referral_min:g}"),
        Line("FBA fulfilment fee", i.fba_fee, "input"),
        Line("Other Amazon fees", i.other_amazon_fees, "input", "inbound placement, fuel surcharge, etc."),
        Line("Storage per unit", storage, "calculated", f"{i.storage_rate_per_cuft_month:g} x {i.cubic_ft:g} cu ft x {i.months_in_storage:g} months"),
        Line("Advertising", ads, "calculated" if i.ad_mode == "acos" else "input",
             f"{i.acos_pct:g}% of price" if i.ad_mode == "acos" else "per unit"),
        Line("Expected returns cost", returns, "calculated", f"{i.return_rate_pct:g}% return rate"),
    ]
    total = landed + referral + i.fba_fee + i.other_amazon_fees + storage + ads + returns
    profit = i.sell_price - total
    margin = (profit / i.sell_price * 100) if i.sell_price > 0 else None
    roi = (profit / landed * 100) if landed > 0 else None

    fixed = landed + i.fba_fee + i.other_amazon_fees + storage + returns
    ad_pct = _pct(i.acos_pct) if i.ad_mode == "acos" else 0.0
    if i.ad_mode == "per_unit":
        fixed += i.ad_per_unit
    ref_pct = _pct(i.referral_pct)
    be = _solve_price(fixed, ref_pct, i.referral_min, ad_pct, 0.0)
    targets = {m: _solve_price(fixed, ref_pct, i.referral_min, ad_pct, m / 100) for m in (15, 20, 30)}
    return ProfitResult(i.marketplace, cur, i.sell_price, lines, landed, total, profit, margin, roi, be, targets)


def sensitivity(i: ProfitInputs, prices: list[float]) -> list[dict]:
    out = []
    for p in prices:
        r = compute(ProfitInputs(**{**asdict(i), "sell_price": p}))
        out.append({"price": p, "profit": r.profit, "margin_pct": r.margin_pct})
    return out


# Starter fee profiles. Referral 15% is the most common category rate and the 0.30 minimum is the
# usual per-item minimum, but they are NOT verified here: the profile stays flagged "unverified"
# until you confirm every value against Seller Central and mark it verified.
STARTER_PROFILES = {
    "CA": {"referral_pct": 15.0, "referral_min": 0.30, "fba_fee": 0.0, "other_amazon_fees": 0.0,
           "storage_rate_per_cuft_month": 0.0, "return_processing_fee": 0.0, "refund_admin_fee": 0.0,
           "duties_pct": 0.0, "acos_pct": 15.0, "return_rate_pct": 5.0, "resellable_pct": 85.0},
    "US": {"referral_pct": 15.0, "referral_min": 0.30, "fba_fee": 0.0, "other_amazon_fees": 0.0,
           "storage_rate_per_cuft_month": 0.0, "return_processing_fee": 0.0, "refund_admin_fee": 0.0,
           "duties_pct": 0.0, "acos_pct": 15.0, "return_rate_pct": 5.0, "resellable_pct": 85.0},
}
