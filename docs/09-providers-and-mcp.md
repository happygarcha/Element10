# Data providers and the Helium 10 MCP: access evaluation

Nothing was integrated that could not be confirmed. "Confirmed" = read on the provider's own documentation or terms page; "secondary" = search summaries or third-party pages.

| Source | Needs | Permitted use (as known) | Status in Element10 |
|---|---|---|---|
| **Helium 10 MCP** | Diamond plan or higher, OAuth sign-in, 1,000 calls per month, designed for AI clients (Claude, ChatGPT, Codex) (secondary) | A signed-in user using their own plan through a supported AI client. Helium 10's Terms of Use prohibit reverse engineering; a 2024 text also restricted automated access and caching (secondary, not re-confirmed) | **Not integrated.** It is an OAuth tool for AI assistants, not an API for a self-hosted web app, and caching its data in our database may breach the terms. You can use it yourself in Claude and paste or export results into Element10's CSV import. |
| **Amazon SP-API** | Your own seller account and a private app | Official, for your own seller data | **Built** (`spapi` function): catalogue + rank, fee estimate. Unit-tested on mocked replies; not run live. Needs your credentials. |
| **Keepa API** | Paid plan (about EUR 49/month, secondary) | Per Keepa's API terms; token-metered | **Built** (`keepa` function). Not run live. Requires your approval before you subscribe. |
| **DataForSEO Labs (Amazon)** | Pay-as-you-go account | Commercial API | **Built** (`dataforseo` function): search volume and ranked keywords; cost returned per call. Not run live. |
| **Jungle Scout API** | Plan plus API add-on (secondary) | Terms not confirmed | **Not built.** |
| **PA-API / Creators API** | Associates account with qualifying sales | Affiliate use | **Not built.** |
| **Scraping Amazon** | n/a | Breaks Amazon terms | **Never.** |

## Honesty rules enforced in code
- A provider returning `null` produces no stored number (tests: `functions.test.js`, `live.test.js`).
- Search volume, fee estimates and provider "units sold" are stored as `estimated`; measured fields as `observed`; everything carries the provider name and time.
- Nothing calls a provider without a click, and paid calls ask for confirmation first.
- There is no sales or revenue estimator from rank.

## Verification status
Verified: request validation, caps, authentication, secret redaction, parsing, labelling (automated tests with fixtures). **Not verified:** the providers' real responses. The first live call for each provider must be checked against the provider's documentation; the parsers throw on unexpected shapes instead of guessing.
