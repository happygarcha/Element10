# Architecture

**Stack:** Python 3.11, FastAPI, Jinja2 server-rendered pages, SQLite, a few lines of vanilla JavaScript. Why: it runs on a laptop
with no accounts or subscriptions, one language end to end, easy to back up (two files), and enough for a single-user tool.

```
browser ── HTTPS/HTTP localhost ── FastAPI (routes, CSRF, templates)
                                      ├─ calc/   profit, score, text   (pure functions, unit-tested)
                                      ├─ imports.py   CSV → observations (always user_supplied or sample)
                                      ├─ alerts.py    rules evaluated against history
                                      ├─ providers/   upload (ready) · sp_api (needs seller creds) · registry · sample
                                      └─ SQLite: data/live.db   data/demo.db   (never mixed)
```

## Data model (migrations/001_init.sql)
`observations(product_id, metric, value_num, kind, source, as_of, marketplace, import_id)` is the core: one row per number per
time, so history, provenance and alerts come from the same table. `kind` is one of observed, user_supplied, calculated,
estimated, sample. Other tables: products, imports, watchlists/items, alert_rules/alerts, keywords/keyword_observations,
fee_profiles (with verified_at), settings, projects/items, calc_runs.

## Provider interface
Each source declares what it gives, what it does not, what it needs and costs (`providers/registry.py`). An unconfigured provider
raises `NotConfigured`; nothing is faked. Adding Keepa later means one new module that writes `observed` rows with its own source label.

## Security
Binds to 127.0.0.1. Secrets only in server environment / `.env` (ignored by git), shown as "set (hidden)", never rendered or logged.
CSRF token (cookie + form/header) on every state-changing request. Uploads limited to 2 MB; every value rendered with autoescaping.

## Milestones
1. (this build) imports, comparison, watchlists/alerts, calculator, keywords, listing audit, projects/reports, demo mode.
2. SP-API fees and catalogue refresh once you register a private app.
3. Keepa adapter if you approve the cost. 4. Scheduled refresh. 5. Inventory and ad modules. 6. Browser extension.
