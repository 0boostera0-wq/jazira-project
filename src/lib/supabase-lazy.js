"use client";

// Async accessor for the Supabase browser client.
//
// WHY: providers mounted on EVERY page need Supabase. A static import would
// weld ~250 kB of @supabase into the critical-path bundle of every route,
// including the guest homepage. Dynamically importing moves it into an async
// chunk that loads after hydration. Consumers gate on `isLoaded`.
//
// Resolves the SAME singleton as supabase-client.js (never a second client),
// or null when Supabase env vars are missing.
let p;

export function getSupabase() {
  if (!p) p = import("@/lib/supabase-client").then((m) => m.createClient());
  return p;
}
