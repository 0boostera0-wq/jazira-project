import { getT } from "@/i18n/server";
import IslandMark from "@/components/brand/IslandMark";

/**
 * Branded loading state for the public site (app routes use layout-shaped
 * skeletons instead): the Jazira mark breathing softly — static when the user
 * prefers reduced motion — with a live, localized status for screen readers.
 */
export default async function BrandLoader() {
  const t = await getT("common");
  return (
    <div role="status" aria-live="polite" className="grid min-h-[55vh] place-items-center px-6">
      <IslandMark size={56} className="motion-safe:animate-[jz-pulse-soft_1.6s_ease-in-out_infinite]" />
      <span className="sr-only">{t("states.loading")}</span>
    </div>
  );
}
