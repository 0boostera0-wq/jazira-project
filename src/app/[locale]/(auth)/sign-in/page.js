import { setRequestLocale, getT } from "@/i18n/server";
import Messages from "@/i18n/WithMessages";
import { buildMetadata } from "@/lib/seo";
import AuthShell from "@/components/shell/AuthShell";
import SignInForm from "@/components/auth/SignInForm";
import LegalNote from "@/components/auth/LegalNote";
import AuthTips from "@/components/auth/AuthTips";

export async function generateMetadata(props) {
  const params = await props.params;
  return buildMetadata({ locale: params.locale, key: "signIn", path: "/sign-in" });
}

export default async function SignInPage(props) {
  const params = await props.params;
  setRequestLocale(params.locale);
  const t = await getT("auth");
  return (
    <AuthShell
      title={t("signIn.title")}
      description={t("signIn.description")}
      illustration="brand.island-study"
      asideTitle={t("signIn.aside.title")}
      asidePoints={t.raw("signIn.aside.points")}
    >
      <Messages ns={["auth"]}>
        <SignInForm />
      </Messages>
      <div className="mt-7 text-center">
        <LegalNote />
      </div>
      <AuthTips title={t("signIn.aside.title")} points={t.raw("signIn.aside.points")} illustration="brand.island-study" from="sm" />
    </AuthShell>
  );
}
