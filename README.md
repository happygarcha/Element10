# Element10

Element10 is a private research tool for Amazon FBA opportunities on **Amazon.ca and Amazon.com**. Original code, benchmarked against the
publicly documented features of tools like Helium 10. It does not scrape Amazon, copy anyone's software, or use private endpoints.

**Free to run, no accounts needed.** Without credentials it works on CSV exports you provide. Official Amazon data (SP-API) needs your
own seller account; paid sources (Keepa) are not connected and nothing is charged without your approval.

## What works now
Product list with filters · side-by-side comparison with a transparent opportunity score · CSV import for products and keywords ·
watchlists with price/rank alerts · CA/US profit calculator with break-even and target-margin prices · keyword clustering ·
listing audit · projects with CSV and printable reports · data-source map · demo mode with fictional data.
See [docs/02-feature-matrix.md](docs/02-feature-matrix.md) for what needs paid data or a seller account.

## Two editions
- **Web edition (`web/`)**: runs in the browser, hosted on GitHub Pages, with login and your own free Supabase database so it works on every device. See [docs/06-hosting-and-login.md](docs/06-hosting-and-login.md).
- **Python edition (`src/arp`)**: runs on your computer with a local SQLite file; the place for server-side secrets such as Amazon SP-API credentials.

## Setup (Python edition)
```bash
python3 -m venv .venv && .venv/bin/pip install -e ".[dev]"
cp .env.example .env            # optional; everything in it is optional
.venv/bin/python -m arp         # http://127.0.0.1:8000
```
First: open **Settings**, enter the USD→CAD rate, and fill each fee profile from Seller Central's FBA Revenue Calculator, then tick "verified".
Try everything with fictional data via **Switch to demo mode** (or `ARP_DEFAULT_MODE=demo`).

## Tests and checks (Python edition)
```bash
.venv/bin/pytest -q && .venv/bin/ruff check src tests
```
Data lives in `data/live.db` and `data/demo.db` (SQLite). Back up by copying them. Migrations in `src/arp/migrations` apply automatically.

## Docs
[research and sources](docs/01-research-and-sources.md) · [feature matrix](docs/02-feature-matrix.md) · [architecture](docs/03-architecture.md) ·
[data integrity](docs/04-data-integrity.md) · [calculations](docs/05-calculations.md) · [hosting and login](docs/06-hosting-and-login.md) · [phase 2](docs/07-phase2.md) · [REA investigation](docs/08-rea-investigation.md) · [providers and MCP](docs/09-providers-and-mcp.md)

## Web edition tests
```bash
node --test web/tests/calc.test.js web/tests/data.test.js     # logic, imports, store, Supabase adapter (mocked)
```
Browser tests (optional) are described in `web/tests/e2e/README.md`.
