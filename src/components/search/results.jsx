"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpen, ChevronRight, ClipboardCheck, GraduationCap, Hash, Heart, Layers, Library, ListChecks, MessageCircle, Route } from "lucide-react";
import { useLocale, useT } from "@/i18n/client";
import { formatNumber } from "@/i18n/format";
import { createContentSearcher, searchContent } from "@/lib/data/search";
import { Link } from "@/i18n/navigation";
import { formatRelative } from "@/i18n/format";
import { cn } from "@/components/ui/cn";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import { SubjectTile } from "@/components/curriculum/SubjectIcon";
import AuthorAvatar from "@/components/community/AuthorAvatar";
import { textProps } from "@/components/community/text";
import EliteBadge from "@/components/subscriptions/EliteBadge";
import Highlight from "./Highlight";
import SectionTile from "./SectionTile";
import {
  CONTENT_PAGE, CONTENT_PREVIEW, CONTENT_SEARCH_GROUPS, contentCount, contentHasMore, contentHref, contentKey, countLabel, postAuthor, questionHref,
} from "./model";

// Result rows. Every row is a real link carrying `data-result`, so ↑/↓ can
// move focus through them and Enter / middle-click behave natively.
// cn() only joins classes (no merging), so the alignment / padding variants are separate constants.
const ROW_BASE =
  "group flex min-h-[3.5rem] gap-3 rounded-md px-3 outline-none transition-colors duration-fast " +
  "hover:bg-surface-2 focus-visible:bg-surface-2";
const ROW = `${ROW_BASE} items-center py-2.5`;
const ROW_TOP = `${ROW_BASE} items-start py-3`; // multi-line rows: avatar / tile aligned with the first line

const Chevron = () => (
  <ChevronRight size={16} aria-hidden="true" className="flip-rtl shrink-0 text-ink-4 transition-colors duration-fast group-hover:text-ink-2" />
);

const Dot = () => <span aria-hidden="true" className="text-ink-4">·</span>;

/** Group heading + surface. `stale` dims results that belong to the previous query. */
export function Group({ id, icon: Icon, title, count, onViewAll, viewAllLabel, stale = false, bare = false, children }) {
  return (
    <section aria-labelledby={id} className="animate-fade">
      <div className="mb-2.5 flex min-h-8 items-center justify-between gap-3 px-1">
        <h2 id={id} className="flex min-w-0 items-center gap-2 text-[0.9375rem] font-bold text-ink">
          {Icon && <Icon size={16} aria-hidden="true" className="shrink-0 text-gold-600" />}
          <span className="truncate">{title}</span>
          {count != null && (
            <span className="rounded-full bg-surface-3/80 px-1.5 text-xs font-medium leading-5 text-ink-3 tabular">{count}</span>
          )}
        </h2>
        {onViewAll && (
          <button
            type="button"
            onClick={onViewAll}
            className="inline-flex h-11 shrink-0 items-center gap-1 rounded-full px-3 text-sm font-medium text-gold-600 transition-colors hover:bg-gold-50 sm:h-8 sm:px-2"
          >
            {viewAllLabel}
            <ChevronRight size={15} aria-hidden="true" className="flip-rtl" />
          </button>
        )}
      </div>
      <div className={cn(!bare && "surface overflow-hidden", "transition-opacity duration", stale && "opacity-55")} aria-busy={stale || undefined}>
        {children}
      </div>
    </section>
  );
}

/** Placeholder rows while a group loads for the first time. */
export function GroupSkeleton({ id, icon, title, loadingLabel, rows = 2, variant = "row" }) {
  return (
    <Group id={id} icon={icon} title={title}>
      <span className="sr-only">{loadingLabel}</span>
      <ul aria-hidden="true" className="p-1.5">
        {Array.from({ length: rows }, (_, i) => (
          <li key={i} className={cn("flex gap-3 px-3 py-3", variant === "post" ? "items-start" : "items-center")}>
            <Skeleton rounded={variant === "person" || variant === "post" ? "full" : "sm"} className="h-9 w-9 shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className={cn("h-3.5", i % 2 ? "w-2/5" : "w-3/5")} />
              <Skeleton className="h-3 w-1/3" />
              {variant === "post" && <Skeleton className="h-3 w-4/5" />}
            </div>
          </li>
        ))}
      </ul>
    </Group>
  );
}

export const RowList = ({ children, className }) => <ul className={cn("divide-y divide-line/8 p-1.5", className)}>{children}</ul>;

// ── curriculum ──────────────────────────────────────────────────────────────
const NODE_ICONS = { stage: Library, grade: GraduationCap, track: Route };

export function CurriculumRow({ e, q, locale, t }) {
  const label = locale === "en" ? e.en : e.ar;
  const trail = (locale === "en" ? e.trailEn : e.trailAr).join(" · ");
  const NodeIcon = NODE_ICONS[e.kind] || GraduationCap;
  return (
    <li>
      <Link href={e.href} data-result className={ROW}>
        {e.kind === "subject" ? (
          <SubjectTile subject={{ id: e.subjectId, icon: e.icon, color: e.color }} size="sm" />
        ) : (
          <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-sm bg-surface-2 text-ink-2 ring-1 ring-inset ring-line/10">
            <NodeIcon size={16} />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.9375rem] font-medium text-ink">
            <Highlight text={label} query={q} />
          </span>
          <span className="t-caption flex min-w-0 items-center gap-1.5">
            <span className="shrink-0">{t(`kinds.${e.kind}`)}</span>
            {trail && (
              <>
                <Dot />
                <span className="truncate">
                  <Highlight text={trail} query={q} />
                </span>
              </>
            )}
          </span>
        </span>
        {e.pending && (
          <Badge size="sm" tone="warning" className="shrink-0">
            {t("results.pending")}
          </Badge>
        )}
        <Chevron />
      </Link>
    </li>
  );
}

/**
 * One subject/grade name found in several places ("Mathematics" in 16 grades):
 * a single row that opens the Curriculum tab, where every place is listed.
 */
export function CurriculumClusterRow({ c, q, locale, t, onOpen }) {
  const e = c.first;
  const label = locale === "en" ? e.en : e.ar;
  const NodeIcon = NODE_ICONS[e.kind] || GraduationCap;
  return (
    <li>
      <button type="button" data-result onClick={onOpen} className={cn(ROW, "w-full text-start")}>
        {e.kind === "subject" ? (
          <SubjectTile subject={{ id: e.subjectId, icon: e.icon, color: e.color }} size="sm" />
        ) : (
          <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-sm bg-surface-2 text-ink-2 ring-1 ring-inset ring-line/10">
            <NodeIcon size={16} />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.9375rem] font-medium text-ink">
            <Highlight text={label} query={q} />
          </span>
          <span className="t-caption flex min-w-0 items-center gap-1.5">
            <span className="shrink-0">{t(`kinds.${e.kind}`)}</span>
            <Dot />
            <span className="truncate">{c.stages.map((s) => t(`stagesShort.${s}`)).join(locale === "en" ? ", " : "، ")}</span>
          </span>
        </span>
        <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-ink-3 ring-1 ring-inset ring-line/10">
          {t("status.count", { count: c.entries.length })}
        </span>
        <Chevron />
      </button>
    </li>
  );
}

// ── practice (exam catalog) & bank questions ────────────────────────────────
export function PracticeRow({ e, q, locale, t, labels }) {
  const label = locale === "en" ? e.en : e.ar;
  const section = labels.section(e.section);
  const type = labels.type(e.exam);
  return (
    <li>
      <Link href={e.href} data-result className={ROW}>
        <SectionTile section={e.section} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.9375rem] font-medium text-ink">
            <Highlight text={label} query={q} />
          </span>
          <span className="t-caption flex min-w-0 items-center gap-1.5">
            <span className="shrink-0">{t(`kinds.${e.kind}`)}</span>
            <Dot />
            <span className="truncate">{e.kind === "topic" ? `${section} · ${type}` : type}</span>
          </span>
        </span>
        <span className="hidden shrink-0 rounded-full bg-gold-50 px-2.5 py-1 text-[0.8125rem] font-medium text-gold-700 ring-1 ring-inset ring-gold-200/60 sm:inline-block">
          {t("results.practiceCta")}
        </span>
        <Chevron />
      </Link>
    </li>
  );
}

export function QuestionRow({ item, q, labels }) {
  const topic = item.topic ? labels.topic(item.topic) : null;
  return (
    <li>
      <Link href={questionHref(item)} data-result className={ROW_TOP}>
        <SectionTile section={item.section} />
        <span className="min-w-0 flex-1">
          <span {...textProps(item.snippet, "line-clamp-2 text-[0.9375rem] leading-relaxed text-ink")}>
            <Highlight text={item.snippet} query={q} />
          </span>
          <span className="mt-1.5 flex flex-wrap gap-1.5">
            <Badge size="sm">{labels.section(item.section)}</Badge>
            {topic && (
              <Badge size="sm" tone="outline">
                {topic}
              </Badge>
            )}
          </span>
        </span>
        <span className="self-center">
          <Chevron />
        </span>
      </Link>
    </li>
  );
}

// ── community ───────────────────────────────────────────────────────────────
export function PersonRow({ p, q }) {
  const name = p.full_name || p.username;
  const elite = Boolean(p.is_elite) && p.show_elite_badge !== false;
  return (
    <li>
      <Link href={`/u/${encodeURIComponent(p.username)}`} data-result className={ROW}>
        <AuthorAvatar author={{ name, avatar: p.avatar_url }} size={40} />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <span {...textProps(name, "truncate text-[0.9375rem] font-medium text-ink")}>
              <Highlight text={name} query={q} />
            </span>
            {elite && <EliteBadge size="xs" iconOnly />}
          </span>
          <span className="t-caption block truncate">
            <span dir="ltr" className="ltr">
              @<Highlight text={p.username} query={q} />
            </span>
          </span>
        </span>
        <Chevron />
      </Link>
    </li>
  );
}

export function PostRow({ post, q, locale, t }) {
  const a = postAuthor(post);
  const name = a.anonymous ? t(a.mine ? "results.anonymousYou" : "results.anonymous") : a.name;
  return (
    <li>
      <Link href={`/community/post/${encodeURIComponent(post.id)}`} data-result className={ROW_TOP}>
        <AuthorAvatar author={a.anonymous ? null : { name: a.name, avatar: a.avatar }} size={36} />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5 text-sm">
            <span {...(a.anonymous ? { className: "truncate font-medium text-ink-2" } : textProps(name, "truncate font-medium text-ink"))}>{name}</span>
            {a.elite && <EliteBadge size="xs" iconOnly />}
            {post.created_at && (
              <>
                <Dot />
                <time dateTime={post.created_at} className="t-caption shrink-0">
                  {formatRelative(post.created_at, locale)}
                </time>
              </>
            )}
          </span>
          <span {...textProps(post.snippet, "mt-1 line-clamp-3 block text-[0.9375rem] leading-relaxed text-ink-2")}>
            <Highlight text={post.snippet} query={q} />
          </span>
          <span className="t-caption mt-2 flex items-center gap-4">
            <span className="inline-flex items-center gap-1">
              <Heart size={13} aria-hidden="true" />
              {t("results.likes", { count: Number(post.likes_count) || 0 })}
            </span>
            <span className="inline-flex items-center gap-1">
              <MessageCircle size={13} aria-hidden="true" />
              {t("results.comments", { count: Number(post.comments_count) || 0 })}
            </span>
          </span>
        </span>
      </Link>
    </li>
  );
}

export function TagChip({ tag, q, tc }) {
  return (
    <li>
      <Link
        href={`/tags/${encodeURIComponent(tag.tag)}`}
        data-result
        className="inline-flex h-10 max-w-full items-center gap-2 rounded-full border border-line/15 bg-surface px-3.5 text-sm outline-none transition-colors duration-fast hover:border-gold-300 hover:bg-gold-50 focus-visible:bg-gold-50"
      >
        <Hash size={14} aria-hidden="true" className="shrink-0 text-gold-600" />
        <span {...textProps(tag.tag, "truncate font-medium text-ink")}>
          <Highlight text={tag.tag} query={q} />
        </span>
        <span className="t-caption shrink-0 tabular">{tc("units.posts", { count: Number(tag.post_count) || 0 })}</span>
      </Link>
    </li>
  );
}

// ── app pages ───────────────────────────────────────────────────────────────
export function PageChip({ page, q }) {
  const Icon = page.icon;
  return (
    <li>
      <Link
        href={page.href}
        data-result
        className="inline-flex h-10 items-center gap-2 rounded-full border border-line/15 bg-surface px-3.5 text-sm font-medium text-ink shadow-xs outline-none transition-colors duration-fast hover:border-line/25 hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:[box-shadow:var(--ring)]"
      >
        {Icon && <Icon size={16} aria-hidden="true" className="shrink-0 text-ink-3" />}
        <Highlight text={page.label} query={q} />
      </Link>
    </li>
  );
}


// ── content: lessons, units, books, quizzes (docs/CONTENT_ENGINE.md §7) ─────
const CONTENT_ICONS = { node: Layers, exam: ClipboardCheck, resource: BookOpen, question: ListChecks };
const TILE = "grid h-8 w-8 shrink-0 place-items-center rounded-sm bg-surface-2 text-ink-2 ring-1 ring-inset ring-line/10";

/** Arabic content (titles from the official listing) inside either UI language. */
const Ar = ({ children, className }) => (
  <span lang="ar" dir="rtl" className={cn("font-ar", className)}>
    {children}
  </span>
);

/** One content result: a single internal link to its learn page (/learn/…), never a stem. */
export function ContentRow({ group, item, q, t, locale }) {
  const href = contentHref(group, item);
  if (!href) return null;
  const Icon = CONTENT_ICONS[group] || Layers;
  const en = locale === "en";
  const english = en && group !== "question" && Boolean(item.title_en);
  const title = english ? item.title_en : item.title || "";
  const subject = en && item.subject_title_en ? item.subject_title_en : item.subject_title;
  const place = en ? item.place_en : item.place;
  let label;
  if (group === "node") label = t(`content.kinds.${item.kind}`);
  else if (group === "exam") label = t(`content.templates.${item.template || item.kind}`);
  else if (group === "resource") label = t(`content.resourceKinds.${item.kind || "other"}`);
  else label = t("content.published", { count: Number(item.count) || 0 });
  const meta = [
    group === "resource" && Number.isInteger(item.part) ? t("content.part", { part: formatNumber(item.part, locale) }) : null,
    group === "exam" && Number(item.count) > 0 ? t("content.published", { count: Number(item.count) }) : null,
  ].filter(Boolean);
  const context = [item.parent_title, subject, place].filter(Boolean);
  return (
    <li>
      <Link href={href} data-result className={ROW}>
        <span aria-hidden="true" className={TILE}>
          <Icon size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.9375rem] font-medium text-ink">
            {english ? (
              <Highlight text={title} query={q} />
            ) : (
              <Ar>
                <Highlight text={title} query={q} />
              </Ar>
            )}
          </span>
          <span className="t-caption flex min-w-0 items-center gap-1.5">
            <span className="shrink-0">{label}</span>
            {meta.map((m) => (
              <span key={m} className="flex shrink-0 items-center gap-1.5">
                <Dot />
                <span className="tabular">{m}</span>
              </span>
            ))}
            {context.length > 0 && (
              <>
                <Dot />
                <span className="truncate">{context.join(" · ")}</span>
              </>
            )}
          </span>
        </span>
        {group === "resource" && item.url && (
          <Badge size="sm" tone="green" className="hidden shrink-0 sm:inline-flex">
            {t("content.onIen")}
          </Badge>
        )}
        <Chevron />
      </Link>
    </li>
  );
}

const IDLE_CONTENT = { query: "", status: "idle", data: null };

/**
 * Lessons, units, quizzes and official books for a query — a self-contained
 * island (debounced 250 ms, stale requests cancelled, queries under 2 chars
 * never sent). Signed-in users also get lesson-level question counts (never
 * stems); guests go through the rate-limited /api/content/search.
 *   query: the (deferred) search text · mode: "preview" (a few rows per group,
 *   "view all" → onViewAll) or "full" (every group with "show more" paging)
 *   idBase: unique id prefix for the group headings
 */
export function ContentSearchGroups({ query, mode = "preview", idBase = "content", onViewAll = null }) {
  const t = useT("search");
  const { locale } = useLocale();
  const limit = mode === "full" ? CONTENT_PAGE : Math.max(...Object.values(CONTENT_PREVIEW));
  const searcher = useRef(null);
  if (!searcher.current) searcher.current = createContentSearcher({ limit });
  const [state, setState] = useState(IDLE_CONTENT);
  const [extra, setExtra] = useState({}); // group → { rows, loading, error } ("show more" pages)

  useEffect(() => {
    let alive = true;
    setExtra({});
    setState((prev) => ({ query, status: "loading", data: prev.data }));
    searcher.current
      .search(query)
      .then((data) => {
        if (!alive) return;
        const empty = !data.groups || !Object.keys(data.groups).length;
        setState({ query, status: data.available === false ? "unavailable" : empty ? "idle" : "ready", data: empty ? null : data });
      })
      .catch((e) => {
        if (alive && e?.code !== "aborted") setState({ query, status: "error", data: null });
      });
    return () => {
      alive = false;
    };
  }, [query]);
  useEffect(() => () => searcher.current?.cancel(), []);

  async function more(group) {
    const loaded = (state.data?.groups?.[group]?.items?.length || 0) + (extra[group]?.rows?.length || 0);
    setExtra((x) => ({ ...x, [group]: { rows: x[group]?.rows || [], loading: true, error: false } }));
    try {
      const res = await searchContent(query, { kinds: [group], limit: CONTENT_PAGE, offset: loaded });
      setExtra((x) => ({ ...x, [group]: { rows: [...(x[group]?.rows || []), ...(res.groups?.[group]?.items || [])], loading: false, error: false } }));
    } catch {
      setExtra((x) => ({ ...x, [group]: { rows: x[group]?.rows || [], loading: false, error: true } }));
    }
  }

  if (state.status === "idle") return null;
  if (state.status === "error") return <p role="alert" className="t-small px-1 text-ink-3">{t("content.error")}</p>;
  if (state.status === "unavailable") return <p className="t-caption px-1">{t("content.unavailable")}</p>;
  if (state.status === "loading" && !state.data) {
    return <GroupSkeleton id={`${idBase}-loading`} icon={Layers} title={t("content.groups.node")} loadingLabel={t("content.loading")} rows={3} />;
  }
  const data = state.data;
  const stale = state.status === "loading";
  const groups = CONTENT_SEARCH_GROUPS.filter((g) => (data?.groups?.[g]?.items?.length || 0) > 0);
  if (!groups.length) return null;
  return (
    <div className="space-y-7">
      {groups.map((g) => {
        const c = contentCount(data, g);
        const rows = [...data.groups[g].items, ...(extra[g]?.rows || [])];
        const shown = mode === "full" ? rows : rows.slice(0, CONTENT_PREVIEW[g]);
        const canMore = mode === "full" && contentHasMore(data, g, rows.length);
        const hidden = mode !== "full" && c && c.n > shown.length;
        return (
          <Group
            key={g}
            id={`${idBase}-${g}`}
            icon={CONTENT_ICONS[g]}
            title={t(`content.groups.${g}`)}
            count={c ? countLabel(formatNumber(c.n, locale), c.capped) : null}
            stale={stale}
            {...(hidden && onViewAll ? { onViewAll, viewAllLabel: t("viewAll", { count: formatNumber(c.n, locale) }) } : {})}
          >
            <RowList>
              {shown.map((item) => (
                <ContentRow key={contentKey(g, item)} group={g} item={item} q={query} t={t} locale={locale} />
              ))}
            </RowList>
            {canMore && (
              <div className="border-t border-line/8 p-1.5">
                <button
                  type="button"
                  onClick={() => more(g)}
                  disabled={extra[g]?.loading}
                  aria-busy={extra[g]?.loading || undefined}
                  className="inline-flex h-11 w-full items-center justify-center rounded-md text-sm font-medium text-gold-600 transition-colors hover:bg-gold-50 disabled:opacity-60 sm:h-9"
                >
                  {t("content.more")}
                </button>
                {extra[g]?.error && (
                  <p role="alert" className="t-caption px-2 pb-1 text-danger">
                    {t("content.moreError")}
                  </p>
                )}
              </div>
            )}
          </Group>
        );
      })}
    </div>
  );
}
