import { setRequestLocale } from "@/i18n/server";

// Each auth page renders its own <AuthShell> so it can pick its illustration.
export default async function AuthLayout(props) {
  const params = await props.params;

  const {
    children
  } = props;

  setRequestLocale(params.locale);
  return children;
}
