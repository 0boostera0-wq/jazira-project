import { setRequestLocale } from "@/i18n/server";
import { buildMetadata } from "@/lib/seo";
import DashboardView from "@/components/dashboard/DashboardView";

export async function generateMetadata(props) {
  const params = await props.params;
  return buildMetadata({ locale: params.locale, key: "dashboard", path: "/dashboard", noindex: true });
}

// Signed-in home. The middleware gates it on an auth cookie; the client
// provider re-checks the session and sends expired sessions to sign-in.
export default async function DashboardPage(props) {
  const params = await props.params;
  setRequestLocale(params.locale);
  return <DashboardView />;
}
