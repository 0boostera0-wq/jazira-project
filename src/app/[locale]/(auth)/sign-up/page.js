import { setRequestLocale, getT } from "@/i18n/server";
import Messages from "@/i18n/WithMessages";
import { buildMetadata } from "@/lib/seo";
import AuthShell from "@/components/shell/AuthShell";
import SignUpForm from "@/components/auth/SignUpForm";
import LegalNote from "@/components/auth/LegalNote";
import AuthTips from "@/components/auth/AuthTips";

export async function generateMetadata(props) {
  const params = await props.params;
  return buildMetadata({ locale: params.locale, key: "signUp", path: "/sign-up" });
}

export default async function SignUpPage(props) {
  const params = await props.params;
  setRequestLocale(params.locale);
  const t = await getT("auth");
  return (
    <AuthShell
      title={t("signUp.title")}
      description={t("signUp.description")}
      illustration="brand.island-education"
      asideTitle={t("signUp.aside.title")}
      asidePoints={t.raw("signUp.aside.points")}
    >
      <Messages ns={["auth"]}>
        <SignUpForm legal={<LegalNote messageKey="signUp.legal" />} />
      </Messages>
      <AuthTips title={t("signUp.aside.title")} points={t.raw("signUp.aside.points")} illustration="brand.island-education" from="sm" />
    </AuthShell>
  );
}
