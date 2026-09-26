"use client";

// ============================================================================
// Settings — client data functions. Every function throws a SettingsError
// (err.code = a settings.errors.* key) on failure and never writes a column
// outside its one legitimate writer (docs/SECURITY.md §4):
//   full_name → update_full_name · avatar_url → set_avatar · phone → update_phone
//   bio → update_bio · show_elite_badge / anonymous_community → direct UPDATE
//   social switches → user_social_settings (lib/social.js)
//   notification switches → notification_preferences (lib/data/notifications.js)
// No direct-UPDATE fallbacks when an RPC is missing — an honest error instead.
// Supabase not configured → "unavailable".
// ============================================================================

import { getSupabase } from "@/lib/supabase-lazy";
import { normalizePhone } from "@/components/auth/authUtils";
import {
  AVATAR_EXT, AVATAR_MAX_BYTES, AVATAR_TYPES, PROFILE_FLAG_COLUMNS,
  deleteErrorCode, effectiveNotificationPrefs, settingsError, signInMethods, toSettingsError,
} from "./model";

const SESSION_COLUMNS = "session_id, device_label, browser, os, device_type, last_active_at, created_at";
const SID_KEY = "jazira_session_id_v1"; // SessionTracker's device id

async function client() {
  let supabase = null;
  try {
    supabase = await getSupabase();
  } catch {
    supabase = null;
  }
  if (!supabase) throw settingsError("unavailable");
  return supabase;
}

async function rpc(name, args) {
  const supabase = await client();
  let res;
  try {
    res = await supabase.rpc(name, args);
  } catch (err) {
    throw toSettingsError(err);
  }
  if (res.error) throw toSettingsError(res.error);
  return res.data;
}

/** This browser's session id (SessionTracker), or null. */
export function currentSessionId() {
  try {
    return localStorage.getItem(SID_KEY);
  } catch {
    return null;
  }
}

// ── profile ────────────────────────────────────────────────────────────────
/** Private columns via get_my_private_profile(): { phone (national 9 digits), *ChangedAt }. */
export async function getPrivateProfile() {
  const supabase = await client();
  const { data, error } = await supabase.rpc("get_my_private_profile").maybeSingle();
  if (error) throw toSettingsError(error);
  return {
    phone: data?.phone ? normalizePhone(data.phone) : "",
    nameChangedAt: data?.full_name_changed_at || null,
    avatarChangedAt: data?.avatar_changed_at || null,
    phoneChangedAt: data?.phone_changed_at || null,
  };
}

export async function updateFullName(name) {
  await rpc("update_full_name", { new_name: name });
  return new Date().toISOString();
}

export async function updateBio(bio) {
  const saved = await rpc("update_bio", { new_bio: bio });
  return typeof saved === "string" ? saved : "";
}

/** `digits` = national 9 digits, or "" to remove the number. */
export async function updatePhone(digits) {
  await rpc("update_phone", { new_phone: digits || "" });
  return new Date().toISOString();
}

async function listOwnAvatars(supabase, userId) {
  try {
    const { data } = await supabase.storage.from("avatars").list(userId);
    return (data || []).map((f) => `${userId}/${f.name}`);
  } catch {
    return [];
  }
}

/** Validate → upload to avatars/<uid>/… → set_avatar(publicUrl) → clean older files. */
export async function uploadAvatar(userId, file) {
  if (!file) throw settingsError("generic");
  if (!AVATAR_TYPES.includes(file.type)) throw settingsError("avatarType");
  if (file.size > AVATAR_MAX_BYTES) throw settingsError("avatarSize");
  const supabase = await client();
  const path = `${userId}/avatar-${Date.now()}.${AVATAR_EXT[file.type] || "jpg"}`;
  const up = await supabase.storage.from("avatars").upload(path, file, { contentType: file.type, upsert: false });
  if (up.error) {
    const code = toSettingsError(up.error).code;
    throw settingsError(code === "network" ? "network" : "avatarStorage", up.error);
  }
  const url = `${supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl}?t=${Date.now()}`;
  const { error } = await supabase.rpc("set_avatar", { new_url: url });
  if (error) {
    try { await supabase.storage.from("avatars").remove([path]); } catch { /* best effort */ }
    throw toSettingsError(error);
  }
  const stale = (await listOwnAvatars(supabase, userId)).filter((p) => p !== path);
  if (stale.length) {
    try { await supabase.storage.from("avatars").remove(stale); } catch { /* best effort */ }
  }
  return { url, changedAt: new Date().toISOString() };
}

/** set_avatar(null) clears the photo (the cooldown clock is left as is), then files are removed. */
export async function removeAvatar(userId) {
  const supabase = await client();
  const { error } = await supabase.rpc("set_avatar", { new_url: null });
  if (error) throw toSettingsError(error);
  const files = await listOwnAvatars(supabase, userId);
  if (files.length) {
    try { await supabase.storage.from("avatars").remove(files); } catch { /* best effort */ }
  }
}

/** show_elite_badge / anonymous_community — the only client-writable profile columns. */
export async function setProfileFlag(userId, column, value) {
  if (!PROFILE_FLAG_COLUMNS.includes(column) || typeof value !== "boolean") throw settingsError("generic");
  const supabase = await client();
  const { error } = await supabase.from("profiles").update({ [column]: value }).eq("id", userId);
  if (error) throw toSettingsError(error);
  return value;
}

// ── account & security ─────────────────────────────────────────────────────
export async function getSignInMethods() {
  const supabase = await client();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw toSettingsError(error);
  return signInMethods(data?.user);
}

/** Resolves on success; rejects with the raw auth error (mapped by the form with authErrorKey). */
export async function changePassword(password) {
  const supabase = await client();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

export async function listSessions(userId) {
  const supabase = await client();
  const q = (cols) =>
    supabase.from("user_sessions").select(cols).eq("user_id", userId).is("revoked_at", null)
      .order("last_active_at", { ascending: false }).limit(50);
  let res = await q(`${SESSION_COLUMNS}, location`);
  if (res.error) res = await q(SESSION_COLUMNS); // 0007 (location) not applied yet
  if (res.error) throw toSettingsError(res.error);
  return res.data || [];
}

/** App-level remote sign-out: the other device notices revoked_at and signs itself out. */
export async function revokeSession(userId, sessionId) {
  const supabase = await client();
  const { error } = await supabase.from("user_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", userId).eq("session_id", sessionId);
  if (error) throw toSettingsError(error);
}

/** Revoke every recorded device, then end all refresh tokens (this one included). */
export async function signOutEverywhere(userId) {
  const supabase = await client();
  try {
    await supabase.from("user_sessions").update({ revoked_at: new Date().toISOString() })
      .eq("user_id", userId).is("revoked_at", null);
  } catch { /* the global sign-out below still applies */ }
  try { localStorage.removeItem(SID_KEY); } catch { /* storage blocked */ }
  const { error } = await supabase.auth.signOut({ scope: "global" });
  if (error) throw toSettingsError(error);
}

// ── subscription ───────────────────────────────────────────────────────────
/** Own subscriptions row (RLS: own), or null. */
export async function getSubscription(userId) {
  const supabase = await client();
  const { data, error } = await supabase.from("subscriptions")
    .select("tier, status, current_period_end").eq("user_id", userId).maybeSingle();
  if (error) throw toSettingsError(error);
  return data || null;
}

// ── social + notification switches ─────────────────────────────────────────
// Own user_social_settings row (RLS: own). Read here rather than through
// lib/social getSocialSettings(), which answers the defaults on any error —
// the settings page must never present defaults as the member's real choices.
const SOCIAL_DEFAULTS = Object.freeze({
  allow_messages: true,
  allow_message_requests: true,
  hide_message_requests: false,
  show_likes_on_profile: true,
  show_reposts_on_profile: true,
  notify_mentions: true,
});

export async function getSocial(userId) {
  const supabase = await client();
  const { data, error } = await supabase
    .from("user_social_settings")
    .select(Object.keys(SOCIAL_DEFAULTS).join(", "))
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw toSettingsError(error);
  return { ...SOCIAL_DEFAULTS, ...(data || {}) }; // no row yet = the table defaults
}

export async function updateSocial(patch) {
  await client();
  const { updateSocialSettings } = await import("@/lib/social");
  const res = await updateSocialSettings(patch);
  if (!res?.ok) throw toSettingsError(res?.error || null);
}

// DataError (src/lib/data/*) → SettingsError.
const DATA_CODES = { network: "network", forbidden: "forbidden", not_authenticated: "sessionExpired", unavailable: "unavailable", invalid_argument: "generic" };
const fromDataError = (err) =>
  err?.name === "DataError" ? settingsError(DATA_CODES[err.code] || "generic", err) : toSettingsError(err);

export async function getNotificationPrefs(userId) {
  await client();
  const [{ getNotificationPreferences }, social] = await Promise.all([
    import("@/lib/data/notifications"),
    getSocial(userId).catch(() => null),
  ]);
  let prefs;
  try {
    prefs = await getNotificationPreferences();
  } catch (err) {
    throw fromDataError(err);
  }
  return effectiveNotificationPrefs(prefs, social);
}

/** One switch; "mentions" also keeps user_social_settings.notify_mentions in step. */
export async function updateNotificationPref(key, value) {
  await client();
  const { updateNotificationPreferences } = await import("@/lib/data/notifications");
  try {
    await updateNotificationPreferences({ [key]: value });
  } catch (err) {
    throw fromDataError(err);
  }
  if (key === "mentions") await updateSocial({ notify_mentions: value });
}

// ── danger zone ────────────────────────────────────────────────────────────
/** POST /api/account/delete → resolves on success; SettingsError(code = danger.errors.*) otherwise. */
export async function deleteAccount() {
  let res;
  try {
    res = await fetch("/api/account/delete", { method: "POST", headers: { Accept: "application/json" } });
  } catch (err) {
    throw settingsError("network", err);
  }
  if (res.ok) return;
  const body = await res.json().catch(() => null);
  throw settingsError(deleteErrorCode(res.status, body));
}

export async function signOutLocal() {
  try {
    const supabase = await getSupabase();
    await supabase?.auth.signOut({ scope: "local" });
  } catch { /* already signed out */ }
  try { localStorage.removeItem(SID_KEY); } catch { /* storage blocked */ }
}
