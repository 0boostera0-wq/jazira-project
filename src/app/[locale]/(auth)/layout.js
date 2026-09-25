import { setRequestLocale } from "@/i18n/server";

// Each auth page renders its own <AuthShell> so it can pick its illustration.
export default function AuthLayout({ children, params }) {
  setRequestLocale(params.locale);
  return children;
}
