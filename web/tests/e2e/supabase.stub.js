// TEST ONLY stand-in for supabase-js: an in-memory "database" kept in sessionStorage so reloads behave like a real backend.
(function () {
  const load = () => JSON.parse(sessionStorage.getItem("stubdb") || "{}"), save = (d) => sessionStorage.setItem("stubdb", JSON.stringify(d));
  const sess = () => JSON.parse(sessionStorage.getItem("stubsess") || "null");
  window.__stub = { calls: [] };
  window.supabase = { createClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: sess() ? { user: { id: "u1", email: sess().user.email, created_at: "2026-10-01T00:00:00Z", email_confirmed_at: null } } : null } }),
      resend: async () => ({ error: null }),
      signInWithPassword: async ({ email, password }) => { if (password === "correct-horse") { sessionStorage.setItem("stubsess", JSON.stringify({ user: { email } })); return { error: null }; } return { error: { message: "Invalid login credentials" } }; },
      signUp: async () => ({ data: { session: null }, error: null }), signOut: async () => { sessionStorage.removeItem("stubsess"); return {}; },
      onAuthStateChange: () => ({}), resetPasswordForEmail: async () => ({ error: null }), updateUser: async () => ({ error: null }) },
    functions: { invoke: async (name, { body }) => {            // TEST FIXTURES shaped like the edge functions' replies
      window.__stub.calls.push({ name, body });
      if (!sess()) return { data: null, error: { message: "Sign in first." } };
      if (name === "status") return { data: { spapi: false, keepa: true, dataforseo: true, h10mcp: true, account_delete: true, restricted_to_allowed_emails: false }, error: null };
      if (name === "keepa" && body.action === "finder") return { data: { source: "Keepa Product Finder", as_of: "2026-10-17T12:00:00Z", asins: ["B0FINDER01", "B0FINDER02"], tokens_left: 70 }, error: null };
      if (name === "dataforseo" && body.action === "related") return { data: { source: "DataForSEO Labs Amazon API", as_of: "2026-10-17T12:00:00Z", items: [{ keyword: "thick yoga mat", search_volume: 300 }, { keyword: "no data kw", search_volume: null }], cost_usd: 0.02 }, error: null };
      if (name === "keepa") return { data: { source: "Keepa API", as_of: "2026-10-17T12:00:00Z", items: [{ asin: body.asins[0], title: "Fixture", price: 21.5, bsr: 4321, rating: 4.4, reviews: 88, monthly_sold: null, history: { price: [], bsr: [] } }], tokens_left: 40 }, error: null };
      if (name === "dataforseo") return { data: { source: "DataForSEO Labs Amazon API", as_of: "2026-10-17T12:00:00Z", items: body.keywords.map((k, i) => ({ keyword: k, search_volume: i === 0 ? 500 : null })), cost_usd: 0.01 }, error: null };
      if (name === "h10mcp" && body.action === "tools") return { data: { source: "Helium 10 MCP (your account)", as_of: "2026-10-17T12:00:00Z", tools: [{ name: "search_products", description: "Fixture tool", allowed: true, inputSchema: { type: "object", required: ["category"], properties: { category: { type: "string" }, min_reviews: { type: "number" } } } }, { name: "sync_listing_to_amazon", description: "write", allowed: false, inputSchema: {} }] }, error: null };
      if (name === "h10mcp" && body.action === "call") return { data: { source: "Helium 10 MCP (your account)", as_of: "2026-10-17T12:05:00Z", tool: body.tool, is_error: false, data: { rows: [{ asin: "B000000001", revenue: null, price: 12 }] }, text: null }, error: null };
      if (name === "account") return body.confirm === "me@example.com" ? { data: { deleted: true }, error: null } : { data: null, error: { message: "Type your account email exactly to confirm." } };
      return { data: null, error: { message: "unknown" } }; } },
    from: (t) => ({
      select: () => ({ range: async (a, b) => { if (!sess()) return { data: [], error: { message: "not logged in" } }; const d = load(); return { data: (d[t] || []).slice(a, b + 1).map((r) => ({ ...r, user_id: "u1" })), error: null }; } }),
      insert: async (rows) => { if (window.__stub.failInsert) return { error: { message: "simulated outage" } }; if (!sess()) return { error: { message: "not logged in" } }; const d = load(); d[t] = [...(d[t] || []), ...rows]; save(d); return { error: null }; },
      update: (p) => ({ eq: async (c, id) => { const d = load(); d[t] = (d[t] || []).map((r) => (r.id === id ? { ...r, ...p } : r)); save(d); return { error: null }; } }),
      delete: () => ({ eq: async (c, id) => { const d = load(); d[t] = (d[t] || []).filter((r) => r.id !== id); save(d); return { error: null }; } }) }) }) };
})();
