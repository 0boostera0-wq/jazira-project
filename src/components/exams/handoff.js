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
// • Drafts: answers not yet confirmed by the server are mirrored to
//   localStorage and re-sent on resume (offline tolerance).
// ============================================================================

const memory = new Map();
const LOCAL_POINTER = "jz:exam-local-current";
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
}

export function getLocalPointer() {
  try {
    return sessionStorage.getItem(LOCAL_POINTER);
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

/** Shared URL for an attempt (local attempts use the per-tab pointer route). */
export const attemptHref = (payload) => `/exams/attempt/${payload?.mode === "local" ? "local" : payload?.attempt_id}`;
