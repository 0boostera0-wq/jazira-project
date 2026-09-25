import AppShell from "@/components/shell/AppShell";
import ProfileSetupGuard from "@/components/ProfileSetupGuard";
import SessionTracker from "@/components/SessionTracker";
import { setRequestLocale } from "@/i18n/server";

// Authenticated-app frame. The old floating AI widget is intentionally gone —
// the assistant now lives at /assistant (backend unchanged).
export default function AppLayout({ children, params }) {
  setRequestLocale(params.locale);
  return (
    <AppShell>
      <ProfileSetupGuard />
      <SessionTracker />
      {children}
    </AppShell>
  );
}
