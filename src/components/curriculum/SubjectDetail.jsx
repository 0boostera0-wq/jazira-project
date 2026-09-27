"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Layers, BookOpen, ChevronRight, ClipboardCheck, Eye, Info, KeyRound, Landmark, NotebookPen, RotateCcw, Target, Users } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useLocale, useT } from "@/i18n/client";
import { useAuthUser } from "@/context/AuthProvider";
import { formatNumber } from "@/i18n/format";
import AssistantAvatar from "@/components/brand/AssistantAvatar";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import Button, { buttonClasses } from "@/components/ui/Button";
import Illustration from "@/components/ui/Illustration";
import Skeleton from "@/components/ui/Skeleton";
import { cn } from "@/components/ui/cn";
import { SubjectTile } from "./SubjectIcon";
import { ArabicName, ExternalLink } from "./parts";
import { resourcesForTerm } from "./model";
import ExamEntryPoints from "@/components/learn/ExamEntryPoints";
import ResourceList from "@/components/learn/ResourceList";
import SubjectOutline from "@/components/learn/SubjectOutline";

const OUTLINE_PREVIEW = 4; // units shown before "show all"

const TYPE_ICON = { student_book: BookOpen, activity_book: NotebookPen, exam_samples: ClipboardCheck };
const BADGE = { external_official: "green", hosted: "gold", unavailable: "neutral" };

// ── the subject's outline layer, loaded when the drawer opens ─────────────────
// The leaf page ships a summary per subject ({ node, href, units, groups,
// lessons, books }); units, lessons, "Test yourself" entries and the iEN files
// come from GET /api/content/outline (CDN-cached, memoized here for the session).
const learnPromises = new Map(); // subject node id → Promise<payload>
const learnData = new Map(); // subject node id → payload (resolved)

/** Fetch (once per session) the drawer payload of a subject node. Rejects on failure (and forgets it, so a retry refetches). */
export function loadSubjectLearn(node) {
  if (typeof node !== "string" || !node) return Promise.resolve(null);
  let p = learnPromises.get(node);
  if (!p) {
    p = fetch(`/api/content/outline?subject=${encodeURIComponent(node)}`, { headers: { Accept: "application/json" } })
      .then(async (res) => {
        if (!res.ok) throw new Error(`outline ${res.status}`);
        const data = await res.json();
        learnData.set(node, data);
        return data;
      })
      .catch((e) => {
        learnPromises.delete(node);
        throw e;
      });
    learnPromises.set(node, p);
  }
  return p;
}

/**
 * { status: "ready" | "loading" | "error" | "none", data, retry }. A subject
 * rendered with the eager shape (outline / entries / books on the subject)
 * is ready at once; a summary loads its payload on mount.
 */
function useSubjectLearn(s) {
  const eager = s.outline !== undefined || Boolean(s.learn?.entries);
  const node = eager ? null : s.learn?.node || null;
  const initial = () => {
    if (eager) return { key: null, status: "ready", data: { outline: s.outline ?? null, entries: s.learn?.entries ?? null, books: s.learn?.books ?? [] } };
    if (!node) return { key: null, status: "none", data: null };
    return learnData.has(node) ? { key: node, status: "ready", data: learnData.get(node) } : { key: node, status: "loading", data: null };
  };
  const [state, setState] = useState(initial);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!node) return;
    let alive = true;
    setState((st) => (st.key === node && st.status === "ready" ? st : { key: node, status: "loading", data: null }));
    loadSubjectLearn(node)
      .then((data) => alive && setState({ key: node, status: "ready", data }))
      .catch(() => alive && setState({ key: node, status: "error", data: null }));
    return () => {
      alive = false;
    };
  }, [node, nonce]);
  return { ...state, retry: () => setNonce((n) => n + 1) };
}

/**
 * Body of the subject drawer: plan facts → official resources and how to reach
 * them (Madrasati / iEN, school account) → what Jazira adds for this subject.
 */
export default function SubjectDetail({ subject: s, term, context, links, onView }) {
  const t = useT("curriculum");
  const tl = useT("learn");
  const tc = useT("common");
  const { locale } = useLocale();
  const [allUnits, setAllUnits] = useState(false);
  const learn = useSubjectLearn(s);
  const summary = s.learn?.node ? s.learn : null; // lazy summary (counts) while the payload loads
  const loadingLearn = learn.status === "loading";
  const outline = learn.data?.outline ?? null;
  const entries = learn.data?.entries ?? null;
  const books = learn.data?.books ?? [];
  const showOutline = outline?.units?.length > 0 || (loadingLearn && summary?.groups > 0);
  const unitCount = outline ? outline.units.filter((u) => u.id).length : summary?.units ?? 0;
  const lessonCount = outline ? outline.lessons : summary?.lessons ?? 0;
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
    termsKnown(s)
      ? { key: "terms", label: t("subject.termsLabel"), value: s.terms.map((x) => t(`terms.${x}`)).join(en ? ", " : "، "), hint: t(`subject.termsKnown.${s.terms_status}`) }
      : { key: "terms", label: t("subject.termsLabel"), value: t("subject.termsValue"), hint: t("subject.termsHint") },
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

      {/* ── Units and lessons (outline layer) ── */}
      {showOutline && (
        <section aria-labelledby="subject-outline" aria-busy={loadingLearn || undefined}>
          <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
            <h3 id="subject-outline" className="t-h4 flex items-center gap-2">
              <Layers size={18} aria-hidden="true" className="text-gold-600" />
              {t("outline.title")}
            </h3>
            <span className="t-caption tabular">
              {tl("count.units", { count: unitCount })} · {tl("count.lessons", { count: lessonCount })}
            </span>
          </div>
          <p className="t-caption mt-0.5">{t("outline.lead")}</p>
          {outline ? (
            <SubjectOutline
              outline={allUnits ? outline : { ...outline, units: outline.units.slice(0, OUTLINE_PREVIEW) }}
              t={tl}
              locale={locale}
              openFirst={0}
              className="mt-3"
            />
          ) : (
            <OutlineSkeleton rows={Math.min(summary?.groups || 1, OUTLINE_PREVIEW)} label={t("outline.loading")} />
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {outline && !allUnits && outline.units.length > OUTLINE_PREVIEW && (
              <Button size="sm" variant="ghost" onClick={() => setAllUnits(true)}>
                {t("outline.more", { count: outline.units.length })}
              </Button>
            )}
            {s.learn?.href && (
              <Button href={s.learn.href} size="sm" variant="secondary" iconEnd={ChevronRight}>
                {t("outline.open")}
              </Button>
            )}
          </div>
        </section>
      )}

      {learn.status === "error" && (
        <Alert
          tone="warning"
          title={t("outline.error")}
          action={
            <Button size="sm" variant="secondary" iconStart={RotateCcw} onClick={learn.retry}>
              {tc("actions.retry")}
            </Button>
          }
        >
          {t("outline.errorBody")}
        </Alert>
      )}

      {/* ── Test yourself (subject-level quizzes, pool rule) ── */}
      {entries && <ExamEntryPoints primary={entries.primary} related={[]} titleId={`subject-test-${s.id}`} />}

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

        {/* The subject's files on iEN: link-outs in their three states (nothing embedded). */}
        {(books.length > 0 || (loadingLearn && summary?.books > 0)) && (
          <div className="mt-5" aria-busy={loadingLearn || undefined}>
            <h4 className="text-[0.9375rem] font-medium text-ink">{t("ien.title")}</h4>
            <p className="t-caption mt-0.5">{t("ien.lead")}</p>
            {books.length > 0 ? (
              <ResourceList items={books} t={tl} locale={locale} heading={false} />
            ) : (
              <OutlineSkeleton rows={Math.min(summary.books, 3)} label={t("ien.loading")} />
            )}
          </div>
        )}
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

/** Terms backed by evidence (verified or inferred; §2.5) are shown as such; otherwise "split not published". */
const termsKnown = (s) => (s.terms_status === "verified" || s.terms_status === "inferred") && Array.isArray(s.terms) && s.terms.length > 0;

/** Placeholder rows while the drawer payload loads (the counts above come from the page's summary). */
function OutlineSkeleton({ rows, label }) {
  return (
    <div className="mt-3 space-y-2">
      <span className="sr-only" role="status">
        {label}
      </span>
      {Array.from({ length: Math.max(1, rows) }, (_, i) => (
        <div key={i} aria-hidden="true" className="flex min-h-14 items-center gap-3 rounded-md border border-line/12 px-3.5 py-3">
          <Skeleton className="h-4 w-4 shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className={cn("h-3.5", i % 2 ? "w-2/5" : "w-3/5")} />
            <Skeleton className="h-3 w-1/4" />
          </div>
        </div>
      ))}
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
