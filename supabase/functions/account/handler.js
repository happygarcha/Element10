// Account deletion. Needs Supabase's service-role key, which Supabase injects into Edge Functions as SUPABASE_SERVICE_ROLE_KEY.
// It exists ONLY inside this function's server environment: never in the web app, GitHub, or logs. The caller must be logged in and
// must type their own email address as confirmation. Deleting the auth user cascades to every row they own (schema: on delete cascade).
import { HttpError, endpoint, nowIso } from "../_shared/common.js";
export const handle = endpoint(async (body, env, f, user) => {
  if (body.action !== "delete") throw new HttpError(400, "action must be delete.");
  if (!env.SUPABASE_SERVICE_ROLE_KEY) throw new HttpError(503, "Account deletion is not available: the function has no service credentials.");
  if (String(body.confirm || "").trim().toLowerCase() !== String(user.email || "").toLowerCase() || !user.email) throw new HttpError(400, "Type your account email exactly to confirm.");
  const r = await f(`${env.SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(user.id)}`, { method: "DELETE", headers: { authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, apikey: env.SUPABASE_SERVICE_ROLE_KEY } });
  if (!r.ok) throw new HttpError(502, `Could not delete the account (HTTP ${r.status}).`);
  return { deleted: true, as_of: nowIso() };
}, { perHour: 5 });
