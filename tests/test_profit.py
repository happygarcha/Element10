import pytest

from arp.calc.profit import CalcError, ProfitInputs, compute, sensitivity


def base(**kw):
    d = dict(marketplace="US", sell_price=30.0, supplier_cost=5.0, freight_per_unit=1.0,
             referral_pct=15.0, referral_min=0.30, fba_fee=5.0)
    d.update(kw)
    return ProfitInputs(**d)


def test_simple_us_profit():
    r = compute(base())
    # landed 6 + referral 4.5 + fba 5 = 15.5 -> profit 14.5
    assert r.landed_cost == pytest.approx(6.0)
    assert r.total_cost == pytest.approx(15.5)
    assert r.profit == pytest.approx(14.5)
    assert r.margin_pct == pytest.approx(14.5 / 30 * 100)
    assert r.roi_pct == pytest.approx(14.5 / 6 * 100)
    assert r.currency == "USD"


def test_break_even_price_gives_zero_profit():
    i = base(acos_pct=10.0, return_rate_pct=4, resellable_pct=50, return_processing_fee=1.2,
             storage_rate_per_cuft_month=0.8, cubic_ft=0.05, months_in_storage=2)
    be = compute(i).break_even_price
    assert be and compute(base(**{**i.__dict__, "sell_price": be})).profit == pytest.approx(0, abs=1e-6)


def test_break_even_with_referral_minimum_branch():
    i = base(sell_price=1.5, supplier_cost=0.5, freight_per_unit=0.0, fba_fee=0.5, referral_min=0.30)
    be = compute(i).break_even_price
    assert be == pytest.approx(1.30)  # 0.5 landed + 0.5 fba + 0.30 minimum referral
    assert compute(base(**{**i.__dict__, "sell_price": be})).profit == pytest.approx(0, abs=1e-9)


def test_price_for_margin_hits_target():
    i = base(acos_pct=10.0)
    p20 = compute(i).price_for_margin[20]
    r = compute(base(**{**i.__dict__, "sell_price": p20}))
    assert r.margin_pct == pytest.approx(20.0, abs=1e-6)


def test_unreachable_margin_returns_none():
    i = base(referral_pct=60.0, acos_pct=39.0)
    assert compute(i).price_for_margin[30] is None


def test_canada_fx_conversion_and_duties():
    i = ProfitInputs(marketplace="CA", sell_price=40.0, supplier_cost=5.0, supplier_currency="USD",
                     freight_per_unit=1.0, freight_currency="USD", duties_pct=10.0, fba_fee=6.0,
                     fx={"USD": 1.4}, referral_pct=15.0)
    r = compute(i)
    # cost 7.0 CAD, freight 1.4, duties on cost only 0.7 -> landed 9.1
    assert r.landed_cost == pytest.approx(9.1)
    assert r.currency == "CAD"
    j = ProfitInputs(**{**i.__dict__, "duties_base": "cost_plus_freight"})
    assert compute(j).landed_cost == pytest.approx(7.0 + 1.4 + 8.4 * 0.10)


def test_missing_fx_is_an_error_not_a_guess():
    with pytest.raises(CalcError, match="exchange rate"):
        compute(ProfitInputs(marketplace="CA", sell_price=10, supplier_cost=1, supplier_currency="USD"))


def test_returns_cost_model():
    i = base(return_rate_pct=10, resellable_pct=50, return_processing_fee=2.0, refund_admin_fee=1.0)
    r = compute(i)
    returns = next(ln for ln in r.lines if ln.label == "Expected returns cost").amount
    # 0.1 * (fba 5 + proc 2 + admin 1 + 0.5*landed 6) = 1.1
    assert returns == pytest.approx(1.1)
    j = base(return_rate_pct=10, resellable_pct=50, lose_fba_fee_on_return=False)
    assert next(ln for ln in compute(j).lines if ln.label == "Expected returns cost").amount == pytest.approx(0.3)


def test_ad_modes():
    assert next(ln for ln in compute(base(acos_pct=20)).lines if ln.label == "Advertising").amount == pytest.approx(6.0)
    assert next(ln for ln in compute(base(ad_mode="per_unit", ad_per_unit=2.5)).lines if ln.label == "Advertising").amount == 2.5


def test_storage_per_unit():
    r = compute(base(storage_rate_per_cuft_month=0.78, cubic_ft=0.1, months_in_storage=3))
    assert next(ln for ln in r.lines if ln.label == "Storage per unit").amount == pytest.approx(0.234)


def test_validation():
    with pytest.raises(CalcError):
        compute(base(sell_price=-1))
    with pytest.raises(CalcError):
        compute(base(referral_pct=100))
    with pytest.raises(CalcError):
        compute(base(marketplace="UK"))
    with pytest.raises(CalcError):
        compute(base(resellable_pct=120))


def test_zero_price_has_no_margin():
    r = compute(base(sell_price=0))
    assert r.margin_pct is None and r.profit < 0


def test_sensitivity_monotonic():
    rows = sensitivity(base(), [20, 25, 30, 35])
    assert [r["profit"] for r in rows] == sorted(r["profit"] for r in rows)
