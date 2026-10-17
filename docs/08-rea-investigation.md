# REA investigation (Phase 2)

REA 6.5.0 (`npx rea-agents`, run with `npm_config_ignore_scripts=true`, never `setup`). Documentation read first
(`rea/README.md`, `rea/docs/browser-observation.md`). Evidence below is labelled **observed** (read from the running page) or **inferred**.

## Tools evaluated
| REA capability | Useful here? | Used on |
|---|---|---|
| `list-browser-targets`, `inspect-web-page` (DOM, scripts, resources, network, storage names, workers) | Yes | Element10 (our own app) |
| `analyze-web-bundle` (parses shipped JS: routes, endpoint candidates, framework) | Yes | Element10 |
| `observe-web-session`, `capture-web-screenshot`, `compare-web-captures` | Yes, for regression checks | Element10 |
| `discover-webmcp-tools` | Checked: Element10 exposes none (by design) | Element10 |
| Native/binary and extension analysis tools | Not applicable: no Helium 10 binary or extension was provided or authorised for analysis | none |

## What was observed on Element10 (final build, local mode)
- **Observed:** 23 resources, all from the app's own origin; no third-party scripts, fonts or analytics; no network requests while idle; no service-worker data caching beyond a static shell cache (`element10-shell-v2`).
- **Observed:** storage = one IndexedDB database (`element10-local`), no localStorage secrets, values redacted by REA.
- **Observed:** 21 scripts parsed, 0 parse failures. Bundle analysis reported only low-confidence "endpoint candidates" (`title`, `brand`, `products`...). **Inferred:** these are object keys and route names, not URLs. There is no hard-coded API URL or key in the bundle.
- **Inferred:** hash-router registration (REA: medium confidence), matching `js/main.js`.

## What could not be done, and why
- **Helium 10's logged-in web app / Chrome extension / private endpoints:** not inspected. Restriction: requires their paid login; their Terms of Use prohibit reverse engineering; the task rules exclude private endpoints and access-control bypass. REA was not run against them.
- **Helium 10 public marketing/help pages:** the sandbox proxy blocks `helium10.com` (HTTP 403/DNS), so REA could not load them either. Feature scope came from search-result summaries of their public pages and is treated as secondary.
- **Real Supabase and provider calls:** not reachable from the sandbox; verified with stand-ins (see `09-providers-and-mcp.md`).

## How findings shaped the build
Because REA showed the app is a static, same-origin bundle with no embedded secrets, the architecture rule holds: secrets exist only as Supabase function secrets; the browser holds only the public anon key and the user's login token.
