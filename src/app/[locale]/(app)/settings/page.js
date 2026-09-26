import { Suspense } from "react";
import { setRequestLocale, getT } from "@/i18n/server";
import Messages from "@/i18n/WithMessages";
import { buildMetadata } from "@/lib/seo";
import SettingsLayout, { SettingsFallback } from "@/components/settings/SettingsLayout";

export async function generateMetadata(props) {
  const params = await props.params;
  return buildMetadata({ locale: params.locale, key: "settings", path: "/settings", noindex: true });
}

// Private, auth-gated page. The title block renders on the server; the section
// rail and each section are client islands that load their own data (profile
// private columns via get_my_private_profile, set_avatar(null) to clear the
// photo, sessions, social + notification switches, subscription).
// The open section (?section=) is read on the client (useSearchParams inside
// this Suspense boundary), so the route prerenders instead of rendering per
// request just to read the query string.
export default async function SettingsPage(props) {
  const params = await props.params;
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
      <Suspense fallback={<SettingsFallback header={header} />}>
        <SettingsLayout header={header} />
      </Suspense>
    </Messages>
  );
}
