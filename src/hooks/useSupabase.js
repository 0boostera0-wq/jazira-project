"use client";

// Stub — CommunityFeed now queries Supabase directly.
// Kept so any legacy import doesn't crash the build.
export function usePosts() {
  return { posts: [], loading: false, refetch: () => {} };
}
