// ============================================================================
// Autosave queue for the exam runner (framework-free, unit-tested with fake
// timers).
//
//   const q = createAutosave({ save, getPayload, onStatus, onSaved, onClosed });
//   q.queue(position)   // after every answer / flag change (debounced)
//   q.online()          // call on window "online"
//   q.drain()           // leaving / unmount: send EVERY pending answer now, in parallel
//   q.cancel()          // on submit / unmount (stops future scheduling)
//
// • Debounced: rapid changes to the same question become one request, and the
//   payload is read at send time (always the latest answer).
// • Offline tolerant: while offline nothing is sent; status "offline".
// • Retries with exponential backoff (1 s → 30 s) on network / server errors.
// • "attempt_closed" (submitted elsewhere / expired) stops the queue and calls
//   onClosed() so the runner can load the result.
// • Invalid input is dropped (retrying would never succeed).
// • onSaved(position, payload) receives what was actually sent, so the caller
//   can tell whether a newer change is still waiting (offline drafts).
// • drain() is for the moment the runner goes away (Leave, navigation, any
//   unmount): it waits for the save in flight, then sends every remaining
//   dirty position at once — it is not stopped by cancel(), so nothing queued
//   is dropped. Failures stay in pending() (and in the runner's draft).
//
// Status: "idle" | "pending" | "saving" | "saved" | "offline" | "error"
// ============================================================================

const CLOSED = new Set(["attempt_closed", "attempt_not_found"]);

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
  let current = null; // the save in flight (drain waits for it)
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
      if (!dirty.has(position)) continue; // already sent by drain()
      dirty.delete(position);
      const payload = getPayload(position);
      try {
        current = save(position, payload);
        await current;
        onSaved(position, payload);
      } catch (err) {
        current = null;
        const code = err?.code || "unknown";
        if (CLOSED.has(code)) {
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
    current = null;
    failures = 0;
    if (stopped) return;
    if (dirty.size) schedule(delay);
    else setStatus("saved");
  }

  async function drain() {
    clearTimeout(timer);
    timer = null;
    if (current) await Promise.resolve(current).catch(() => {});
    const positions = [...dirty];
    dirty.clear();
    await Promise.all(
      positions.map(async (position) => {
        const payload = getPayload(position);
        try {
          await save(position, payload);
          onSaved(position, payload);
        } catch (err) {
          const code = err?.code || "unknown";
          if (code !== "invalid_argument" && !CLOSED.has(code)) dirty.add(position);
        }
      })
    );
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
    /** Leaving: send every pending answer now (see above). Resolves when all were attempted. */
    drain,
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
