import { ClipboardCheck, Compass, Library, Users } from "lucide-react";
import { getT } from "@/i18n/server";

const Kbd = ({ children }) => (
  <kbd className="inline-grid h-6 min-w-6 place-items-center rounded-xs border border-line/20 bg-surface-2 px-1.5 font-sans text-[0.75rem] font-medium text-ink-2 shadow-xs">
    {children}
  </kbd>
);

/**
 * Static rail content: what the search covers (numbers derived from the
 * curriculum catalog) and the keyboard shortcuts (desktop only).
 */
export default async function SearchRail({ stats }) {
  const [t, tc] = await Promise.all([getT("search"), getT("common")]);
  const scope = [
    { key: "curriculum", icon: Library, body: t("scope.curriculum.body", { grades: tc("units.grades", { count: stats.grades }), subjects: tc("units.subjects", { count: stats.subjects }) }) },
    { key: "practice", icon: ClipboardCheck, body: t("scope.practice.body") },
    { key: "community", icon: Users, body: t("scope.community.body") },
    { key: "pages", icon: Compass, body: t("scope.pages.body") },
  ];
  const keys = [
    { keys: ["/"], label: t("keys.focus") },
    { keys: ["↑", "↓"], label: t("keys.move") },
    { keys: [t("keys.enterKey")], label: t("keys.open") },
    { keys: [t("keys.escKey")], label: t("keys.back") },
  ];
  return (
    <>
      <section aria-labelledby="jz-scope" className="surface-tint p-4 sm:p-5">
        <h2 id="jz-scope" className="text-[0.9375rem] font-bold text-ink">{t("scope.title")}</h2>
        <ul className="mt-3.5 grid gap-3.5 sm:grid-cols-2 sm:gap-x-6 lg:grid-cols-1">
          {scope.map(({ key, icon: Icon, body }) => (
            <li key={key} className="flex gap-3">
              <span aria-hidden="true" className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-sm bg-surface text-gold-600 ring-1 ring-inset ring-line/10">
                <Icon size={16} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink">{t(`scope.${key}.title`)}</span>
                <span className="t-caption block">{body}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="jz-keys" className="surface-flat hidden p-4 sm:p-5 lg:block">
        <h2 id="jz-keys" className="text-[0.9375rem] font-bold text-ink">{t("keys.title")}</h2>
        <dl className="mt-3 space-y-2.5">
          {keys.map((k) => (
            <div key={k.label} className="flex items-center justify-between gap-3">
              <dt className="t-small text-ink-3">{k.label}</dt>
              <dd dir="ltr" className="flex shrink-0 gap-1">
                {k.keys.map((c) => (
                  <Kbd key={c}>{c}</Kbd>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}
