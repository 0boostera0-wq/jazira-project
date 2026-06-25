'use client';

import { createBrowserClient } from '@supabase/ssr';

// Singleton browser client.
//
// Why a singleton: every call to createBrowserClient() spins up a fresh
// GoTrueClient with its own auth listener and its own attempt to consume the
// OAuth `?code=` from the URL. Multiple instances RACE on that single-use code
// (only one exchange can succeed) and don't share session state — which is why
// the account nav used to stay on "Sign in" until a manual refresh. Sharing one
// instance means one auth state that every component & provider observes live.
let client;

export function createClient() {
  if (client) return client;
  client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
  return client;
}
