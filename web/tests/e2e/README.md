# Browser tests (optional, need a browser)

These drive the real pages with Playwright.
- `local.e2e.mjs`: local mode (IndexedDB): import, calculator, watchlist alert, inventory, audit, ads, backup, demo isolation.
- `login.e2e.mjs`: login flow against an in-memory STAND-IN for Supabase (`supabase.stub.js`). It proves the app's login,
  write and reload logic, NOT the real Supabase service. Test-only; never deployed.

Run (from `web/`): serve the folder (`python3 -m http.server 8771`), then `npm i playwright-core` somewhere and
`node tests/e2e/local.e2e.mjs`. For the login test copy `web/` elsewhere, replace `config.js` with a stub URL/key and
`vendor/supabase.js` with `tests/e2e/supabase.stub.js`, serve it on port 8772, then run `login.e2e.mjs`.
