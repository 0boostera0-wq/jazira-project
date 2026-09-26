import { getLocale, getT } from "@/i18n/server";
import NotFoundView from "@/components/states/NotFoundView";

// Shown when a page under app/[locale] calls notFound() (unknown profile,
// curriculum slug…). Unmatched URLs never get here: with no catch-all route
// they fall through to app/not-found.js, which Next server-renders as a full
// 404 document (a thrown notFound() in Next 14 only renders after hydration).

export async function generateMetadata({ params }) {
  const t = await getT("meta", params?.locale);
  return {
    title: t("pages.notFound.title"),
    description: t("pages.notFound.description"),
    robots: { index: false, follow: false },
  };
}

export default function NotFound() {
  return <NotFoundView locale={getLocale()} />;
}
