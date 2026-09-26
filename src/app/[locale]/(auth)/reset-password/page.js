import { setRequestLocale, getT } from "@/i18n/server";
import Messages from "@/i18n/WithMessages";
import { buildMetadata } from "@/lib/seo";
import AuthShell from "@/components/shell/AuthShell";
import AuthTips from "@/components/auth/AuthTips";
import ResetPasswordForm from "@/components/auth/ResetPasswordForm";

export async function generateMetadata({ params }) {
  return buildMetadata({ locale: params.locale, key: "resetPassword", path: "/reset-password", noindex: true });
}

export default async function ResetPasswordPage({ params }) {
  setRequestLocale(params.locale);
  const t = await getT("auth");
  return (
    <AuthShell
      title={t("reset.title")}
      illustration="landing.privacy"
      asideTitle={t("reset.aside.title")}
      asidePoints={t.raw("reset.aside.points")}
    >
      <Messages ns={["auth"]}>
        <ResetPasswordForm />
      </Messages>
      <AuthTips title={t("reset.aside.title")} points={t.raw("reset.aside.points")} illustration="landing.privacy" />
    </AuthShell>
  );
}
