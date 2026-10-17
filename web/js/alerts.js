// Alert rules evaluated against stored history. They only know what has been imported: no import, no new data, no alert.
import { now } from "./util.js";
export const OPS = { lt: "falls below", gt: "rises above", change_pct_gt: "changes by more than (%)" };

function latestTwo(store, pid, metric) {
  return store.observations(pid).filter((o) => o.metric === metric && o.value_num != null)
    .sort((a, b) => (a.as_of < b.as_of ? 1 : a.as_of > b.as_of ? -1 : 0)).slice(0, 2);
}
export async function evaluate(store, productIds = null) {
  let created = 0;
  for (const rule of store.t.alert_rules.filter((r) => r.active)) {
    const pids = [...new Set(store.t.watchlist_items.filter((i) => !rule.watchlist_id || i.watchlist_id === rule.watchlist_id).map((i) => i.product_id))];
    for (const pid of pids) {
      if (productIds && !productIds.includes(pid)) continue;
      const obs = latestTwo(store, pid, rule.metric); if (!obs.length) continue;
      const cur = obs[0].value_num, prev = obs.length > 1 ? obs[1].value_num : null; let msg = "";
      if (rule.op === "lt" && cur < rule.threshold) msg = `${rule.metric} is ${cur}, below ${rule.threshold}`;
      else if (rule.op === "gt" && cur > rule.threshold) msg = `${rule.metric} is ${cur}, above ${rule.threshold}`;
      else if (rule.op === "change_pct_gt" && prev) { const ch = (cur - prev) / Math.abs(prev) * 100; if (Math.abs(ch) > rule.threshold) msg = `${rule.metric} moved ${ch >= 0 ? "+" : ""}${ch.toFixed(1)}% (${prev} to ${cur})`; }
      if (!msg) continue;
      if (store.t.alerts.some((a) => a.rule_id === rule.id && a.product_id === pid && a.observation_id === obs[0].id)) continue;
      await store.add("alerts", { rule_id: rule.id, product_id: pid, metric: rule.metric, value: cur, previous: prev, message: msg, triggered_at: now(), observation_id: obs[0].id, acknowledged: false });
      created++;
    }
  }
  return created;
}
