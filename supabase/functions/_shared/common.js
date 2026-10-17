// Shared by every Edge Function. Plain ES modules so they run in Supabase (Deno) and in Node tests.
// Rules: only a logged-in user may call; inputs are validated and capped (they cost money); upstream errors
// are sanitised so a key can never be echoed back; no secret ever appears in a response.
export const MARKETS = {
  CA: { spapi: "A2EUQ1WTGCTBG2", currency: "CAD", keepaDomain: 6, dfsLocation: 2124 },
  US: { spapi: "ATVPDKIKX0DER", currency: "USD", keepaDomain: 1, dfsLocation: 2840 },
};
export const ASIN_RE = /^[A-Z0-9]{10}$/;

export class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }

export function corsHeaders(req, env) {
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const origin = req.headers.get("origin") || "";
  const ok = allowed.length === 0 ? "*" : allowed.includes(origin) ? origin : allowed[0];
  return { "access-control-allow-origin": ok, "access-control-allow-headers": "authorization, apikey, content-type, x-client-info", "access-control-allow-methods": "POST, OPTIONS", vary: "origin" };
}
export const reply = (req, env, body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(req, env), "content-type": "application/json" } });

// Never let a secret leave the server, even inside an upstream error message.
export function sanitise(text, env) {
  let t = String(text ?? "");
  for (const k of ["SPAPI_LWA_CLIENT_SECRET", "SPAPI_REFRESH_TOKEN", "KEEPA_API_KEY", "DATAFORSEO_PASSWORD", "DATAFORSEO_LOGIN", "H10_MCP_TOKEN", "SUPABASE_SERVICE_ROLE_KEY"]) if (env[k] && env[k].length > 3) t = t.split(env[k]).join("[hidden]");
  t = t.replace(/h10_mcp_[A-Za-z0-9_-]+/g, "[hidden]");
  return t.slice(0, 300);
}

// Confirm the caller holds a valid Supabase login (not just the public anon key) by asking Supabase Auth.
export async function requireUser(req, env, fetchFn = fetch) {
  const auth = req.headers.get("authorization") || "";
  if (!/^Bearer\s+\S+/i.test(auth)) throw new HttpError(401, "Sign in first.");
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) throw new HttpError(500, "Function is not configured (missing Supabase environment).");
  let r;
  try { r = await fetchFn(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { authorization: auth, apikey: env.SUPABASE_ANON_KEY } }); }
  catch (_) { throw new HttpError(502, "Could not verify your login."); }
  if (!r.ok) throw new HttpError(401, "Your session is not valid. Sign in again.");
  const user = await r.json();
  if (!user || !user.id || user.is_anonymous) throw new HttpError(401, "Sign in first.");
  const allow = (env.ALLOWED_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (allow.length && !allow.includes((user.email || "").toLowerCase())) throw new HttpError(403, "This account is not allowed to use paid data providers.");
  return user;
}

const hits = new Map();   // best-effort per-instance limiter; Supabase may run several instances, so it is a brake, not a guarantee
export function limit(userId, max = Number(1e9), windowMs = 3600_000, now = Date.now()) {
  const arr = (hits.get(userId) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) throw new HttpError(429, "Too many requests. Try again later.");
  arr.push(now); hits.set(userId, arr);
}
export const resetLimits = () => hits.clear();

export async function readJson(req, maxBytes = 20_000) {
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, "Request too large.");
  try { return JSON.parse(text || "{}"); } catch (_) { throw new HttpError(400, "Body must be JSON."); }
}
export function market(body) { if (!MARKETS[body.marketplace]) throw new HttpError(400, "marketplace must be CA or US."); return MARKETS[body.marketplace]; }
export function asins(list, max) {
  if (!Array.isArray(list) || !list.length) throw new HttpError(400, "Provide at least one ASIN.");
  if (list.length > max) throw new HttpError(400, `At most ${max} ASINs per request.`);
  const out = list.map((a) => String(a).trim().toUpperCase());
  const bad = out.find((a) => !ASIN_RE.test(a)); if (bad) throw new HttpError(400, `'${bad}' is not a valid ASIN.`);
  return [...new Set(out)];
}

// Wrap a handler: CORS, method, auth, rate limit, uniform errors. `fetchFn` is injectable for tests.
export function endpoint(fn, { perHour = 60 } = {}) {
  return async (req, env, fetchFn = fetch) => {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req, env) });
    try {
      if (req.method !== "POST") throw new HttpError(405, "Use POST.");
      const user = await requireUser(req, env, fetchFn);
      limit(user.id + ":" + (fn.name || "fn"), Number(env.MAX_CALLS_PER_HOUR || perHour));
      const body = await readJson(req);
      return reply(req, env, await fn(body, env, fetchFn, user));
    } catch (e) {
      if (e instanceof HttpError) return reply(req, env, { error: sanitise(e.message, env) }, e.status);
      return reply(req, env, { error: "Unexpected error." }, 500);
    }
  };
}
export const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
