import { setRequestLocale, getT } from "@/i18n/server";
import Messages from "@/i18n/WithMessages";
import { buildMetadata } from "@/lib/seo";
import AuthShell from "@/components/shell/AuthShell";
import AuthTips from "@/components/auth/AuthTips";
import ProfileSetup from "@/components/auth/ProfileSetupForm";

export async function generateMetadata(props) {
  const params = await props.params;
  return buildMetadata({ locale: params.locale, key: "profileSetup", path: "/profile-setup", noindex: true });
}

export default async function ProfileSetupPage(props) {
  const params = await props.params;
  setRequestLocale(params.locale);
  const t = await getT("auth");
  return (
    <AuthShell
      title={t("profileSetup.title")}
      description={t("profileSetup.description")}
      illustration="welcome.profile-setup"
      asideTitle={t("profileSetup.aside.title")}
      asidePoints={t.raw("profileSetup.aside.points")}
    >
      <Messages ns={["auth"]}>
        <ProfileSetup />
      </Messages>
      <AuthTips title={t("profileSetup.aside.title")} points={t.raw("profileSetup.aside.points")} illustration="welcome.profile-setup" />
    </AuthShell>
  );
}
