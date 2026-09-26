import { setRequestLocale, getT } from "@/i18n/server";
import Messages from "@/i18n/WithMessages";
import { buildMetadata } from "@/lib/seo";
import SettingsLayout from "@/components/settings/SettingsLayout";
import { sectionFrom } from "@/components/settings/model";

export async function generateMetadata({ params }) {
  return buildMetadata({ locale: params.locale, key: "settings", path: "/settings", noindex: true });
}

// Private, auth-gated page. The title block renders on the server; the section
// rail and each section are client islands that load their own data (profile
// private columns via get_my_private_profile, set_avatar(null) to clear the
// photo, sessions, social + notification switches, subscription). ?section=
// selects the open section so deep links render the right panel immediately.
export default async function SettingsPage({ params, searchParams }) {
  setRequestLocale(params.locale);
  const t = await getT("settings");
  const header = (
    <>
      <p className="t-eyebrow">{t("page.eyebrow")}</p>
      <h1 className="t-h1 mt-2">{t("page.title")}</h1>
      <p className="t-lead mt-2.5">{t("page.lead")}</p>
    </>
  );

  return (
    <Messages ns={["settings"]}>
      <SettingsLayout header={header} initialSection={sectionFrom(searchParams?.section)} />
    </Messages>
  );
}
