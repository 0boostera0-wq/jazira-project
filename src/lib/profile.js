// Canonical helpers for public profile identity.
//
// IMPORTANT: the public display name is NON-UNIQUE — many users may share the
// same visible name. We therefore use `full_name` as the public display field
// (it has no unique constraint), never `username` (a unique internal handle)
// and never the email. Name rules are enforced by the database
// (is_valid_public_name / update_full_name) and mirrored for UX in
// src/components/auth/authUtils.js.

/**
 * First letter of a name for a letter avatar, or null when there is no name
 * (the avatar then shows no letter — never a placeholder letter in one
 * language inside the other language's UI).
 */
export function avatarInitial(name) {
  const n = (name || "").trim();
  return n ? n.charAt(0) : null;
}

// A unique, never-displayed internal handle. Satisfies a NOT NULL / UNIQUE
// `username` column without affecting the public (duplicate-allowed) name.
export function genHandle(name) {
  const base = (name || "user")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_؀-ۿ]/g, "")
    .slice(0, 16) || "user";
  const rand = Math.random().toString(36).slice(2, 8);
  return `${base}_${rand}`;
}

// ── Column sets ────────────────────────────────────────────────────────────
// `profiles` is readable by everyone for PUBLIC columns only; private columns
// (phone, *_changed_at…) are not granted to clients, so `select("*")` on
// profiles is forbidden — always use one of these explicit lists.
export const PUBLIC_PROFILE_COLUMNS =
  "id, username, full_name, avatar_url, bio, is_elite, show_elite_badge, xp, created_at";
export const OWN_PROFILE_COLUMNS =
  "id, username, full_name, avatar_url, bio, role, is_elite, show_elite_badge, anonymous_community, xp, created_at";
export const BASIC_PROFILE_COLUMNS = "id, username, full_name, avatar_url, is_elite";
