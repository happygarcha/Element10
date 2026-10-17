// Supabase Edge Function entry point (Deno). Logic lives in handler.js so it is unit-tested in Node.
import { handle } from "./handler.js";
Deno.serve((req: Request) => handle(req, Deno.env.toObject(), fetch));
