import { ArrowRight, Brain, FlaskConical, Library, Sparkles, Users } from "lucide-react";
import { getT } from "@/i18n/server";
import { Link } from "@/i18n/navigation";
import IconTile from "@/components/ui/IconTile";
import { cn } from "@/components/ui/cn";

// sm+: a 6-col bento — two wide exam tiles on top, three compact tiles below.
// Phones: one grouped list (a card with divided rows, every row with the
// same forward arrow) — five stacked cards would push the rail far down.
const TILES = [
  { key: "aptitude", href: "/exams/aptitude", icon: Brain, tone: "gold", wide: true },
  { key: "achievement", href: "/exams/achievement", icon: FlaskConical, tone: "green", wide: true },
  { key: "curriculum", href: "/curriculum", icon: Library, tone: "neutral" },
  { key: "assistant", href: "/assistant", icon: Sparkles, tone: "gold" },
  { key: "community", href: "/community", icon: Users, tone: "neutral" },
];

export default async function QuickStart() {
  const t = await getT("dashboard");
  return (
    <section aria-labelledby="dash-quick">
      <h2 id="dash-quick" className="t-h4 mb-3">{t("quick.title")}</h2>
      <ul className="overflow-hidden rounded-lg border border-line/12 bg-surface shadow-sm max-sm:divide-y max-sm:divide-line/10 sm:grid sm:grid-cols-6 sm:gap-3 sm:overflow-visible sm:rounded-none sm:border-0 sm:bg-transparent sm:shadow-none">
        {TILES.map((tile) => (
          <li key={tile.key} className={tile.wide ? "sm:col-span-3" : "sm:col-span-2"}>
            <Link
              href={tile.href}
              className={cn(
                "group flex h-full items-center gap-3.5 px-4 py-3.5 transition-colors hover:bg-surface-2/60",
                "sm:surface sm:p-4 sm:transition-[transform,box-shadow,border-color] sm:duration sm:ease-out sm:hover:-translate-y-0.5 sm:hover:border-line/20 sm:hover:bg-surface sm:hover:shadow-md",
                !tile.wide && "sm:flex-col sm:items-start sm:gap-3"
              )}
            >
              <IconTile icon={tile.icon} tone={tile.tone} size={tile.wide ? "md" : "sm"} className="max-sm:h-10 max-sm:w-10" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-ink">{t(`quick.items.${tile.key}.title`)}</span>
                <span className="t-caption mt-0.5 block">{t(`quick.items.${tile.key}.body`)}</span>
              </span>
              <ArrowRight
                size={18}
                aria-hidden="true"
                className={cn("flip-rtl shrink-0 text-ink-4 transition-colors group-hover:text-ink-2", !tile.wide && "sm:hidden")}
              />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
