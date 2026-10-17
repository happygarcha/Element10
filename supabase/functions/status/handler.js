// Reports which providers have their secrets configured. Booleans only: never the values.
import { endpoint } from "../_shared/common.js";
export const handle = endpoint(async (_b, env) => ({
  spapi: !!(env.SPAPI_LWA_CLIENT_ID && env.SPAPI_LWA_CLIENT_SECRET && env.SPAPI_REFRESH_TOKEN),
  keepa: !!env.KEEPA_API_KEY, dataforseo: !!(env.DATAFORSEO_LOGIN && env.DATAFORSEO_PASSWORD),
  restricted_to_allowed_emails: !!env.ALLOWED_EMAILS,
}), { perHour: 600 });
