import { createClient } from "@supabase/supabase-js";

// Server-only client using the service role key. Never import this from a
// client component — the browser never talks to Supabase directly in this app,
// every mutation goes through a Next.js API route running on the server.
export function supabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}
