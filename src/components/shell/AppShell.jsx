import AppSidebar from "./AppSidebar";
import AppTopbar from "./AppTopbar";
import BottomNav from "./BottomNav";
import SkipLink from "./SkipLink";

/**
 * Authenticated-app frame. Server component: the chrome paints immediately
 * with the page's loading.js skeleton; each client island hydrates on its own.
 *
 *   ┌ sidebar (lg+) ┬ topbar (sticky) ─────────────┐
 *   │               │ main (max 1280, gutters)    │
 *   └───────────────┴─────────────────────────────┘   + bottom tab bar (< lg)
 */
export default function AppShell({ children }) {
  return (
    <div className="min-h-dvh">
      <SkipLink />
      <AppSidebar />
      <div className="lg:ps-sidebar">
        <AppTopbar />
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1320px] px-[var(--gutter)] pb-[calc(var(--bottomnav-h)+env(safe-area-inset-bottom)+2rem)] pt-6 outline-none sm:pt-8 lg:pb-16">
          {children}
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
