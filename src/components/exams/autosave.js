// ============================================================================
// Autosave queue for the exam runner (framework-free, unit-tested with fake
// timers).
//
//   const q = createAutosave({ save, getPayload, onStatus, onSaved, onClosed });
//   q.queue(position)   // after every answer / flag change (debounced)
//   q.online()          // call on window "online"
//   q.cancel()          // on submit / unmount
//
// • Debounced: rapid changes to the same question become one request, and the
//   payload is read at send time (always the latest answer).
// • Offline tolerant: while offline nothing is sent; status "offline".
// • Retries with exponential backoff (1 s → 30 s) on network / server errors.
// • "attempt_closed" (submitted elsewhere / expired) stops the queue and calls
//   onClosed() so the runner can load the result.
// • Invalid input is dropped (retrying would never succeed).
//
// Status: "idle" | "pending" | "saving" | "saved" | "offline" | "error"
// ============================================================================

const RETRYABLE = new Set(["network", "unavailable", "unknown", "rate_limited", "forbidden"]);

export function createAutosave({
  save,
  getPayload,
  delay = 700,
  maxBackoff = 30000,
  onStatus = () => {},
  onSaved = () => {},
  onClosed = () => {},
  isOnline = () => (typeof navigator === "undefined" ? true : navigator.onLine !== false),
} = {}) {
  const dirty = new Set();
  let timer = null;
  let inFlight = false;
  let failures = 0;
  let stopped = false;
  let status = "idle";

  const setStatus = (s) => {
    if (s !== status) {
      status = s;
      onStatus(s);
    }
  };
  const schedule = (ms) => {
    if (stopped) return;
    clearTimeout(timer);
    timer = setTimeout(flush, ms);
  };
  const backoff = () => Math.min(maxBackoff, 1000 * 2 ** Math.max(0, failures - 1));

  async function flush() {
    timer = null;
    if (stopped || inFlight) return;
    if (!dirty.size) {
      setStatus(status === "idle" ? "idle" : "saved");
      return;
    }
    if (!isOnline()) {
      setStatus("offline");
      return; // resumed by online()
    }
    inFlight = true;
    setStatus("saving");
    for (const position of [...dirty]) {
      if (stopped) break;
      dirty.delete(position);
      try {
        await save(position, getPayload(position));
        onSaved(position);
      } catch (err) {
        const code = err?.code || "unknown";
        if (code === "attempt_closed" || code === "attempt_not_found") {
          stopped = true;
          inFlight = false;
          clearTimeout(timer);
          onClosed(code);
          return;
        }
        if (code === "invalid_argument") continue; // never retried
        dirty.add(position);
        failures += 1;
        inFlight = false;
        setStatus(code === "network" || !isOnline() ? "offline" : "error");
        schedule(backoff());
        return;
      }
    }
    inFlight = false;
    failures = 0;
    if (stopped) return;
    if (dirty.size) schedule(delay);
    else setStatus("saved");
  }

  return {
    queue(position) {
      if (stopped) return;
      dirty.add(position);
      if (status !== "offline" && status !== "error") setStatus("pending");
      if (!inFlight) schedule(delay);
    },
    /** Send now (e.g. when the tab is hidden). */
    flush() {
      if (stopped) return Promise.resolve();
      clearTimeout(timer);
      return flush();
    },
    online() {
      if (stopped) return;
      failures = 0;
      clearTimeout(timer);
      flush();
    },
    cancel() {
      stopped = true;
      clearTimeout(timer);
    },
    pending: () => [...dirty],
    status: () => status,
  };
}
