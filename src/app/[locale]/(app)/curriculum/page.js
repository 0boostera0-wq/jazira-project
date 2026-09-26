import { ClipboardCheck, Users } from "lucide-react";
import { setRequestLocale, getT } from "@/i18n/server";
import Messages from "@/i18n/WithMessages";
import { Link } from "@/i18n/navigation";
import { buildMetadata } from "@/lib/seo";
import { SectionHeader } from "@/components/ui/Layout";
import IconTile from "@/components/ui/IconTile";
import AssistantAvatar from "@/components/brand/AssistantAvatar";
import { CURRICULUM, YEAR, curriculumStats } from "@/lib/curriculum";
import NodeHeader from "@/components/curriculum/NodeHeader";
import CurriculumFinder from "@/components/curriculum/CurriculumFinder";
import StageCard, { HighSchoolCard } from "@/components/curriculum/StageCard";
import OfficialChannels from "@/components/curriculum/OfficialChannels";
import SourcesSection from "@/components/curriculum/SourcesSection";
import { Chevron } from "@/components/curriculum/parts";
import { SECTION_GAP } from "@/components/stages/parts";
import { cn } from "@/components/ui/cn";
import { nodeHref } from "@/components/curriculum/model";
import { OFFICIAL_LINKS, channelsCopy } from "@/components/curriculum/copy";

export async function generateMetadata(props) {
  const params = await props.params;
  const t = await getT("curriculum", params.locale);
  return buildMetadata({ locale: params.locale, key: "curriculum", path: "/curriculum", description: t("seo.hub", { year: YEAR }) });
}

const ART = { elementary: "elementary.classroom", middle: "middle.study-plan", "high-school": "high-school.hero" };

/** Distinct subjects (official names) across a stage's leaves. */
function stageSubjectCount(stage) {
  const names = new Set();
  const walk = (nodes) => nodes.forEach((n) => (n.subjects ? n.subjects.forEach((s) => names.add(s.name)) : walk(n.children || [])));
  walk(stage.children || []);
  return names.size;
}

// Statically rendered: the catalog is in code, the search island loads its
// index on first use, and nothing here depends on the visitor.
export default async function CurriculumHub(props) {
  const params = await props.params;
  setRequestLocale(params.locale);
  const { locale } = params;
  const en = locale === "en";
  const t = await getT("curriculum");
  const stats = curriculumStats();
  const nm = (n) => (en ? n.name_en || n.name : n.name);
  const byId = Object.fromEntries(CURRICULUM.map((s) => [s.id, s]));

  const facts = [
    { key: "stages", value: stats.stages, label: t("facts.stages", { count: stats.stages }) },
    { key: "grades", value: stats.grades, label: t("facts.grades", { count: stats.grades }) },
    { key: "tracks", value: stats.tracks, label: t("facts.tracks", { count: stats.tracks }) },
    { key: "subjects", value: stats.subjects, label: t("facts.subjects", { count: stats.subjects }) },
  ];

  const flatCard = (id) => {
    const stage = byId[id];
    if (!stage) return null;
    const grades = stage.children || [];
    return (
      <StageCard
        key={id}
        href={`/curriculum/${id}`}
        art={ART[id]}
        name={nm(stage)}
        range={t(`hub.stages.items.${id}.range`)}
        body={t(`hub.stages.items.${id}.body`)}
        meta={`${t("count.grades", { count: grades.length })} · ${t("count.subjects", { count: stageSubjectCount(stage) })}`}
        gradesLabel={t("hub.stages.grades")}
        grades={grades.map((g) => ({
          key: g.id,
          href: `/curriculum/${id}/${g.id}`,
          label: t(`switch.grades.g${g.n}`),
          aria: en ? g.title_en : g.title,
        }))}
      />
    );
  };

  const hs = byId["high-school"];
  const hsYears = (hs?.children || []).filter((g) => g.children?.length > 1);
  const hsCommon = (hs?.children || []).find((g) => g.children?.length === 1);
  const hsTracks = hsYears[0]?.children || [];

  const value = [
    { key: "practice", href: "/exams", icon: <IconTile icon={ClipboardCheck} tone="gold" /> },
    { key: "assistant", href: "/assistant", icon: <AssistantAvatar size={44} /> },
    { key: "community", href: "/community", icon: <IconTile icon={Users} tone="green" /> },
  ];

  const other = [
    { key: "continuing", name: byId.continuing ? nm(byId.continuing) : null, body: t("hub.other.items.continuing"), href: byId.continuing ? "/curriculum/continuing" : null },
    { key: "special", name: byId.special ? nm(byId.special) : null, body: t("hub.other.items.special"), href: byId.special ? "/curriculum/special" : null },
    { key: "tahfeez", name: t("hub.other.items.tahfeez.name"), body: t("hub.other.items.tahfeez.body"), href: null },
  ].filter((o) => o.name);

  return (
    <div className="pb-6">
      <NodeHeader
        year={t("year", { year: YEAR })}
        eyebrow={t("hub.eyebrow")}
        title={t("hub.title")}
        lead={t("hub.lead", { year: YEAR })}
        facts={facts}
        factsLabel={t("facts.label")}
        locale={locale}
        art="brand.island-education"
      >
        <Messages ns={["curriculum"]}>
          <CurriculumFinder className="max-w-xl" />
        </Messages>
      </NodeHeader>

      {/* ── Stages ── */}
      <section id="stages" aria-labelledby="stages-title" className={cn(SECTION_GAP, "scroll-mt-24")}>
        <SectionHeader id="stages-title" eyebrow={t("hub.stages.eyebrow")} title={t("hub.stages.title")} description={t("hub.stages.lead")} />
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:gap-5">
          {flatCard("elementary")}
          {flatCard("middle")}
          {hs && (
            <HighSchoolCard
              className="md:col-span-2"
              href="/curriculum/high-school"
              art={ART["high-school"]}
              name={nm(hs)}
              range={t("hub.stages.items.high-school.range")}
              body={t("hub.stages.items.high-school.body")}
              meta={`${t("count.tracks", { count: hsTracks.length })} · ${t("count.subjects", { count: stageSubjectCount(hs) })}`}
              common={hsCommon ? { href: nodeHref(["high-school", hsCommon.id], hsCommon), label: t("hub.stages.items.high-school.common") } : null}
              yearHeads={hsYears.map((g) => nm(g))}
              trackLabel={t("hub.stages.items.high-school.track")}
              tracks={hsTracks.map((tr) => ({
                key: tr.id,
                icon: tr.icon,
                name: t(`switch.tracks.${tr.id}`),
                cells: hsYears.map((g) => {
                  const leaf = g.children.find((c) => c.id === tr.id);
                  return leaf
                    ? { key: g.id, label: t("count.subjects", { count: leaf.subjects.length }), href: `/curriculum/high-school/${g.id}/${tr.id}`, aria: `${nm(tr)} · ${nm(g)}` }
                    : { key: g.id, label: null, href: null };
                }),
              }))}
            />
          )}
        </div>
      </section>

      {/* ── What Jazira adds + where the books are ── */}
      <section aria-labelledby="value-title" className={cn(SECTION_GAP, "grid gap-8 xl:grid-cols-12 xl:gap-8")}>
        <div className="xl:col-span-7">
          <SectionHeader id="value-title" eyebrow={t("hub.value.eyebrow")} title={t("hub.value.title")} description={t("hub.value.lead")} />
          <ul className="mt-7 grid gap-3">
            {value.map((v) => (
              <li key={v.key}>
                <Link
                  href={v.href}
                  className="group flex items-center gap-4 rounded-lg border border-line/15 bg-surface p-4 shadow-xs transition-[transform,box-shadow,border-color] duration ease-out hover:-translate-y-0.5 hover:border-line/20 hover:shadow-md sm:p-5"
                >
                  <span aria-hidden="true" className="shrink-0">{v.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="t-h4 block">{t(`hub.value.${v.key}.title`)}</span>
                    <span className="t-small mt-0.5 block text-ink-3">{t(`hub.value.${v.key}.body`)}</span>
                  </span>
                  <Chevron />
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <OfficialChannels
          className="self-start xl:col-span-5 xl:mt-[4.5rem]"
          titleId="channels-title"
          links={OFFICIAL_LINKS}
          copy={channelsCopy(t)}
        />
      </section>

      {/* ── Sources ── */}
      <div className={SECTION_GAP}>
        <SourcesSection />
      </div>

      {/* ── Programmes with their own plans ── */}
      {other.length > 0 && (
        <section aria-labelledby="other-title" className="mt-10 rounded-lg border border-dashed border-line/25 bg-surface-2/50 p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h2 id="other-title" className="t-h4">{t("hub.other.title")}</h2>
            <span className="inline-flex h-6 shrink-0 items-center rounded-full border border-line/20 bg-surface px-2.5 text-xs font-medium text-ink-3">{t("hub.other.badge")}</span>
          </div>
          <p className="t-caption mt-1.5 max-w-2xl">{t("hub.other.lead")}</p>
          <ul className="mt-4 grid gap-3 md:grid-cols-3">
            {other.map((o) => {
              const inner = (
                <>
                  <span className="block font-medium text-ink">{o.name}</span>
                  <span className="t-small mt-1 block text-ink-3">{o.body}</span>
                </>
              );
              return (
                <li key={o.key}>
                  {o.href ? (
                    <Link href={o.href} className="block h-full rounded-md bg-surface p-4 ring-1 ring-inset ring-line/10 transition-colors hover:ring-line/20">
                      {inner}
                    </Link>
                  ) : (
                    <div className="h-full rounded-md bg-surface p-4 ring-1 ring-inset ring-line/10">{inner}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
