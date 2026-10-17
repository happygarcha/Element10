// Helium 10 MCP bridge (official server https://mcp.helium10.com/mcp, README at github.com/helium10/Helium10-MCP).
// It forwards READ-ONLY tool calls made by YOUR logged-in Element10 account, using YOUR Helium 10 API token (Settings -> MCP -> Create API Key)
// stored as a server secret. Requires a Helium 10 plan that includes MCP (their docs: entitlements decide which tools exist).
// Tool schemas are discovered at runtime (tools/list), so results are shown as returned and are never remapped into
// Element10 metrics we cannot verify. Write tools (listing sync, generate, rewrite) are blocked here by an allow-list.
// Not yet run against the live server: it needs a Helium 10 token. Written to the MCP streamable-HTTP JSON-RPC spec.
import { HttpError, endpoint, nowIso } from "../_shared/common.js";

export const ENDPOINT = "https://mcp.helium10.com/mcp";
export const READ_ONLY_TOOLS = new Set([
  "analyze_keywords", "get_keywords_by_asin", "get_keywords_by_keyword", "get_top_keywords", "search_amazon_keywords",
  "search_products", "search_inactive_products", "search_amazon_brand_analytics",
  "list_tracked_keywords", "list_tracked_competitor_keywords", "get_keywords_rank_history", "get_keywords_new_suggestion",
  "get_listing_details", "get_listing_score", "compare_listings", "get_competitor_overview",
  "get_account_profit_and_loss_summary", "get_account_profit_and_loss_summary_series", "get_account_profit_and_loss_breakdown", "get_account_profit_and_loss_breakdown_series",
  "get_product_profit_and_loss_summary", "get_product_profit_and_loss_summary_series", "get_product_profit_and_loss_breakdown", "get_product_profit_and_loss_breakdown_series",
  "get_inventory_values", "get_fba_inventory_health_status", "get_sales_velocity",
  "get_ads_query_platforms", "get_ads_query_list", "get_ads_query_schema", "get_ads_query_materials", "execute_ads_query",
]);

// MCP streamable HTTP may answer with JSON or with a server-sent-event stream; read the JSON-RPC message from either.
export async function readRpc(r) {
  const text = await r.text(), ct = r.headers.get("content-type") || "";
  if (ct.includes("text/event-stream")) {
    const datas = text.split(/\n\n+/).map((b) => b.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("")).filter(Boolean);
    for (const d of datas.reverse()) { try { const j = JSON.parse(d); if (j.result !== undefined || j.error) return j; } catch (_) { /* skip non-JSON events */ } }
    throw new HttpError(502, "Helium 10 MCP sent no usable reply.");
  }
  try { return JSON.parse(text); } catch (_) { throw new HttpError(502, "Helium 10 MCP sent a reply that is not JSON."); }
}

async function rpc(f, token, sid, body) {
  const headers = { authorization: token, "content-type": "application/json", accept: "application/json, text/event-stream", ...(sid ? { "mcp-session-id": sid } : {}) };
  const r = await f(ENDPOINT, { method: "POST", headers, body: JSON.stringify(body) });
  if (r.status === 401 || r.status === 403) throw new HttpError(502, "Helium 10 rejected the API token (expired, revoked, or the plan has no MCP access).");
  if (r.status === 429) throw new HttpError(429, "Helium 10 says too many requests (check your monthly MCP allowance).");
  if (!r.ok && r.status !== 202) throw new HttpError(502, `Helium 10 MCP returned HTTP ${r.status}.`);
  return { r, msg: r.status === 202 ? null : await readRpc(r) };
}
export async function session(f, token) {
  const { r, msg } = await rpc(f, token, null, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "element10", version: "0.3" } } });
  if (msg && msg.error) throw new HttpError(502, `Helium 10 MCP: ${String(msg.error.message || "initialize failed").slice(0, 160)}`);
  const sid = r.headers.get("mcp-session-id") || null;
  await rpc(f, token, sid, { jsonrpc: "2.0", method: "notifications/initialized" });
  return sid;
}

export const handle = endpoint(async (body, env, f) => {
  if (!env.H10_MCP_TOKEN) throw new HttpError(503, "Helium 10 MCP is not configured on the server (needs your Helium 10 API token).");
  if (body.action === "tools") {
    const sid = await session(f, env.H10_MCP_TOKEN), { msg } = await rpc(f, env.H10_MCP_TOKEN, sid, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    if (msg.error) throw new HttpError(502, `Helium 10 MCP: ${String(msg.error.message).slice(0, 160)}`);
    const tools = (msg.result.tools || []).map((t) => ({ name: t.name, description: String(t.description || "").slice(0, 600), inputSchema: t.inputSchema || {}, allowed: READ_ONLY_TOOLS.has(t.name) }));
    return { source: "Helium 10 MCP (your account)", as_of: nowIso(), tools };
  }
  if (body.action === "call") {
    const name = String(body.tool || "");
    if (!READ_ONLY_TOOLS.has(name)) throw new HttpError(403, "That tool is not allowed here (read-only research tools only).");
    const args = body.arguments && typeof body.arguments === "object" && !Array.isArray(body.arguments) ? body.arguments : {};
    if (JSON.stringify(args).length > 8000) throw new HttpError(413, "Arguments too large.");
    const sid = await session(f, env.H10_MCP_TOKEN), { msg } = await rpc(f, env.H10_MCP_TOKEN, sid, { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name, arguments: args } });
    if (msg.error) throw new HttpError(502, `Helium 10 MCP: ${String(msg.error.message).slice(0, 200)}`);
    const res = msg.result || {}, parts = (res.content || []).filter((c) => c.type === "text").map((c) => c.text);
    let data = res.structuredContent ?? null;
    if (data == null && parts.length === 1) { try { data = JSON.parse(parts[0]); } catch (_) { /* keep as text */ } }
    return { source: "Helium 10 MCP (your account)", as_of: nowIso(), tool: name, is_error: !!res.isError, data, text: data == null ? parts.join("\n").slice(0, 20000) : null,
      cost: "counts against your Helium 10 monthly MCP allowance (their docs: 1,000 calls per month on the plans that include MCP; confirm yours)" };
  }
  throw new HttpError(400, "action must be tools or call.");
}, { perHour: 30 });
