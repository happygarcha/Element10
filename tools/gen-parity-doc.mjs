// Regenerates docs/10-parity-matrix.md from web/js/parity.js so the doc and the in-app page never disagree. Run: node tools/gen-parity-doc.mjs
import { PARITY, PLATFORMS, STATUSES, summary } from "../web/js/parity.js";
import fs from "node:fs";
const s = summary(), esc = (x) => String(x).replace(/\|/g, "\\|").replace(/\n/g, " ");
let out = `# Feature-parity matrix (generated)

Generated from \`web/js/parity.js\` by \`node tools/gen-parity-doc.mjs\`. The same data powers the in-app **Parity matrix** page.

**Status of the project against this matrix:** ${s.total} capabilities. implemented ${s.implemented}, partial ${s.partial}, missing ${s.missing}, blocked ${s.blocked} (${s.pct_implemented}% fully implemented).
The platform is **not** complete. "Partial" means some of the capability works with the data you hold or connect; "blocked" means a licence, account or data source is required.

Helium 10 facts: **official** = \`helium10/Helium10-MCP\` README (read 2026-10-17, the only first-party text reachable from the build environment); **secondary** = third-party reviews found in search results (helium10.com, its help centre and demos are unreachable from the build environment); **unverified** = not checked. Per-country feature lists were not available from any source, so none are claimed.

## Platforms
| Platform | Helium 10 (as far as verified) | Element10 |
|---|---|---|
${PLATFORMS.map((p) => `| ${p.name} | ${esc(p.helium10)} | ${esc(p.element10)} |`).join("\n")}

## Capabilities
${[...new Set(PARITY.map((r) => r.area))].map((a) => `### ${a}
| ID | Helium 10 capability (ref) | Platforms | Element10 equivalent / workflow | Data source | Access and cost | Acceptance criterion | Status | Evidence | Remaining difference |
|---|---|---|---|---|---|---|---|---|---|
${PARITY.filter((r) => r.area === a).map((r) => `| ${r.id} | ${esc(r.h10)} (${r.ref}) | ${esc(r.platforms)} | ${esc(r.e10)}. ${esc(r.workflow)} | ${esc(r.sources)} | ${esc(r.access)} | ${esc(r.accept)} | **${r.status}** | ${esc(r.evidence)} | ${esc(r.gap)} |`).join("\n")}
`).join("\n")}
## Browser extension evaluation
Helium 10 runs Xray-style research on Amazon pages from a Chrome extension. Reproducing that needs product data on the page. Reading Amazon's page HTML in an extension is scraping, which Amazon's terms forbid and which breaks without notice. A legitimate extension would only *display* data Element10 already holds (from your CSVs, Keepa, SP-API or the Helium 10 MCP) next to the page, keyed by ASIN. That is a reasonable later milestone (Manifest V3, reads the ASIN from the URL, asks the Element10 API for your stored numbers). It was **not built** because it adds no new data; the data sources above are the blocker, not the display surface.

## Status counts
${STATUSES.map((x) => `- ${x}: ${s[x]}`).join("\n")}
`;
fs.writeFileSync(new URL("../docs/10-parity-matrix.md", import.meta.url), out); console.log("wrote docs/10-parity-matrix.md", s);
