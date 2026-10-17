# Helium 10 MCP: what it is, what was checked, how Element10 uses it

## Primary source
`github.com/helium10/Helium10-MCP` (cloned and read 2026-10-17; README, LICENSE and `skills/`). Facts below are from that README unless marked.

| Question | Answer |
|---|---|
| Endpoint | `https://mcp.helium10.com/mcp` (streamable-HTTP MCP) |
| Auth | OAuth 2.1 + PKCE (interactive clients) or an **API token** created in Helium 10 under Settings -> MCP -> Create API Key, sent as `Authorization: h10_mcp_...` (raw, no Bearer). Up to 2-year expiry, up to 50 tokens, shown once. |
| Scope of data | Bound 1:1 to a Helium 10 user; tools you are not entitled to do not appear. |
| Toolsets | Keyword Research (reverse-ASIN, seed expansion, keyword DB), Product Research (active/inactive), Brand Analytics (ABA), Keyword Tracking, Listings (details, score, compare, competitor overview), Profits (P&L, 8 variants), Inventory, Ads Query (5-step schema-discovered flow). Plus a listing-builder skill that can **publish to Amazon**. |
| Plan and limits | The README does not state plan or call limits. Search snippets (secondary) say Diamond plan or higher and 1,000 calls per month; **confirm in your Helium 10 account**. |
| Licence | The repository content is proprietary: use as distributed, no modification or redistribution. That covers the repo (skills, manifests), not the data. Terms for *data* use are in Helium 10's Terms of Use, **which could not be read from the build environment**. Earlier secondary reading: reverse engineering prohibited; automated access/caching restricted (2024 text). |

## Decision
- Using your **own** token for **your own** read-only queries from your own private app is the use the README documents ("headless, CI" API-token path). Element10 therefore offers it, **off by default** until you set the token.
- Element10 does **not** copy the repository's skills or tool descriptions, does **not** scrape helium10.com, and does **not** call any private endpoint. It talks to the documented MCP endpoint only.
- Write tools are blocked by an allow-list in the function (listing sync/generate/rewrite and anything that changes Amazon). Publishing listings stays impossible from Element10.
- Results are displayed as returned and are **not** re-labelled as Element10 observations or mixed into product tables. Saving is a per-result button, private to you. Because the data-retention terms are unconfirmed, keep saved results only as long as Helium 10's terms allow; do not share the app or its data with others.
- Calls count against your Helium 10 allowance, so each run asks for confirmation and the function rate-limits to 30 calls per hour per account.

## Setup (only if your Helium 10 plan includes MCP)
1. Helium 10 -> Settings -> MCP -> Create API Key. Copy it once.
2. `supabase secrets set H10_MCP_TOKEN=h10_mcp_...` and `supabase functions deploy h10mcp status`.
3. Element10 -> Connections shows "secret set"; **Helium 10 MCP** page -> "Load my available tools".
To disconnect: `supabase secrets unset H10_MCP_TOKEN`, and revoke the key in Helium 10.

## Verification
Tested: handshake order (initialize -> initialized -> tools/list|call), JSON and SSE replies, allow-list, 401 handling, no token echo (fake server in `tests/functions.test.js`); form generation, dash-for-missing, save (browser test). **Not tested against the real server**: it needs a token. The first live call may reveal differences (for example the SSE framing or tool argument shapes); the console shows the server's own error text.

## What it unlocks in the parity matrix (if your plan includes it)
PD2, PD3, KW1 (alternative route), KW2, FN2 (P&L), plus ABA and listing tools, all through the console. Mapping those results into Element10's tables is deliberately not done until real responses have been seen.
