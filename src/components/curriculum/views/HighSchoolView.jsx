import { getT } from "@/i18n/server";
import { formatDate } from "@/i18n/format";
import { cn } from "@/components/ui/cn";
import { Link } from "@/i18n/navigation";
import Button from "@/components/ui/Button";
import { SectionHeader } from "@/components/ui/Layout";
import { SECTION_GAP } from "@/components/stages/parts";
import { SOURCES_CHECKED, YEAR } from "@/lib/curriculum";
import NodeHeader from "../NodeHeader";
import OfficialChannels from "../OfficialChannels";
import PlanCard from "../PlanCard";
import { SubjectTile } from "../SubjectIcon";
import { Chevron, SubjectChip, pageList } from "../parts";
import { TRACK_COLOR, distinctiveSubjects, nodeHref, sharedSubjects } from "../model";
import { OFFICIAL_LINKS, PLAN_URL, breadcrumbs, channelsCopy, nameOf, titleOf } from "../copy";

/** /curriculum/high-school — the common first year, the five tracks and what they share. */
export default async function HighSchoolView({ slug, node, trail, locale }) {
  const [t, tc] = await Promise.all([getT("curriculum"), getT("common")]);
  const { items: crumbs } = breadcrumbs(t, slug, trail, locale);
  const years = node.children || [];
  const commonYear = years.find((g) => g.children?.length === 1);
  const common = commonYear?.children[0] || null;
  const trackYears = years.filter((g) => g.children?.length > 1);
  const trackIds = [...new Set(trackYears.flatMap((g) => g.children.map((c) => c.id)))];
  const shared = new Map(trackYears.map((g) => [g.id, sharedSubjects(g.children)]));
  const pages = [...new Set(years.flatMap((g) => g.children.flatMap((c) => c.plan?.pages || [])))].sort((a, b) => a - b);
  const distinctNames = new Set(years.flatMap((g) => g.children.flatMap((c) => c.subjects.map((s) => s.name))));

  const facts = [
    { key: "years", value: years.length, label: t("facts.grades", { count: years.length }) },
    { key: "tracks", value: trackIds.length, label: t("facts.tracks", { count: trackIds.length }) },
    { key: "subjects", value: distinctNames.size, label: t("facts.subjects", { count: distinctNames.size }) },
  ];

  const tracks = trackIds.map((id) => {
    const leaves = trackYears.map((g) => ({ year: g, leaf: g.children.find((c) => c.id === id) || null }));
    const any = leaves.find((l) => l.leaf)?.leaf;
    // Subjects only this track takes (per year, against what all five share), first appearance order.
    const own = new Map();
    for (const { year, leaf } of leaves) if (leaf) for (const s of distinctiveSubjects(leaf, shared.get(year.id) || [])) if (!own.has(s.name)) own.set(s.name, s);
    return { id, node: any, leaves, own: [...own.values()] };
  });

  return (
    <div className="pb-6">
      <NodeHeader
        crumbs={crumbs}
        crumbsLabel={tc("a11y.breadcrumb")}
        year={t("year", { year: YEAR })}
        eyebrow={t("node.stageEyebrow")}
        title={titleOf(node, locale)}
        lead={t("node.leads.high-school")}
        facts={facts}
        factsLabel={t("facts.label")}
        locale={locale}
        art="high-school.hero"
      />

      {common && (
        <section aria-labelledby="year-one-title" className={SECTION_GAP}>
          <div className="rounded-xl border border-line/15 bg-surface p-5 shadow-sm sm:p-7">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="max-w-2xl">
                <p className="t-eyebrow">{nameOf(commonYear, locale)}</p>
                <h2 id="year-one-title" className="t-h2 mt-1.5">{t("node.hs.yearOne.title")}</h2>
                <p className="t-small mt-2 text-ink-3">
                  {t("node.hs.yearOne.body")} {t("count.subjects", { count: common.subjects.length })}.
                </p>
              </div>
              <Button href={nodeHref(["high-school", commonYear.id], commonYear)} variant="primary" className="shrink-0 self-start">
                {t("node.hs.yearOne.open")}
              </Button>
            </div>
            <ul className="mt-6 flex flex-wrap gap-2">
              {common.subjects.map((s) => (
                <li key={s.id} className="max-w-full">
                  <SubjectChip subject={s} name={nameOf(s, locale)} />
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {tracks.length > 0 && (
        <section aria-labelledby="tracks-title" className={SECTION_GAP}>
          <SectionHeader id="tracks-title" title={t("node.hs.tracks.title")} description={t("node.hs.tracks.lead")} />
          <ul className="mt-7 grid gap-4 md:grid-cols-2">
            {tracks.map((tr, i) => (
              <li
                key={tr.id}
                className={cn(
                  "flex flex-col rounded-lg border border-line/15 bg-surface p-5 shadow-xs",
                  tracks.length % 2 === 1 && i === tracks.length - 1 && "md:col-span-2"
                )}
              >
                <div className="flex items-center gap-3">
                  <SubjectTile subject={{ icon: tr.node?.icon, color: TRACK_COLOR[tr.id] }} />
                  <h3 className="t-h4 min-w-0">{nameOf(tr.node, locale)}</h3>
                </div>
                {tr.own.length > 0 && (
                  <div className="mt-4">
                    <p className="t-caption font-medium">{t("branch.distinctive")}</p>
                    <p className="t-small mt-1 text-ink-2">
                      {tr.own.slice(0, 6).map((s) => nameOf(s, locale)).join(" · ")}
                      {tr.own.length > 6 && <span className="text-ink-3"> {t("node.hs.more", { count: tr.own.length - 6 })}</span>}
                    </p>
                  </div>
                )}
                <ul className="mt-auto grid grid-cols-2 gap-2 pt-5">
                  {tr.leaves.map(({ year, leaf }) => (
                    <li key={year.id}>
                      {leaf ? (
                        <Link
                          href={`/curriculum/high-school/${year.id}/${tr.id}`}
                          aria-label={`${nameOf(tr.node, locale)} · ${nameOf(year, locale)}`}
                          className="group flex min-h-[3.25rem] items-center justify-between gap-2 rounded-md border border-line/15 bg-surface-2/50 px-3 py-2 transition-colors hover:border-gold-300 hover:bg-gold-50"
                        >
                          <span className="min-w-0">
                            <span className="block text-sm font-medium text-ink">{nameOf(year, locale)}</span>
                            <span className="t-caption block">{t("count.subjects", { count: leaf.subjects.length })}</span>
                          </span>
                          <Chevron className="h-7 w-7" />
                        </Link>
                      ) : (
                        <span className="t-caption block px-3 py-2">—</span>
                      )}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="shared-title" className={SECTION_GAP}>
        <SectionHeader id="shared-title" size="h3" title={t("node.hs.shared.title")} />
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:gap-5">
          {trackYears.map((g) => {
            const list = shared.get(g.id) || [];
            return (
              <div key={g.id} className="rounded-lg border border-line/15 bg-surface p-5">
                <h3 className="t-h4">{nameOf(g, locale)}</h3>
                <p className="t-caption">{t("count.subjects", { count: list.length })}</p>
                {list.length ? (
                  <ul className="mt-4 flex flex-wrap gap-2">
                    {list.map((s) => (
                      <li key={s.id} className="max-w-full">
                        <SubjectChip subject={s} name={nameOf(s, locale)} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="t-small mt-3 text-ink-3">{t("node.hs.shared.empty")}</p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:gap-5">
        <PlanCard
          title={t("plan.stageTitle")}
          titleId="plan-title"
          rows={[
            { label: t("plan.source"), value: t("plan.guide"), wide: true, hint: t("plan.pages", { count: pages.length, pages: pageList(pages, locale) }) },
            { label: t("plan.checked"), value: formatDate(SOURCES_CHECKED, locale) },
            { label: t("plan.terms"), value: t("plan.termsValue"), wide: true },
          ]}
          source={{ href: PLAN_URL, label: t("plan.open"), newTab: t("channels.newTab") }}
        />
        <OfficialChannels titleId="channels-title" links={OFFICIAL_LINKS} copy={channelsCopy(t, { steps: false })} />
      </div>
    </div>
  );
}
