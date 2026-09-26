import { setRequestLocale, getT } from "@/i18n/server";
import Messages from "@/i18n/WithMessages";
import { buildMetadata } from "@/lib/seo";
import AuthShell from "@/components/shell/AuthShell";
import AuthTips from "@/components/auth/AuthTips";
import VerifyEmailForm from "@/components/auth/VerifyEmailForm";

export async function generateMetadata(props) {
  const params = await props.params;
  return buildMetadata({ locale: params.locale, key: "verifyEmail", path: "/auth/verify-email", noindex: true });
}

export default async function VerifyEmailPage(props) {
  const params = await props.params;
  setRequestLocale(params.locale);
  const t = await getT("auth");
  return (
    <AuthShell
      title={t("verify.title")}
      description={t("verify.description")}
      illustration="support.contact"
      asideTitle={t("verify.aside.title")}
      asidePoints={t.raw("verify.aside.points")}
    >
      <Messages ns={["auth"]}>
        <VerifyEmailForm />
      </Messages>
      <AuthTips title={t("verify.aside.title")} points={t.raw("verify.aside.points")} illustration="support.contact" from="sm" />
    </AuthShell>
  );
}
