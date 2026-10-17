// Advertising search-term analysis from a report you export from Amazon Ads. Pure arithmetic on your numbers.
export function analyse(terms, { min_clicks = 10, target_acos = 30 } = {}) {
  const rows = terms.map((t) => ({ ...t, ctr: t.impressions > 0 ? t.clicks / t.impressions * 100 : null, cvr: t.clicks > 0 ? t.orders / t.clicks * 100 : null,
    acos: t.sales > 0 ? t.spend / t.sales * 100 : null, cpc: t.clicks > 0 ? t.spend / t.clicks : null }));
  const spend = rows.reduce((a, r) => a + r.spend, 0), sales = rows.reduce((a, r) => a + r.sales, 0);
  const wasted = rows.filter((r) => r.clicks >= min_clicks && r.orders === 0).sort((a, b) => b.spend - a.spend);
  const over = rows.filter((r) => r.orders > 0 && r.acos != null && r.acos > target_acos).sort((a, b) => b.spend - a.spend);
  const winners = rows.filter((r) => r.orders > 0 && r.acos != null && r.acos <= target_acos).sort((a, b) => b.sales - a.sales);
  return { totals: { spend, sales, acos: sales > 0 ? spend / sales * 100 : null, terms: rows.length, wasted_spend: wasted.reduce((a, r) => a + r.spend, 0) },
    wasted, over, winners, rows, rules: `Wasted = at least ${min_clicks} clicks and no orders. Over target = ACoS above ${target_acos}%. These are suggestions from your own numbers, not Amazon recommendations.` };
}
