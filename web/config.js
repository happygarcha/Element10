// Element10 connection settings. Safe to publish: the anon key is designed to be public, and your data is protected by
// login plus row-level security (see ../supabase/schema.sql). NEVER put a "service_role" key here.
// Leave the two values empty to run in local mode (data stays in this browser only).
window.ELEMENT10_CONFIG = {
  supabaseUrl: "",
  supabaseAnonKey: "",
  allowSignup: true,   // hide the "Create account" button once your own account exists (also turn sign-ups off in Supabase)
};
