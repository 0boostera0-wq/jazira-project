import { Info, Layers } from "lucide-react";
import Messages from "@/i18n/WithMessages";
import { HeaderTopRow } from "@/components/curriculum/NodeHeader";
import Badge from "@/components/ui/Badge";
import ExamEntryPoints from "./ExamEntryPoints";
import ContentText from "./ContentText";
import LessonView from "./LessonView";
import ResourceList from "./ResourceList";
import SubjectOutline from "./SubjectOutline";
import { TermBadge } from "./ResourceState";

// Server component: /learn/<subject>[/<unit|lesson>] (§7). model = learnPageModel();
// t = getT("learn"), tc = getT("common"). The only client island is
// ExamEntryPoints (tier + start); everything else is static HTML.

// First-strong isolates keep Arabic titles readable inside English crumbs.
const isolate = (s) => `⁨${s}⁩`;
const nameOf = (n, locale) => (locale === "en" && n.title_en ? n.title_en : n.title);

export default function LearnView({ model, t, tc, locale }) {
  const { node, subject } = model;
  const crumbs = [
    { label: t("root"), href: "/curriculum" },
    ...model.trail.map((n) => ({ label: isolate(nameOf(n, locale)), href: n.href || undefined })),
  ];
  const kindLabel = t(`kinds.${node.kind}`);
  const eyebrow = node.kind === "subject" ? t("subject.eyebrow") : `${kindLabel} · ${nameOf(subject, locale)}`;
  const lead =
    node.kind === "subject"
      ? t("subject.lead", { units: t("count.units", { count: model.counts.units }), lessons: t("count.lessons", { count: model.counts.lessons }) })
      : node.kind === "lesson"
        ? null
        : t("count.lessons", { count: model.outline?.lessons ?? 0 });

  return (
    <div className="pb-6">
      <HeaderTopRow crumbs={crumbs} crumbsLabel={tc("a11y.breadcrumb")} />

      <header className="animate-in mt-5 min-w-0 sm:mt-7">
        <p className="t-eyebrow">{eyebrow}</p>
        <h1 className="t-h1 mt-2 max-w-[32ch] break-words">
          <ContentText text={node.title} textEn={node.title_en} locale={locale} />
        </h1>
        {lead && <p className="t-lead mt-3 max-w-[42rem]">{lead}</p>}
        {node.kind !== "subject" && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <TermBadge badge={model.term} t={t} size="md" />
            {node.status !== "verified" && (
              <Badge tone="warning" icon={Info}>
                {t("lesson.review")}
              </Badge>
            )}
          </div>
        )}
      </header>

      <div className="mt-8 grid gap-8 sm:mt-10 xl:grid-cols-12">
        <div className="min-w-0 xl:col-span-8">
          {node.kind === "lesson" ? (
            <LessonView model={model} t={t} locale={locale} />
          ) : (
            <section aria-labelledby="learn-outline">
              <h2 id="learn-outline" className="t-h3 flex items-center gap-2">
                <Layers size={20} aria-hidden="true" className="text-gold-600" />
                {node.kind === "subject" ? t("subject.outlineTitle") : t("unit.lessonsTitle")}
              </h2>
              <p className="t-caption mt-0.5">{t("subject.outlineLead")}</p>
              <SubjectOutline outline={model.outline} t={t} locale={locale} openFirst={node.kind === "subject" ? 1 : 99} className="mt-4" />
            </section>
          )}
        </div>

        <aside className="grid content-start gap-4 md:grid-cols-2 xl:col-span-4 xl:grid-cols-1">
          <div className="surface p-4 sm:p-5">
            <Messages ns={["learn.entry", "learn.term"]}>
              <ExamEntryPoints primary={model.entries.primary} related={model.entries.related} titleId="learn-test" />
            </Messages>
          </div>
          <div className="surface p-4 sm:p-5">
            <ResourceList items={model.resources} t={t} locale={locale} titleId="learn-resources" />
          </div>
        </aside>
      </div>
    </div>
  );
}
