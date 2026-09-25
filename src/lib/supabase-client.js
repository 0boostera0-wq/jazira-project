'use client';

import { createBrowserClient } from '@supabase/ssr';
import { SUPABASE_URL, SUPABASE_KEY, isSupabaseConfigured } from '@/lib/supabase-env';

// Singleton browser client.
//
// Why a singleton: every createBrowserClient() spins up its own GoTrueClient
// with its own auth listener and its own attempt to consume the OAuth `?code=`.
// Multiple instances RACE on that single-use code and don't share session state.
// One instance = one auth state every component observes.
//
// Returns null when Supabase env vars are missing (local builds / previews
// without secrets) so pages degrade to their signed-out state instead of
// crashing at prerender time. Callers must handle null.
let client;

export function createClient() {
  if (!isSupabaseConfigured) return null;
  if (client) return client;
  client = createBrowserClient(SUPABASE_URL, SUPABASE_KEY);
  return client;
}
