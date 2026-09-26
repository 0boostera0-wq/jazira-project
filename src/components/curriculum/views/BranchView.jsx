import { getT } from "@/i18n/server";
import { Link } from "@/i18n/navigation";
import { CURRICULUM, YEAR } from "@/lib/curriculum";
import NodeHeader, { HeaderTopRow } from "../NodeHeader";
import OfficialChannels from "../OfficialChannels";
import { SubjectTile } from "../SubjectIcon";
import { Chevron, LevelSwitcher, SubjectChip } from "../parts";
import { TRACK_COLOR, distinctiveSubjects, sharedSubjects, switcherFor } from "../model";
import { OFFICIAL_LINKS, breadcrumbs, channelsCopy, nameOf, titleOf } from "../copy";

/** /curriculum/high-school/grade-2|3 — pick a track; what every track shares this year. */
export default async function BranchView({ slug, node, trail, locale }) {
  const [t, tc] = await Promise.all([getT("curriculum"), getT("common")]);
  const { items: crumbs } = breadcrumbs(t, slug, trail, locale);
  const tracks = node.children || [];
  const shared = sharedSubjects(tracks);
  const { levels } = switcherFor(CURRICULUM, slug);

  const facts = [
    { key: "tracks", value: tracks.length, label: t("facts.tracks", { count: tracks.length }) },
    { key: "shared", value: shared.length, label: t("branch.sharedFact", { count: shared.length }) },
  ];

  return (
    <div className="pb-6">
      <HeaderTopRow crumbs={crumbs} crumbsLabel={tc("a11y.breadcrumb")} year={t("year", { year: YEAR })} />

      <div className="mt-5 grid gap-8 sm:mt-7 xl:grid-cols-12 xl:gap-8">
        <div className="min-w-0 xl:col-span-8">
          <NodeHeader
            eyebrow={nameOf(trail[0], locale)}
            title={titleOf(node, locale)}
            lead={t("branch.lead")}
            facts={facts}
            factsLabel={t("facts.label")}
            locale={locale}
          >
            {levels && (
              <LevelSwitcher
                label={t("switch.year")}
                items={levels.map((l) => ({ key: l.id, label: nameOf(l, locale), href: l.href, active: l.active }))}
              />
            )}
          </NodeHeader>

          <section aria-labelledby="tracks-title" className="mt-10 sm:mt-12">
            <h2 id="tracks-title" className="t-h3">{t("branch.tracksTitle")}</h2>
            <ul className="mt-5 grid gap-3 md:grid-cols-2 md:gap-4">
              {tracks.map((tr, i) => {
                const wide = tracks.length % 2 === 1 && i === tracks.length - 1;
                const own = distinctiveSubjects(tr, shared);
                return (
                  <li key={tr.id} className={wide ? "md:col-span-2" : undefined}>
                    <Link
                      href={`/curriculum/${[...slug, tr.id].join("/")}`}
                      className="group flex h-full flex-col rounded-lg border border-line/15 bg-surface p-5 shadow-xs transition-[transform,box-shadow,border-color] duration ease-out hover:-translate-y-0.5 hover:border-line/20 hover:shadow-md"
                    >
                      <span className="flex items-center gap-3">
                        <SubjectTile subject={{ icon: tr.icon, color: TRACK_COLOR[tr.id] }} />
                        <span className="min-w-0 flex-1">
                          <span className="t-h4 block">{nameOf(tr, locale)}</span>
                          <span className="t-caption block">{t("count.subjects", { count: tr.subjects.length })}</span>
                        </span>
                        <Chevron />
                      </span>
                      {own.length > 0 && (
                        <span className="mt-4 block">
                          <span className="t-caption block font-medium">{t("branch.distinctive")}</span>
                          <span className="t-small mt-1 block text-ink-2">{own.map((s) => nameOf(s, locale)).join(" · ")}</span>
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        <aside className="grid content-start gap-4 md:grid-cols-2 xl:top-24 xl:col-span-4 xl:grid-cols-1 xl:self-start xl:[@media(min-height:48rem)]:sticky">
          <section aria-labelledby="shared-title" className="rounded-lg border border-line/15 bg-surface-2/70 p-5 sm:p-6">
            <h2 id="shared-title" className="t-h4">{t("node.hs.shared.title")}</h2>
            <p className="t-caption">{t("count.subjects", { count: shared.length })}</p>
            {shared.length ? (
              <ul className="mt-4 flex flex-wrap gap-2">
                {shared.map((s) => (
                  <li key={s.id} className="max-w-full">
                    <SubjectChip subject={s} name={nameOf(s, locale)} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="t-small mt-3 text-ink-3">{t("node.hs.shared.empty")}</p>
            )}
          </section>
          <OfficialChannels titleId="channels-title" links={OFFICIAL_LINKS} copy={channelsCopy(t, { steps: false })} />
        </aside>
      </div>
    </div>
  );
}
