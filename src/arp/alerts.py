"""Alert rules evaluated against stored observation history. They only know what has been imported or
fetched: no import, no new data, no alert."""

from __future__ import annotations

import sqlite3

from .db import now

OPS = {"lt": "falls below", "gt": "rises above", "change_pct_gt": "changes by more than (%)"}


def _latest_two(conn, product_id: int, metric: str):
    return conn.execute(
        "SELECT id, value_num, as_of FROM observations WHERE product_id=? AND metric=? AND value_num IS NOT NULL "
        "ORDER BY as_of DESC, id DESC LIMIT 2", (product_id, metric)).fetchall()


def evaluate(conn: sqlite3.Connection, product_ids: list[int] | None = None) -> int:
    """Check active rules for every watched product (or only `product_ids`). Returns alerts created."""
    created = 0
    rules = conn.execute("SELECT * FROM alert_rules WHERE active=1").fetchall()
    for rule in rules:
        q = "SELECT DISTINCT product_id FROM watchlist_items" + (" WHERE watchlist_id=?" if rule["watchlist_id"] else "")
        pids = [r[0] for r in conn.execute(q, (rule["watchlist_id"],) if rule["watchlist_id"] else ())]
        for pid in pids:
            if product_ids is not None and pid not in product_ids:
                continue
            obs = _latest_two(conn, pid, rule["metric"])
            if not obs:
                continue
            cur = obs[0]["value_num"]
            prev = obs[1]["value_num"] if len(obs) > 1 else None
            hit, msg = False, ""
            if rule["op"] == "lt" and cur < rule["threshold"]:
                hit, msg = True, f"{rule['metric']} is {cur:g}, below {rule['threshold']:g}"
            elif rule["op"] == "gt" and cur > rule["threshold"]:
                hit, msg = True, f"{rule['metric']} is {cur:g}, above {rule['threshold']:g}"
            elif rule["op"] == "change_pct_gt" and prev not in (None, 0):
                ch = (cur - prev) / abs(prev) * 100
                if abs(ch) > rule["threshold"]:
                    hit, msg = True, f"{rule['metric']} moved {ch:+.1f}% ({prev:g} to {cur:g})"
            if hit:
                cur_row = conn.execute(
                    "INSERT OR IGNORE INTO alerts (rule_id, product_id, metric, value, previous, message, triggered_at, observation_id) "
                    "VALUES (?,?,?,?,?,?,?,?)", (rule["id"], pid, rule["metric"], cur, prev, msg, now(), obs[0]["id"]))
                created += cur_row.rowcount
    conn.commit()
    return created
