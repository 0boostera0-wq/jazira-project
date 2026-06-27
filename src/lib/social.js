// Client-side data-access for the social layer. EVERY function degrades
// gracefully: if migration 0008 isn't applied yet (missing table / column),
// it returns a safe default instead of throwing — so the app never breaks.
import { createClient } from "@/lib/supabase-client";

const sb = () => createClient();

// ── hashtag / mention parsing ──────────────────────────────────────────────
// Arabic + Latin word chars. Hashtags normalized lower-case, no '#'.
const TAG_RE = /(?:^|\s)#([0-9A-Za-z_؀-ۿ]{2,50})/g;
const MENTION_RE = /(?:^|\s)@([0-9A-Za-z_]{2,30})/g;

export function parseEntities(text = "") {
  const tags = new Set();
  const handles = new Set();
  let m;
  while ((m = TAG_RE.exec(text))) tags.add(m[1].toLowerCase());
  while ((m = MENTION_RE.exec(text))) handles.add(m[1].toLowerCase());
  return { tags: [...tags], handles: [...handles] };
}

// ── follows ────────────────────────────────────────────────────────────────
export async function isFollowing(followeeId) {
  try {
    const { data: { user } } = await sb().auth.getUser();
    if (!user || user.id === followeeId) return null;
    const { data } = await sb()
      .from("follows")
      .select("notify_pref")
      .eq("follower_id", user.id)
      .eq("followee_id", followeeId)
      .maybeSingle();
    return data ? { following: true, pref: data.notify_pref } : { following: false, pref: null };
  } catch {
    return { following: false, pref: null };
  }
}

export async function followUser(followeeId) {
  try {
    const { data: { user } } = await sb().auth.getUser();
    if (!user) return { ok: false, reason: "auth" };
    const { error } = await sb().from("follows").insert({ follower_id: user.id, followee_id: followeeId });
    return { ok: !error, error };
  } catch (e) {
    return { ok: false, error: e };
  }
}

export async function unfollowUser(followeeId) {
  try {
    const { data: { user } } = await sb().auth.getUser();
    if (!user) return { ok: false };
    const { error } = await sb().from("follows").delete().eq("follower_id", user.id).eq("followee_id", followeeId);
    return { ok: !error };
  } catch {
    return { ok: false };
  }
}

export async function setFollowPref(followeeId, pref) {
  try {
    const { data: { user } } = await sb().auth.getUser();
    if (!user) return { ok: false };
    const { error } = await sb().from("follows").update({ notify_pref: pref })
      .eq("follower_id", user.id).eq("followee_id", followeeId);
    return { ok: !error };
  } catch {
    return { ok: false };
  }
}

// ── profile stats (followers / following / posts / likes received / reposts) ─
async function countOf(table, col, id) {
  try {
    const { count } = await sb().from(table).select("*", { count: "exact", head: true }).eq(col, id);
    return count || 0;
  } catch {
    return 0;
  }
}

export async function getProfileStats(userId) {
  const [followers, following, posts] = await Promise.all([
    countOf("follows", "followee_id", userId),
    countOf("follows", "follower_id", userId),
    countOf("community_posts", "user_id", userId),
  ]);
  let likesReceived = 0;
  let reposts = 0;
  try {
    const { data } = await sb().from("community_posts").select("likes_count, reposts_count").eq("user_id", userId);
    for (const p of data || []) {
      likesReceived += p.likes_count || 0;
      reposts += p.reposts_count || 0;
    }
  } catch {}
  return { followers, following, posts, likesReceived, reposts };
}

// ── social settings ─────────────────────────────────────────────────────────
export const DEFAULT_SOCIAL_SETTINGS = {
  allow_message_requests: true,
  hide_message_requests: false,
  allow_messages: true,
  notif_sound: true,
  show_likes_on_profile: true,
  show_reposts_on_profile: true,
  notify_followers: true,
  notify_mentions: true,
};

export async function getSocialSettings(userId) {
  try {
    const { data } = await sb().from("user_social_settings").select("*").eq("user_id", userId).maybeSingle();
    return { ...DEFAULT_SOCIAL_SETTINGS, ...(data || {}) };
  } catch {
    return { ...DEFAULT_SOCIAL_SETTINGS };
  }
}

export async function updateSocialSettings(patch) {
  try {
    const { data: { user } } = await sb().auth.getUser();
    if (!user) return { ok: false };
    const { error } = await sb().from("user_social_settings")
      .upsert({ user_id: user.id, ...patch, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    return { ok: !error, error };
  } catch (e) {
    return { ok: false, error: e };
  }
}

// ── notifications ────────────────────────────────────────────────────────────
export async function listNotifications({ type } = {}) {
  try {
    const { data: { user } } = await sb().auth.getUser();
    if (!user) return [];
    let q = sb().from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(60);
    if (type && type !== "all") q = q.eq("type", type);
    const { data } = await q;
    return data || [];
  } catch {
    return [];
  }
}

export async function unreadNotificationCount() {
  try {
    const { data: { user } } = await sb().auth.getUser();
    if (!user) return 0;
    const { count } = await sb().from("notifications")
      .select("*", { count: "exact", head: true }).eq("user_id", user.id).eq("read", false);
    return count || 0;
  } catch {
    return 0;
  }
}

export async function markNotificationsRead(ids) {
  try {
    const { data: { user } } = await sb().auth.getUser();
    if (!user) return { ok: false };
    let q = sb().from("notifications").update({ read: true }).eq("user_id", user.id).eq("read", false);
    if (Array.isArray(ids) && ids.length) q = q.in("id", ids);
    const { error } = await q;
    return { ok: !error };
  } catch {
    return { ok: false };
  }
}

// ── unread DM count (best-effort) ────────────────────────────────────────────
export async function unreadMessageCount() {
  try {
    const { data: { user } } = await sb().auth.getUser();
    if (!user) return 0;
    // conversations I'm in, with messages newer than my last_read_at
    const { data: parts } = await sb().from("conversation_participants")
      .select("conversation_id, last_read_at").eq("user_id", user.id);
    if (!parts?.length) return 0;
    let total = 0;
    for (const p of parts) {
      const { count } = await sb().from("messages")
        .select("*", { count: "exact", head: true })
        .eq("conversation_id", p.conversation_id)
        .neq("sender_id", user.id)
        .gt("created_at", p.last_read_at || "1970-01-01");
      total += count || 0;
    }
    return total;
  } catch {
    return 0;
  }
}
