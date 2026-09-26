import AppShell from "@/components/shell/AppShell";
import ProfileSetupGuard from "@/components/ProfileSetupGuard";
import SessionTracker from "@/components/SessionTracker";
import { setRequestLocale } from "@/i18n/server";

// Authenticated-app frame. The old floating AI widget is intentionally gone —
// the assistant now lives at /assistant (backend unchanged).
export default async function AppLayout(props) {
  const params = await props.params;

  const {
    children
  } = props;

  setRequestLocale(params.locale);
  return (
    <AppShell>
      <ProfileSetupGuard />
      <SessionTracker />
      {children}
    </AppShell>
  );
}
