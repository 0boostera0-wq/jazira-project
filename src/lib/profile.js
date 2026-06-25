// Canonical helpers for public profile identity.
//
// IMPORTANT: the public display name is NON-UNIQUE — many users may share the
// same visible name (e.g. "عبدالله"). We therefore use `full_name` as the public
// display field (it has no unique constraint), never `username` (which may be a
// unique internal handle) and never the email.

export function publicName(profile, fallback = "مستخدم") {
  if (!profile) return fallback;
  return (
    profile.full_name ||
    profile.display_name || // tolerated if the column exists, but not required
    fallback
  );
}

export function avatarInitial(name) {
  const n = (name || "").trim();
  return n ? n.charAt(0) : "م";
}

// Public display-name rules (mirrors the DB update_full_name() enforcement):
//  - exactly two words
//  - Arabic OR English letters and spaces only (no digits/symbols/emoji)
// Returns { ok, error } with an Arabic message. Duplicates ARE allowed.
const NAME_RE = /^[A-Za-z؀-ۿ]+\s+[A-Za-z؀-ۿ]+$/;

export function validateFullName(name) {
  const trimmed = (name || "").trim().replace(/\s+/g, " ");
  if (!trimmed) return { ok: false, error: "الاسم المعروض مطلوب" };

  const words = trimmed.split(" ");
  if (words.length === 1) return { ok: false, error: "يجب إدخال اسمين (الاسم الأول والثاني)" };
  if (words.length > 2) return { ok: false, error: "الاسم يجب أن يتكوّن من كلمتين فقط" };
  if (!NAME_RE.test(trimmed)) {
    return { ok: false, error: "يُسمح بالحروف العربية أو الإنجليزية فقط بدون أرقام أو رموز" };
  }
  return { ok: true, value: trimmed };
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
