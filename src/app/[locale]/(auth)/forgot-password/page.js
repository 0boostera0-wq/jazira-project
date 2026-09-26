import { setRequestLocale, getT } from "@/i18n/server";
import Messages from "@/i18n/WithMessages";
import { buildMetadata } from "@/lib/seo";
import AuthShell from "@/components/shell/AuthShell";
import AuthTips from "@/components/auth/AuthTips";
import ForgotPasswordForm from "@/components/auth/ForgotPasswordForm";

export async function generateMetadata({ params }) {
  return buildMetadata({ locale: params.locale, key: "forgotPassword", path: "/forgot-password" });
}

export default async function ForgotPasswordPage({ params }) {
  setRequestLocale(params.locale);
  const t = await getT("auth");
  return (
    <AuthShell
      title={t("forgot.title")}
      description={t("forgot.description")}
      illustration="landing.privacy"
      asideTitle={t("forgot.aside.title")}
      asidePoints={t.raw("forgot.aside.points")}
    >
      <Messages ns={["auth"]}>
        <ForgotPasswordForm />
      </Messages>
      <AuthTips title={t("forgot.aside.title")} points={t.raw("forgot.aside.points")} illustration="landing.privacy" />
    </AuthShell>
  );
}
