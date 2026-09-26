import { setRequestLocale, getT } from "@/i18n/server";
import Messages from "@/i18n/WithMessages";
import { buildMetadata } from "@/lib/seo";
import NotificationsCenter from "@/components/notifications/NotificationsCenter";
import NotificationsRail from "@/components/notifications/NotificationsRail";

export async function generateMetadata({ params }) {
  return buildMetadata({ locale: params.locale, key: "notifications", path: "/notifications", noindex: true });
}

// Private page. Title block renders on the server; the list (get_notifications,
// keyset pages) and the preferences rail are independent client islands.
export default async function NotificationsPage({ params }) {
  setRequestLocale(params.locale);
  const t = await getT("notifications");
  const header = (
    <>
      <h1 className="t-h1">{t("page.title")}</h1>
      <p className="t-lead mt-2">{t("page.lead")}</p>
    </>
  );

  return (
    <Messages ns={["notifications"]}>
      <div className="lg:grid lg:grid-cols-12 lg:gap-8 xl:gap-10">
        <div className="min-w-0 lg:col-span-8">
          <NotificationsCenter header={header} />
        </div>
        <aside className="mt-10 lg:col-span-4 lg:mt-0">
          <div className="lg:sticky lg:top-[calc(var(--topbar-h)+1.5rem)]">
            <NotificationsRail />
          </div>
        </aside>
      </div>
    </Messages>
  );
}
