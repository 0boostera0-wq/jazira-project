import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { SUPABASE_URL, SUPABASE_KEY, isSupabaseConfigured } from '@/lib/supabase-env';

// Per-request server client bound to the caller's auth cookies (RLS applies as
// that user). Returns null when Supabase is not configured — route handlers
// should answer 503 in that case rather than throwing.
export async function createClient() {
  if (!isSupabaseConfigured) return null;
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component (read-only cookies) — safe to ignore;
          // the browser client refreshes the session itself.
        }
      },
    },
  });
}

/** Resolve the signed-in user for a route handler: { supabase, user } (user may be null). */
export async function getRouteUser() {
  const supabase = await createClient();
  if (!supabase) return { supabase: null, user: null };
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}
