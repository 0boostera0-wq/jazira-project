import { ChevronRight, Medal, Settings2, Trophy, Users } from "lucide-react";
import { getT } from "@/i18n/server";
import { Link } from "@/i18n/navigation";
import { cn } from "@/components/ui/cn";

const LINKS = {
  competitions: { href: "/competitions", icon: Medal },
  community: { href: "/community", icon: Users },
  achievements: { href: "/achievements", icon: Trophy },
  privacy: { href: "/settings", icon: Settings2 },
};

// grid: side by side from sm (bottom of a main column) · rail: side by side
// from sm until xl, where it becomes a list in the page rail · list: always a list.
const LAYOUTS = { grid: "grid sm:grid-cols-2", rail: "grid sm:grid-cols-2 xl:grid-cols-1", list: undefined };

/**
 * Server card of cross-links: <RelatedLinks items={["competitions", "community"]} />
 */
export default async function RelatedLinks({ items, id = "related-title", layout = "list", className }) {
  const t = await getT("achievements");
  return (
    <nav aria-labelledby={id} className={cn("surface-flat p-2", className)}>
      <h2 id={id} className="px-3 pb-1 pt-3 text-[0.8125rem] font-medium text-ink-3">{t("related.title")}</h2>
      <ul className={LAYOUTS[layout]}>
        {items.map((key) => {
          const { href, icon: Icon } = LINKS[key];
          return (
            <li key={key}>
              <Link href={href} className="group flex min-h-[56px] items-center gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-surface-2">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-sm bg-surface-2 text-gold-600 ring-1 ring-inset ring-line/10 group-hover:bg-surface">
                  <Icon size={18} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-ink">{t(`related.${key}.title`)}</span>
                  <span className="block text-[0.8125rem] leading-snug text-ink-3">{t(`related.${key}.body`)}</span>
                </span>
                <ChevronRight size={16} aria-hidden="true" className="flip-rtl shrink-0 text-ink-4 transition-colors group-hover:text-ink-2" />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
