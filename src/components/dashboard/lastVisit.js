// ============================================================================
// "Continue where you left off" in the curriculum — a per-device memory.
//
// The dashboard READS the last curriculum page a member opened from
// localStorage. Curriculum pages WRITE it by rendering
// <RecordCurriculumVisit path title context /> (./RecordCurriculumVisit.jsx)
// or by calling rememberCurriculumVisit() — nothing is sent to the server.
//
// Stored value (JSON, versioned):
//   { v: 1, path: "/curriculum/high-school/…", title: "…", context: "…", lang: "ar" | "en", at: ISO }
// `lang` is the UI language the title/context were written in (they come from
// the bilingual catalog), so the dashboard can mark them when shown in the
// other language.
// Anything that doesn't validate is ignored, so a stale or tampered value can
// never produce a link outside /curriculum.
// ============================================================================

export const LAST_VISIT_KEY = "jz:last-curriculum";

// Unprefixed curriculum path, 1–6 slug segments (the catalog's ids are ASCII slugs).
const PATH_RE = /^\/curriculum(?:\/[a-z0-9][a-z0-9-]{0,63}){1,6}$/;
const clean = (v, max) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

const LANGS = new Set(["ar", "en"]);

/** Validate a stored value (string or object) → { path, title, context, lang, at } | null. */
export function parseLastVisit(raw) {
  let v = raw;
  if (typeof raw === "string") {
    try {
      v = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const path = typeof v.path === "string" ? v.path : "";
  if (!PATH_RE.test(path)) return null;
  const at = typeof v.at === "string" && Number.isFinite(Date.parse(v.at)) ? v.at : null;
  const lang = LANGS.has(v.lang) ? v.lang : null;
  return { path, title: clean(v.title, 120) || null, context: clean(v.context, 160) || null, lang, at };
}

/** Build the stored JSON for a visit, or null when the path isn't a curriculum page. */
export function serializeLastVisit({ path, title, context, lang } = {}, now = new Date()) {
  const parsed = parseLastVisit({ path, title, context, lang, at: now.toISOString() });
  return parsed ? JSON.stringify({ v: 1, ...parsed }) : null;
}

/** Read the member's last curriculum visit on this device (null when none / storage blocked). */
export function readLastVisit() {
  try {
    return parseLastVisit(window.localStorage.getItem(LAST_VISIT_KEY));
  } catch {
    return null;
  }
}

/** Remember a curriculum page (call from curriculum pages only). Never throws. */
export function rememberCurriculumVisit(visit) {
  try {
    const value = serializeLastVisit(visit);
    if (value) window.localStorage.setItem(LAST_VISIT_KEY, value);
  } catch {
    /* private mode / storage blocked — the dashboard simply shows "browse" */
  }
}
