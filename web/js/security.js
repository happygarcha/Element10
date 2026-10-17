// Client-side guard: refuse to run if a privileged Supabase key was pasted into config.js (the file is public).
export function inspectKey(key) {
  const k = String(key || "").trim();
  if (!k) return { ok: false, kind: "missing", message: "No anon key configured." };
  if (/^sb_secret_/i.test(k)) return { ok: false, kind: "secret", message: "That is a Supabase SECRET key. Never put it in config.js. Use the publishable/anon key." };
  if (/^sb_publishable_/i.test(k)) return { ok: true, kind: "publishable", message: "Publishable key (safe to expose; protected by row-level security)." };
  const parts = k.split(".");
  if (parts.length === 3) {
    try {
      const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/"), json = typeof atob === "function" ? atob(b64) : Buffer.from(b64, "base64").toString("utf8"), role = JSON.parse(json).role;
      if (role === "service_role") return { ok: false, kind: "service_role", message: "That is the service_role key, which bypasses all row-level security. Remove it from config.js now and rotate it in Supabase." };
      if (role === "anon") return { ok: true, kind: "anon", message: "Anon key (safe to expose; protected by row-level security)." };
      return { ok: false, kind: "unknown", message: `Key role '${role}' is not the anon role.` };
    } catch (_) { return { ok: false, kind: "unreadable", message: "Could not read the key." }; }
  }
  return { ok: false, kind: "unrecognised", message: "Unrecognised key format." };
}
export function configChecks(cfg, loc = {}) {
  const key = inspectKey(cfg.supabaseAnonKey), out = [];
  out.push({ name: "Supabase URL set", ok: !!cfg.supabaseUrl && /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)\/?$/i.test(cfg.supabaseUrl), detail: cfg.supabaseUrl || "not set" });
  out.push({ name: "Key in config.js is not privileged", ok: key.ok, detail: key.message });
  if (loc.protocol) out.push({ name: "Served over HTTPS", ok: loc.protocol === "https:" || loc.hostname === "localhost", detail: loc.protocol });
  out.push({ name: "Public sign-up closed", ok: cfg.allowSignup === false, detail: cfg.allowSignup === false ? "button hidden (also disable sign-ups in Supabase)" : "Create account button still shown: set allowSignup:false after your account exists, and turn off sign-ups in Supabase" });
  return out;
}
