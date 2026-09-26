// ============================================================================
// Leave guard for code-driven navigation. A running exam must not be left
// without asking (unsent answers, the timer keeps running). Links and the
// browser Back button are handled inside the runner itself; navigation done in
// code — the language switch (router.replace), the command palette
// (router.push) — has to ask first:
//
//   if (confirmNavigation(() => router.push(href))) router.push(href);
//
// Returns true when nothing objects (navigate now). Returns false when a guard
// (the exam runner) took over: it shows its "leave the exam?" dialog and calls
// `proceed()` itself if the member confirms.
// ============================================================================

export const BEFORE_NAVIGATE_EVENT = "jazira:before-navigate";

/** Marker on <html> while an exam runner is mounted (the shell hides its tab bar). */
export const RUNNER_FLAG = "examRunner"; // → data-exam-runner

export function confirmNavigation(proceed) {
  if (typeof window === "undefined") return true;
  return window.dispatchEvent(new CustomEvent(BEFORE_NAVIGATE_EVENT, { cancelable: true, detail: { proceed } }));
}
