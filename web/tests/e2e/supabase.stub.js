// TEST ONLY stand-in for supabase-js: an in-memory "database" kept in sessionStorage so reloads behave like a real backend.
(function () {
  const load = () => JSON.parse(sessionStorage.getItem("stubdb") || "{}"), save = (d) => sessionStorage.setItem("stubdb", JSON.stringify(d));
  const sess = () => JSON.parse(sessionStorage.getItem("stubsess") || "null");
  window.__stub = { calls: [] };
  window.supabase = { createClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: sess() } }),
      signInWithPassword: async ({ email, password }) => { if (password === "correct-horse") { sessionStorage.setItem("stubsess", JSON.stringify({ user: { email } })); return { error: null }; } return { error: { message: "Invalid login credentials" } }; },
      signUp: async () => ({ data: { session: null }, error: null }), signOut: async () => { sessionStorage.removeItem("stubsess"); return {}; },
      onAuthStateChange: () => ({}), resetPasswordForEmail: async () => ({ error: null }), updateUser: async () => ({ error: null }) },
    functions: { invoke: async (name, { body }) => {            // TEST FIXTURES shaped like the edge functions' replies
      window.__stub.calls.push({ name, body });
      if (!sess()) return { data: null, error: { message: "Sign in first." } };
      if (name === "status") return { data: { spapi: false, keepa: true, dataforseo: true, restricted_to_allowed_emails: false }, error: null };
      if (name === "keepa") return { data: { source: "Keepa API", as_of: "2026-10-17T12:00:00Z", items: [{ asin: body.asins[0], title: "Fixture", price: 21.5, bsr: 4321, rating: 4.4, reviews: 88, monthly_sold: null, history: { price: [], bsr: [] } }], tokens_left: 40 }, error: null };
      if (name === "dataforseo") return { data: { source: "DataForSEO Labs Amazon API", as_of: "2026-10-17T12:00:00Z", items: body.keywords.map((k, i) => ({ keyword: k, search_volume: i === 0 ? 500 : null })), cost_usd: 0.01 }, error: null };
      return { data: null, error: { message: "unknown" } }; } },
    from: (t) => ({
      select: () => ({ range: async (a, b) => { if (!sess()) return { data: [], error: { message: "not logged in" } }; const d = load(); return { data: (d[t] || []).slice(a, b + 1).map((r) => ({ ...r, user_id: "u1" })), error: null }; } }),
      insert: async (rows) => { if (!sess()) return { error: { message: "not logged in" } }; const d = load(); d[t] = [...(d[t] || []), ...rows]; save(d); return { error: null }; },
      update: (p) => ({ eq: async (c, id) => { const d = load(); d[t] = (d[t] || []).map((r) => (r.id === id ? { ...r, ...p } : r)); save(d); return { error: null }; } }),
      delete: () => ({ eq: async (c, id) => { const d = load(); d[t] = (d[t] || []).filter((r) => r.id !== id); save(d); return { error: null }; } }) }) }) };
})();
