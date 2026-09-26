// Service-role Supabase client — SERVER ROUTE HANDLERS ONLY.
//
// It bypasses Row Level Security. Never import this file from anything that
// can reach the browser (components, hooks, context, lib/data/*): the key is
// read from process.env.SUPABASE_SERVICE_ROLE_KEY, which is not NEXT_PUBLIC_
// and therefore empty in client bundles anyway — but keep it that way.
//
// Returns null when the URL or key is missing; callers answer 501/503.
import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}
