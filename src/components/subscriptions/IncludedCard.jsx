import { getT } from "@/i18n/server";
import Illustration from "@/components/ui/Illustration";
import { ArtPreload } from "@/components/stages/HeroArt";
import { cn } from "@/components/ui/cn";
import PerkList from "./PerkList";
import { elitePerks } from "./plan";

const ART_SIZES = "(min-width: 1024px) 38vw, 40vw";

/**
 * Illustrated "what you get" list for checkout and the success page. Server component.
 * `art` = library image id, or false. The art is dropped on phones (keeps the
 * page focused) and sits full-bleed beside the list on tablets, where the card
 * spans the full width; in the desktop rail it tops the card as a 16:9 band
 * (preloaded from md up only).
 */
export default async function IncludedCard({ title, className, art = "subscriptions.premium" }) {
  const [t, tc] = await Promise.all([getT("subscriptions"), getT("common")]);
  const perks = elitePerks(t, tc);
  return (
    <section className={cn("surface overflow-hidden", art && "md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:block", className)}>
      {art && (
        <div aria-hidden="true" className="relative hidden md:block md:min-h-[13rem] lg:aspect-[16/9] lg:min-h-0">
          <ArtPreload id={art} from="md" sizes={ART_SIZES} />
          <Illustration id={art} fill sizes={ART_SIZES} />
        </div>
      )}
      <div className="p-5 sm:p-6">
        <h2 className="t-h4">{title}</h2>
        <PerkList perks={perks} className="mt-3.5" />
      </div>
    </section>
  );
}
