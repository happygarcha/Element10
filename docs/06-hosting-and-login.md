# Hosting, login and database (Element10 web app)

The web app lives in `web/` and is published to **GitHub Pages**. Pages only serves files, so login and the database come from
**Supabase** (free tier): it provides email/password login and a Postgres database. The browser talks to Supabase directly. Your data
is protected by login plus row-level security: nobody, including someone who finds the site, can read a row without logging in as its owner.

Three storage modes (switchable in the sidebar):
| Mode | Where data lives | Works on other devices | Needs setup |
|---|---|---|---|
| Your account | Your Supabase database | Yes, after login | Yes (below) |
| This device only | This browser (IndexedDB) | No | None |
| Demo | Memory, fictional data | n/a | None |

## One-time setup (about 10 minutes, free, no card)
1. **Create a Supabase project** at supabase.com (sign in with GitHub). Choose a region near you (Canada Central if offered). Set a strong database password and save it somewhere safe; Element10 never needs it.
2. **Create the tables:** Project -> SQL Editor -> New query -> paste all of `supabase/schema.sql` -> Run. It is safe to re-run.
3. **Copy the connection values:** Project Settings -> API. Copy the **Project URL** and the **anon / publishable key**.
   Never copy the `service_role` key anywhere in this repo.
4. **Put them in `web/config.js`** (`supabaseUrl`, `supabaseAnonKey`), commit and push. The anon key is meant to be public; row-level security is the protection.
5. **Create your account:** open the site, press "Create account", confirm the email Supabase sends.
6. **Lock sign-ups:** Authentication -> Sign In / Providers -> turn off "Allow new users to sign up" (Supabase's own switch is the real lock),
   then set `allowSignup: false` in `config.js`. Now only your account can log in.
7. **Authentication -> URL Configuration:** set the Site URL to your Pages address so password-reset emails come back to the app.
8. **Publish the site:** repo must be **public** on the free GitHub plan (Settings -> General -> Danger Zone -> Change visibility), then Settings -> Pages -> Source = **GitHub Actions**. Push to `main` (or run the `pages` workflow). Address: `https://<your-github-name>.github.io/element10/`.

## What is public and what is private
- Public: the code, `config.js` (project URL and anon key). No research data is in the repository.
- Private: every row in your Supabase database (login + row-level security).
- Tell nobody your password. Use a password manager. Supabase rate-limits login attempts.

## Check your own security (2 minutes)
Open the site in a private window without logging in: you should see only the login screen. In Supabase -> Table editor each table should show
"RLS enabled". If you ever see "RLS disabled", re-run `supabase/schema.sql`.

## Moving data
Settings -> "Download a backup (JSON)" works in every mode. "Restore a backup" loads one. If you started in "This device only" mode,
sign in later and use "Copy this device's data into my account" (works when the account is empty).

## What was and was not tested
Tested: all app logic in Node, every screen and flow in a real browser in local and demo modes, and the login/write/reload flow against an
in-memory stand-in for Supabase. **Not tested against a real Supabase project** (that needs your account). If a step fails, the screen shows the error message; send it over.

## Costs and limits
Supabase free tier and GitHub Pages are free. Supabase free projects pause after a week without activity (open the app to resume); check Supabase's current limits.

## Other editions
The Python edition (`src/arp`, run with `python -m arp`) keeps data in a local SQLite file and is the place for server-side secrets (e.g. Amazon SP-API credentials),
which a browser-only site cannot keep private.

## Live data functions (optional; each provider costs money or needs a seller account)
Skip this section if you only use CSV imports. Nothing here is required for login, storage or the calculators.

1. Install the Supabase CLI and log in: `npm i -g supabase` then `supabase login`.
2. From the repo root: `supabase link --project-ref <your-project-ref>`.
3. Set the secrets for providers you actually subscribed to (never commit these):
   ```
   supabase secrets set ALLOWED_ORIGINS=https://<your-github-name>.github.io
   supabase secrets set ALLOWED_EMAILS=<your login email>
   supabase secrets set KEEPA_API_KEY=...                       # Keepa
   supabase secrets set DATAFORSEO_LOGIN=... DATAFORSEO_PASSWORD=...   # DataForSEO
   supabase secrets set SPAPI_LWA_CLIENT_ID=... SPAPI_LWA_CLIENT_SECRET=... SPAPI_REFRESH_TOKEN=...   # SP-API
   ```
   (`SUPABASE_URL` and `SUPABASE_ANON_KEY` are provided to functions automatically.)
4. Deploy: `supabase functions deploy status spapi keepa dataforseo`.
5. Open Element10 -> Data sources: each provider shows "secrets set". Then use the Fetch buttons on a product page.
6. Run `supabase/tests/rls_check.sql` in the SQL editor: every row should show `ok = true`.
The functions verify your login with Supabase, only answer `ALLOWED_EMAILS`, cap request sizes and call rates, and never return a secret.
