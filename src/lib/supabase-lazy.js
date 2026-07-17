"use client";

// Async accessor for the Supabase browser client.
//
// WHY: the root layout mounts AuthProvider / FormAuthProvider /
// PreferencesProvider / ReferralCapture on EVERY page. Each statically imported
// `@/lib/supabase-client`, which statically imports `@supabase/ssr` — so ~248 kB
// of Supabase was welded into the critical-path bundle of every route, including
// the guest marketing homepage where nobody is signed in yet.
//
// Dynamically importing it here lets webpack move @supabase into an async chunk
// that loads AFTER hydration, off the critical path. Auth still initialises on
// mount, just a tick later — every consumer already gates on `isLoaded`.
//
// CRITICAL: this resolves the SAME singleton owned by supabase-client.js. Never
// construct a second client — multiple GoTrueClients race on the OAuth `?code=`
// and don't share session state.
let p;

export function getSupabase() {
  if (!p) p = import("@/lib/supabase-client").then((m) => m.createClient());
  return p;
}
