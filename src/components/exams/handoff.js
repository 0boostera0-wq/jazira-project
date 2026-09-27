// ============================================================================
// Client-side hand-off between the builder and the runner, plus offline
// answer drafts. Browser-only helpers; every storage access is guarded
// (private mode / blocked storage must never break the exam).
//
// • stashAttempt(payload) — the builder keeps the startExam() payload in
//   memory so /exams/attempt/<id> renders instantly after a client-side
//   navigation (no second round trip before the exam shell appears).
// • Local practice attempts live in sessionStorage (per tab, see
//   src/lib/data/exams.js); /exams/attempt/local resolves to the tab's most
//   recent one through a pointer.
// • Guest template sessions ("g-…", src/lib/data/exam-sessions.js) open on
//   the same public route (/exams/attempt/<uuid> requires an account). Their
//   answers are kept in this browser until the deadline, so the pointer is
//   also remembered in localStorage: a new tab resumes the latest one.
// • handOff(payload) = stash + pointer + the href to push, for any start
//   payload (the builder, retakes, the learn pages' entry points).
// • Drafts: answers not yet confirmed by the server are mirrored to
//   localStorage and re-sent on resume (offline tolerance).
// ============================================================================

const memory = new Map();
const LOCAL_POINTER = "jz:exam-local-current";
const GUEST_POINTER = "jz:exam-guest-current";
const GUEST_ID = /^g-[A-Za-z0-9_-]{22}$/;
const DRAFT_PREFIX = "jz:exam-draft:";

export function stashAttempt(payload) {
  if (payload?.attempt_id) memory.set(payload.attempt_id, payload);
}

/** The stashed start payload for an attempt (read once). */
export function takeAttempt(id) {
  const p = memory.get(id) || null;
  memory.delete(id);
  return p;
}

export function setLocalPointer(id) {
  try {
    sessionStorage.setItem(LOCAL_POINTER, id);
  } catch {
    /* storage unavailable — the in-memory stash still works for this page */
  }
  if (GUEST_ID.test(String(id))) {
    try {
      localStorage.setItem(GUEST_POINTER, id);
    } catch {
      /* ignore */
    }
  }
}

/** This tab's latest local / guest attempt; else this browser's latest guest session. */
export function getLocalPointer() {
  let id = null;
  try {
    id = sessionStorage.getItem(LOCAL_POINTER);
  } catch {
    id = null;
  }
  if (id) return id;
  try {
    const g = localStorage.getItem(GUEST_POINTER);
    return g && GUEST_ID.test(g) ? g : null;
  } catch {
    return null;
  }
}

export function readDraft(id) {
  try {
    const raw = localStorage.getItem(DRAFT_PREFIX + id);
    const v = raw ? JSON.parse(raw) : null;
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}

export function writeDraft(id, draft) {
  try {
    if (!draft || !Object.keys(draft).length) localStorage.removeItem(DRAFT_PREFIX + id);
    else localStorage.setItem(DRAFT_PREFIX + id, JSON.stringify(draft));
  } catch {
    /* ignore */
  }
}

export const clearDraft = (id) => writeDraft(id, null);

/** Shared URL for an attempt (local and guest attempts use the pointer route). */
export const attemptHref = (payload) => `/exams/attempt/${payload?.mode === "local" || payload?.mode === "guest" ? "local" : payload?.attempt_id}`;

/**
 * Hand a fresh start payload to the runner route: stash it for an instant
 * render, point the pointer route at local / guest attempts, and return the
 * href to navigate to.
 */
export function handOff(payload) {
  stashAttempt(payload);
  if (payload?.mode === "local" || payload?.mode === "guest") setLocalPointer(payload.attempt_id);
  return attemptHref(payload);
}
