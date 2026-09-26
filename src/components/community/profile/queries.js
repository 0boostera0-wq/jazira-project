// Server-only reads for public profile pages (/u/[username], metadata).
//
// Uses the publishable key WITHOUT the visitor's cookies: everything read here
// is public (column-granted profile fields, counts, the anon-callable
// get_public_social_settings RPC), so the page stays cacheable and never
// depends on who is looking. Viewer-specific bits (is this me? do I follow
// them?) are client islands. Responses are revalidated every 30 s.
//
// Do not import this from client components.
import { cache } from "react";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_KEY, isSupabaseConfigured } from "@/lib/supabase-env";
import { BASIC_PROFILE_COLUMNS, PUBLIC_PROFILE_COLUMNS } from "@/lib/profile";
import { normalizeUsername } from "../model";

const COLUMNS = `${PUBLIC_PROFILE_COLUMNS}, anonymous_community`;
const FALLBACK_COLUMNS = `${BASIC_PROFILE_COLUMNS}, anonymous_community`;
let client;

function publicClient() {
  if (!isSupabaseConfigured) return null;
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: (url, init) => fetch(url, { ...init, next: { revalidate: 30 } }) },
    });
  }
  return client;
}

/**
 * → { status: "ok", profile } | { status: "not_found" } | { status: "unavailable" }
 * Deduplicated per request (metadata + page share one query).
 */
export const getPublicProfile = cache(async (username) => {
  const handle = normalizeUsername(username);
  if (!handle) return { status: "not_found" };
  const sb = publicClient();
  if (!sb) return { status: "unavailable" };
  try {
    // The fallback still reads anonymous_community: a profile is never shown
    // without knowing whether its owner posts anonymously.
    let res = await sb.from("profiles").select(COLUMNS).eq("username", handle).maybeSingle();
    if (res.error) res = await sb.from("profiles").select(FALLBACK_COLUMNS).eq("username", handle).maybeSingle();
    if (res.error) return { status: "unavailable" };
    if (!res.data) return { status: "not_found" };
    return { status: "ok", profile: res.data };
  } catch {
    return { status: "unavailable" };
  }
});

/** Exact public counts; a field is null when it couldn't be read. */
export async function getProfileCounts(userId) {
  const sb = publicClient();
  if (!sb) return { posts: null, followers: null, following: null };
  const count = (table, col) =>
    sb.from(table).select("id", { count: "exact", head: true }).eq(col, userId)
      .then(({ count: n, error }) => (error ? null : n ?? 0), () => null);
  const [posts, followers, following] = await Promise.all([
    count("community_posts", "user_id"),
    count("follows", "followee_id"),
    count("follows", "follower_id"),
  ]);
  return { posts, followers, following };
}

/** What the owner lets others see (get_public_social_settings, 0009). Defaults when unavailable. */
export async function getPublicSettings(userId) {
  const fallback = { show_likes_on_profile: true, show_reposts_on_profile: true, allow_messages: true };
  const sb = publicClient();
  if (!sb) return fallback;
  try {
    const { data, error } = await sb.rpc("get_public_social_settings", { p_user: userId }).maybeSingle();
    if (error || !data) return fallback;
    return { ...fallback, ...data };
  } catch {
    return fallback;
  }
}
