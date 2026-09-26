import { Mic, Users } from "lucide-react";
import Illustration from "@/components/ui/Illustration";
import { cn } from "@/components/ui/cn";
import { PLATE } from "./parts";

/**
 * Side rail for the elementary learning games: how to play · mic note · tip for parents.
 * xl: a vertical rail beside the game. Below xl it sits under the game, two
 * cards side by side from `md` so the full width is used.
 */
export default function GamesRail({ t }) {
  const games = [
    { key: "write", art: "elementary.writing" },
    { key: "read", art: "elementary.reading" },
  ];
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
      <section aria-labelledby="howto-title" className="surface-flat p-5">
        <h3 id="howto-title" className="t-h4">{t("elementary.games.howTo.title")}</h3>
        <ul className="mt-4 space-y-4">
          {games.map((g) => (
            <li key={g.key} className="flex items-start gap-3.5">
              <span className={cn("block w-20 shrink-0 overflow-hidden rounded-md ring-1 ring-inset ring-[#7A623A]/10 dark:ring-line/10", PLATE)}>
                <Illustration id={g.art} />
              </span>
              <div className="min-w-0">
                <p className="font-medium leading-snug text-ink">{t(`elementary.games.tabs.${g.key}`)}</p>
                <p className="t-small mt-1 text-ink-3">{t(`elementary.games.howTo.${g.key}`)}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="t-caption mt-5 flex items-start gap-2 border-t border-line/10 pt-4">
          <Mic size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-gold-600" />
          {t("elementary.games.mic")}
        </p>
      </section>

      <section aria-labelledby="parents-title" className="surface-tint flex items-start gap-3.5 self-start p-5">
        <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-sm bg-surface text-green-600 ring-1 ring-inset ring-line/10">
          <Users size={18} />
        </span>
        <div className="min-w-0">
          <h3 id="parents-title" className="t-h4">{t("elementary.games.parents.title")}</h3>
          <p className="t-small mt-1 text-ink-2">{t("elementary.games.parents.body")}</p>
        </div>
      </section>
    </div>
  );
}
