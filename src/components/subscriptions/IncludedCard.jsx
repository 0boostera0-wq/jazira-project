import { getT } from "@/i18n/server";
import Illustration from "@/components/ui/Illustration";
import { cn } from "@/components/ui/cn";
import PerkList from "./PerkList";
import { elitePerks } from "./plan";

/**
 * Illustrated "what you get" list for checkout and the success page. Server component.
 * `art` = illustration id, or false. The art is dropped on phones (keeps the
 * page focused) and sits beside the list on tablets, where the card spans the
 * full width, rather than as a stretched banner; in the desktop rail it tops the card.
 */
export default async function IncludedCard({ title, className, art = "subscriptions.premium" }) {
  const [t, tc] = await Promise.all([getT("subscriptions"), getT("common")]);
  const perks = elitePerks(t, tc);
  return (
    <section className={cn("surface overflow-hidden", art && "md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:block", className)}>
      {art && (
        <div className="hidden bg-[#F7F0E3] dark:bg-surface-2 px-6 md:flex md:items-center md:justify-center md:py-6 lg:block lg:py-0 lg:pt-3">
          <Illustration id={art} className="mx-auto w-full max-w-[190px]" />
        </div>
      )}
      <div className="p-5 sm:p-6">
        <h2 className="t-h4">{title}</h2>
        <PerkList perks={perks} className="mt-3.5" />
      </div>
    </section>
  );
}
