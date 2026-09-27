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
import { TRACK_ART, subjectArt, switcherFor, termsStatusOf, toClientSubject, totalPeriods } from "../model";
import { loadOutline } from "@/lib/curriculum-outline";
import { compactOutline, createPoolIndex, learnHref, resolveLearnNode } from "@/components/learn/learn-logic";
import { OFFICIAL_LINKS, PLAN_URL, breadcrumbs, channelsCopy, nameOf, titleOf } from "../copy";

/**
 * Outline layer of a leaf's subjects (docs/CONTENT_ENGINE.md §7): per catalog
 * subject with an outline, only a SUMMARY is rendered into the page — the
 * subject node id, its learn href and the unit / lesson / file counts
 * (`{ node, href, units, groups, lessons, books }`). The units and lessons,
 * the "Test yourself" entry points (pool counts) and the official files load
 * when the subject's drawer opens (GET /api/content/outline, CDN-cached), so
 * the leaf page no longer ships every subject's outline (~100–190 KB of JSON
 * per leaf) on first paint. Subjects without an outline get null (the drawer
 * then shows the plan and channels only).
 */
async function learnLayer(leafSlug, subjects) {
  let tree = null;
  try {
    tree = await loadOutline(leafSlug);
  } catch {
    tree = null;
  }
  const out = new Map();
  if (!tree) return out;
  const noPool = createPoolIndex(tree, []); // counts only: pool sizes arrive with the drawer payload
  for (const s of subjects) {
    const ctx = resolveLearnNode(tree, `${leafSlug}/${s.id}`);
    if (!ctx || ctx.node.kind !== "subject") continue;
    const outline = compactOutline(tree, ctx.node.id, noPool);
    const units = outline?.units || [];
    out.set(s.id, {
      node: ctx.node.id,
      href: learnHref(ctx.node.id),
      units: units.filter((u) => u.id).length,
      groups: units.length,
      lessons: outline?.lessons ?? 0,
      books: tree.resourcesFor(ctx.node.id).length,
    });
  }
  return out;
}

/** A grade (K–9) or a track year (secondary): the subjects, their official resources and Jazira's help. */
export default async function LeafView({ slug, node, trail, locale }) {
  const [t, tc] = await Promise.all([getT("curriculum"), getT("common")]);
  const stage = trail[0];
  const { items: crumbs } = breadcrumbs(t, slug, trail, locale);
  const { levels, tracks } = switcherFor(CURRICULUM, slug);
  const hs = stage.id === "high-school";
  const title = titleOf(node, locale);
  const path = `/curriculum/${slug.join("/")}`;

  const learn = await learnLayer(slug.join("/"), node.subjects);
  // toClientSubject() knows the eager { outline, entries, books } shape; the leaf page passes the lazy summary instead.
  const subjects = node.subjects.map((s) => {
    const c = toClientSubject(s, { practice: practiceFor(stage.id, s.id), tag: communityTag(s.name), art: subjectArt(stage.id, s.id) });
    const summary = learn.get(s.id);
    return summary ? { ...c, learn: summary } : c;
  });
  const termsStatus = termsStatusOf(node.subjects);
  const levelLabel = (l) => (hs ? nameOf(l, locale) : t(`switch.grades.g${l.n}`));
  const pages = node.plan?.pages || [];
  // Secondary: the track is the heading and the year joins the stage in the eyebrow
  // (the full "track · year" title stays in metadata, the drawer and recent visits).
  const heading = hs && trail[1] ? nameOf(node, locale) : title;
  const eyebrow = hs && trail[1] ? `${nameOf(stage, locale)} · ${nameOf(trail[1], locale)}` : nameOf(stage, locale);
  // Track years open on their track's image; grades and the common first year
  // keep the compact text header, so the subject list starts high on the page.
  const art = hs && trail[1] ? TRACK_ART[node.id] : null;

  const switchers = (levels || tracks) && (
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
  );
  const header = { eyebrow, title: heading, lead: t("leaf.lead", { subjects: t("count.subjects", { count: node.subjects.length }) }) };

  return (
    <div className="pb-6">
      <RecordCurriculumVisit path={path} title={title} context={nameOf(stage, locale)} />
      {art ? (
        <NodeHeader crumbs={crumbs} crumbsLabel={tc("a11y.breadcrumb")} year={t("year", { year: YEAR })} art={art} {...header}>
          {switchers}
        </NodeHeader>
      ) : (
        <HeaderTopRow crumbs={crumbs} crumbsLabel={tc("a11y.breadcrumb")} year={t("year", { year: YEAR })} />
      )}

      {/* Title, switchers and subjects in the main column (under the hero when the
          track has one); the plan + official channels rail starts beside them. */}
      <div className={art ? "mt-9 grid gap-8 sm:mt-10 xl:grid-cols-12 xl:gap-8" : "mt-5 grid gap-8 sm:mt-7 xl:grid-cols-12 xl:gap-8"}>
        <div className="min-w-0 xl:col-span-8">
          {!art && <NodeHeader {...header}>{switchers}</NodeHeader>}

          <div className={art ? undefined : "mt-9 sm:mt-10"}>
            <Messages ns={["curriculum", "learn"]}>
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
              { label: t("plan.terms"), value: t(termsStatus === "unverified" ? "plan.termsValue" : `plan.termsValueKnown.${termsStatus}`), wide: true },
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
