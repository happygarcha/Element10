// Inventory planning from numbers you enter. Nothing is forecast: it assumes the daily sales rate you give it.
export function plan({ on_hand = 0, inbound = 0, daily_sales, lead_time_days, safety_days = 0, target_cover_days = 60, unit_cost = 0, moq = 0 }) {
  const bad = [daily_sales, lead_time_days].some((x) => !(x >= 0)) || [on_hand, inbound, safety_days, target_cover_days, unit_cost, moq].some((x) => x < 0);
  if (bad || !(daily_sales > 0)) return { error: "Enter a daily sales rate above zero and a lead time. Negative numbers are not allowed." };
  const available = on_hand + inbound;
  const cover = available / daily_sales;
  const reorderPoint = daily_sales * (lead_time_days + safety_days);
  const stockoutIn = on_hand / daily_sales;
  const needed = daily_sales * (lead_time_days + target_cover_days) - available;
  let order = Math.max(0, Math.ceil(needed));
  if (order > 0 && moq > order) order = moq;
  const reorderBy = Math.max(0, (available - reorderPoint) / daily_sales);
  return { available, days_of_cover: cover, stockout_in_days_without_inbound: stockoutIn, reorder_point_units: Math.ceil(reorderPoint),
    reorder_in_days: reorderBy, suggested_order_units: order, order_cost: order * unit_cost,
    status: available <= reorderPoint ? "Reorder now" : "OK for now" };
}
