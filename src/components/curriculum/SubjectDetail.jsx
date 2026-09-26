"use client";

import { ArrowUpRight, BookOpen, ChevronRight, ClipboardCheck, Eye, Info, KeyRound, Landmark, NotebookPen, Target, Users } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useLocale, useT } from "@/i18n/client";
import { useAuthUser } from "@/context/AuthProvider";
import { formatNumber } from "@/i18n/format";
import AssistantAvatar from "@/components/brand/AssistantAvatar";
import Badge from "@/components/ui/Badge";
import Button, { buttonClasses } from "@/components/ui/Button";
import Illustration from "@/components/ui/Illustration";
import { cn } from "@/components/ui/cn";
import { SubjectTile } from "./SubjectIcon";
import { ArabicName, ExternalLink } from "./parts";
import { resourcesForTerm } from "./model";

const TYPE_ICON = { student_book: BookOpen, activity_book: NotebookPen, exam_samples: ClipboardCheck };
const BADGE = { external_official: "green", hosted: "gold", unavailable: "neutral" };

/**
 * Body of the subject drawer: plan facts → official resources and how to reach
 * them (Madrasati / iEN, school account) → what Jazira adds for this subject.
 */
export default function SubjectDetail({ subject: s, term, context, links, onView }) {
  const t = useT("curriculum");
  const { locale } = useLocale();
  const { isLoaded, isSignedIn } = useAuthUser();
  const en = locale === "en";
  const name = en ? s.name_en || s.name : s.name;
  const labels = (en ? s.labels_en : s.labels) || [];
  const resources = resourcesForTerm(s, term);
  const topic = t("assistant.topic", { subject: name, context: context.title });
  // Subjects the research flags as possibly having no printed book (PE, projects…).
  const maybeBook = (s.notes || []).includes("noTextbook");

  const facts = [
    { key: "periods", label: t("subject.periodsLabel"), value: formatNumber(s.periods, locale), hint: t("subject.periodsHint") },
    labels.length > 0 && { key: "label", label: t("subject.planLabel"), value: labels.join(en ? ", " : "، ") },
    { key: "terms", label: t("subject.termsLabel"), value: t("subject.termsValue"), hint: t("subject.termsHint") },
  ].filter(Boolean);

  const study = [
    s.practice && {
      key: "practice",
      href: s.practice.href,
      icon: <Tile tone="gold"><Target size={18} /></Tile>,
      title: t("practice.title"),
      body: t("practice.sub", { exam: t(`practice.exams.${s.practice.exam}`), section: t(`practice.sections.${s.practice.section}`) }),
    },
    {
      key: "assistant",
      href: `/assistant?topic=${encodeURIComponent(topic.slice(0, 120))}`,
      icon: <AssistantAvatar size={40} />,
      title: t("assistant.title"),
      body: t("assistant.body"),
      // Only guests are told the assistant needs an account.
      badge: isLoaded && !isSignedIn ? t("assistant.signIn") : null,
    },
    s.tag && {
      key: "community",
      href: `/tags/${encodeURIComponent(s.tag)}`,
      icon: <Tile tone="green"><Users size={18} /></Tile>,
      title: t("community.title"),
      // First-strong isolate: an Arabic hashtag keeps its "#" in place inside English copy.
      body: t("community.body", { tag: `\u2068#${s.tag}\u2069` }),
    },
  ].filter(Boolean);

  return (
    <div className="space-y-7">
      {/* ── What the plan says ── */}
      <div className="flex items-start gap-4">
        <SubjectTile subject={s} size="lg" className="hidden xs:inline-grid" />
        <div className="min-w-0 flex-1">
          {en && (
            <p className="t-caption mb-3">
              {t("subject.officialName")}: <ArabicName className="font-medium text-ink-2">{s.name}</ArabicName>
            </p>
          )}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
            {facts.map((f) => (
              <div key={f.key} className="min-w-0">
                <dt className="t-caption">{f.label}</dt>
                <dd className="mt-0.5 text-[0.9375rem] font-medium text-ink tabular">{f.value}</dd>
                {f.hint && <dd className="t-caption text-ink-3">{f.hint}</dd>}
              </div>
            ))}
          </dl>
        </div>
        {s.art && (
          <div aria-hidden="true" className="art-frame hidden w-36 shrink-0 rounded-md sm:block">
            <Illustration id={s.art} aspect="1/1" sizes="144px" />
          </div>
        )}
      </div>

      {s.notes?.length > 0 && (
        <ul className="space-y-2">
          {s.notes.map((n) => (
            <li key={n} className="flex gap-2.5 rounded-md bg-surface-2/70 px-3.5 py-2.5">
              <Info size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-ink-3" />
              {n === "electiveOptions" ? <ElectiveNote t={t} options={context.electiveOptions} en={en} /> : <span className="t-small text-ink-2">{t(`notes.${n}`)}</span>}
            </li>
          ))}
        </ul>
      )}

      {/* ── Official resources ── */}
      <section aria-labelledby="subject-resources">
        <h3 id="subject-resources" className="t-h4">{t("subject.resourcesTitle")}</h3>
        <ul className="mt-2 divide-y divide-line/10">
          {resources.map((r) => {
            const Icon = TYPE_ICON[r.type] || BookOpen;
            const maybe = maybeBook && r.type !== "exam_samples" && r.availability === "external_official";
            return (
              <li key={r.type} className="flex items-start gap-3 py-3.5">
                <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-sm bg-surface-2 text-ink-2 ring-1 ring-inset ring-line/10">
                  <Icon size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="font-medium text-ink">{t(`resources.types.${r.type}.title`)}</p>
                    <Badge size="sm" tone={maybe ? "neutral" : BADGE[r.availability]}>{t(`resources.availability.${maybe ? "maybe" : r.availability}`)}</Badge>
                  </div>
                  <p className="t-small mt-0.5 text-ink-3">
                    {r.availability === "hosted" ? t("resources.hostedBody") : maybe ? t("resources.maybeBody") : t(`resources.types.${r.type}.body`)}
                  </p>
                  {r.hosted.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {r.hosted.map((h) => (
                        <Button key={h.key} size="sm" variant="secondary" iconStart={Eye} onClick={() => onView?.({ ...h, label: [t(`resources.types.${r.type}.title`), name, t(`terms.${h.term}`)].join(" · ") })}>
                          {t("resources.view", { term: t(`terms.${h.term}`) })}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        <p className="t-caption mt-1">{t("resources.caveat")}</p>

        {/* How to reach the official books (outbound, new tab, no referrer). */}
        <div className="mt-4 rounded-md border border-line/10 bg-surface-2/60 p-3.5 sm:p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            <a
              href={links.madrasati}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClasses({ variant: "secondary", size: "md", className: "justify-between gap-3 sm:min-w-[15rem]" })}
            >
              <span className="flex min-w-0 items-center gap-2">
                <Landmark size={17} aria-hidden="true" className="shrink-0 text-green-700" />
                <span className="truncate">{t("channels.madrasati")}</span>
              </span>
              <ArrowUpRight size={16} aria-hidden="true" className="shrink-0 text-ink-3 flip-rtl" />
              <span className="sr-only">({t("channels.newTab")})</span>
            </a>
            <ExternalLink href={links.ien} newTabLabel={t("channels.newTab")} className="min-h-11 self-start text-sm font-medium text-ink-3 hover:text-ink sm:self-auto">
              {t("channels.ien")}
            </ExternalLink>
          </div>
          <p className="t-caption mt-2.5 flex items-start gap-2">
            <KeyRound size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-ink-3" />
            <span>
              {t("channels.account")} {t("channels.noDeepLinks")}
            </span>
          </p>
        </div>
      </section>

      {/* ── Jazira value ── */}
      <section aria-labelledby="subject-study">
        <h3 id="subject-study" className="t-h4">{t("subject.studyTitle")}</h3>
        <ul className="mt-3 grid gap-2">
          {study.map((it) => (
            <li key={it.key}>
              <Link
                href={it.href}
                className="group flex min-h-[4.25rem] items-center gap-3.5 rounded-md border border-line/15 bg-surface px-3.5 py-3 transition-[border-color,background-color] duration-fast hover:border-line/25 hover:bg-surface-2/60"
              >
                <span aria-hidden="true" className="shrink-0">{it.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="font-medium text-ink">{it.title}</span>
                    {it.badge && <span className="inline-flex h-5 items-center rounded-full bg-surface-2 px-2 text-xs text-ink-3">{it.badge}</span>}
                  </span>
                  <span className="t-small line-clamp-2 block break-words text-ink-3">{it.body}</span>
                </span>
                <ChevronRight size={18} aria-hidden="true" className="shrink-0 text-ink-4 transition-colors group-hover:text-ink-2 flip-rtl" />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Tile({ tone, children }) {
  return (
    <span
      className={cn(
        "grid h-10 w-10 place-items-center rounded-md ring-1 ring-inset",
        tone === "green" ? "bg-green-50 text-green-700 ring-green-100" : "bg-gold-50 text-gold-700 ring-gold-200/60"
      )}
    >
      {children}
    </span>
  );
}

function ElectiveNote({ t, options, en }) {
  const groups = [
    ["inPerson", options?.inPerson || []],
    ["selfPaced", options?.selfPaced || []],
  ];
  return (
    <div className="min-w-0 flex-1">
      <p className="t-small font-medium text-ink-2">{t("notes.electiveOptions.title")}</p>
      <dl className="mt-1.5 space-y-1.5">
        {groups.map(([k, list]) => (
          <div key={k}>
            <dt className="t-caption font-medium">{t(`notes.electiveOptions.${k}`)}</dt>
            <dd className="t-small text-ink-3">{list.map(([ar, enName]) => (en ? enName : ar)).join(" · ")}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
