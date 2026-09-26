import { getT } from "@/i18n/server";
import Messages from "@/i18n/WithMessages";
import { formatDate } from "@/i18n/format";
import { CURRICULUM, ELECTIVE_OPTIONS, SOURCES_CHECKED, YEAR, communityTag, practiceFor } from "@/lib/curriculum";
import RecordCurriculumVisit from "@/components/dashboard/RecordCurriculumVisit";
import NodeHeader, { HeaderTopRow } from "../NodeHeader";
import OfficialChannels from "../OfficialChannels";
import PlanCard from "../PlanCard";
import SubjectExplorer from "../SubjectExplorer";
import { LevelSwitcher, pageList } from "../parts";
import { subjectArt, switcherFor, toClientSubject, totalPeriods } from "../model";
import { OFFICIAL_LINKS, PLAN_URL, breadcrumbs, channelsCopy, nameOf, titleOf } from "../copy";

/** A grade (K–9) or a track year (secondary): the subjects, their official resources and Jazira's help. */
export default async function LeafView({ slug, node, trail, locale }) {
  const [t, tc] = await Promise.all([getT("curriculum"), getT("common")]);
  const stage = trail[0];
  const { items: crumbs } = breadcrumbs(t, slug, trail, locale);
  const { levels, tracks } = switcherFor(CURRICULUM, slug);
  const hs = stage.id === "high-school";
  const title = titleOf(node, locale);
  const path = `/curriculum/${slug.join("/")}`;

  const subjects = node.subjects.map((s) =>
    toClientSubject(s, { practice: practiceFor(stage.id, s.id), tag: communityTag(s.name), art: subjectArt(stage.id, s.id) })
  );
  const levelLabel = (l) => (hs ? nameOf(l, locale) : t(`switch.grades.g${l.n}`));
  const pages = node.plan?.pages || [];
  // Secondary: the track is the heading and the year joins the stage in the eyebrow
  // (the full "track · year" title stays in metadata, the drawer and recent visits).
  const heading = hs && trail[1] ? nameOf(node, locale) : title;
  const eyebrow = hs && trail[1] ? `${nameOf(stage, locale)} · ${nameOf(trail[1], locale)}` : nameOf(stage, locale);

  return (
    <div className="pb-6">
      <RecordCurriculumVisit path={path} title={title} context={nameOf(stage, locale)} />
      <HeaderTopRow crumbs={crumbs} crumbsLabel={tc("a11y.breadcrumb")} year={t("year", { year: YEAR })} />

      {/* Title, switchers and subjects in the main column; the plan + official channels rail starts beside the title. */}
      <div className="mt-5 grid gap-8 sm:mt-7 xl:grid-cols-12 xl:gap-8">
        <div className="min-w-0 xl:col-span-8">
          <NodeHeader
            eyebrow={eyebrow}
            title={heading}
            lead={t("leaf.lead", { subjects: t("count.subjects", { count: node.subjects.length }) })}
          >
            {(levels || tracks) && (
              <div className="flex flex-col gap-2.5">
                {levels && (
                  <LevelSwitcher
                    label={hs ? t("switch.year") : t("switch.grade")}
                    items={levels.map((l) => ({ key: l.id, label: levelLabel(l), href: l.href, active: l.active }))}
                  />
                )}
                {tracks && (
                  <LevelSwitcher
                    label={t("switch.track")}
                    items={tracks.map((tr) => ({ key: tr.id, label: t(`switch.tracks.${tr.id}`), href: tr.href, active: tr.active }))}
                  />
                )}
              </div>
            )}
          </NodeHeader>

          <div className="mt-9 sm:mt-10">
            <Messages ns={["curriculum"]}>
              <SubjectExplorer
                subjects={subjects}
                context={{ title, electiveOptions: subjects.some((x) => x.notes.includes("electiveOptions")) ? ELECTIVE_OPTIONS : null }}
                links={OFFICIAL_LINKS}
                emptyHref={`/curriculum/${stage.id}`}
              />
            </Messages>
          </div>
        </div>

        {/* Sticky only where the whole rail fits the viewport; otherwise it scrolls with the page. */}
        <aside className="grid content-start gap-4 md:grid-cols-2 xl:top-24 xl:col-span-4 xl:grid-cols-1 xl:self-start xl:[@media(min-height:66rem)]:sticky">
          <PlanCard
            title={hs ? t("plan.hsTitle") : t("plan.title")}
            titleId="plan-title"
            rows={[
              { label: t("plan.source"), value: t("plan.guide"), wide: true, hint: pages.length ? t("plan.pages", { count: pages.length, pages: pageList(pages, locale) }) : null },
              { label: t("plan.total"), value: t("count.periods", { count: totalPeriods(node) }), hint: t("subject.periodsHint") },
              { label: t("plan.checked"), value: formatDate(SOURCES_CHECKED, locale) },
              { label: t("plan.terms"), value: t("plan.termsValue"), wide: true },
            ]}
            source={{ href: PLAN_URL, label: t("plan.open"), newTab: t("channels.newTab") }}
            note={hs ? null : t("plan.tahfeez")}
          />
          <OfficialChannels titleId="channels-title" links={OFFICIAL_LINKS} copy={channelsCopy(t)} />
        </aside>
      </div>
    </div>
  );
}
