"use client";

import { useCallback, useDeferredValue, useEffect, useId, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Bell, ClipboardCheck, Compass, Hash, History, Info, Library, MessageSquareHeart, MessagesSquare, RotateCcw, Sparkles, Star, UserRound, Users,
} from "lucide-react";
import { useLocale, useT } from "@/i18n/client";
import { localizeHref } from "@/i18n/navigation";
import { formatNumber } from "@/i18n/format";
import { useAuthUser } from "@/context/AuthProvider";
import { APP_NAV } from "@/lib/nav";
import { NAV_ICONS } from "@/components/shell/icons";
import { debounce } from "@/lib/data/search";
import { loadCurriculumIndex, normalizeText, searchCurriculum } from "@/lib/search/curriculum-index";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Illustration from "@/components/ui/Illustration";
import { cn } from "@/components/ui/cn";
import SearchLayout from "./SearchLayout";
import SearchField from "./SearchField";
import SearchTabs from "./SearchTabs";
import RecentSearches from "./RecentSearches";
import { useRecentSearches } from "./useRecentSearches";
import { useSearchApi } from "./api";
import {
  CurriculumClusterRow, CurriculumRow, Group, GroupSkeleton, PageChip, PersonRow, PostRow, PracticeRow, QuestionRow, RowList, TagChip,
} from "./results";
import {
  ALL_TAB_LIMITS, CURRICULUM_PAGE, REMOTE_LIMIT, TABS, buildPagesIndex, buildPracticeIndex, cleanQuery, clusterCurriculum, countLabel, groupByStage,
  hasMoreRows, linkablePeople, parseTab, searchHref, searchKey, searchLocal, tabCounts,
} from "./model";

// Pages beyond the sidebar that are worth jumping to (labels: nav.items.*).
const EXTRA_PAGES = [
  { key: "examHistory", href: "/exams/history", icon: History, auth: true },
  { key: "notifications", href: "/notifications", icon: Bell, auth: true },
  { key: "profile", href: "/profile", icon: UserRound, auth: true },
  { key: "about", href: "/about", icon: Info },
  { key: "reviews", href: "/reviews", icon: Star },
  { key: "feedback", href: "/feedback", icon: MessageSquareHeart },
];

const GROUP_ICONS = {
  pages: Compass, curriculum: Library, practice: ClipboardCheck, questions: Sparkles, people: Users, posts: MessagesSquare, tags: Hash,
};

const IDLE_REMOTE = { status: "idle", data: null, query: "", code: null };
const IDLE_MORE = { key: "", rows: [], loaded: 0, loading: false, error: false };

// A query inside a sentence ("No results for “…”"): bidi-isolated (FSI … PDI)
// so an Arabic query in English copy (or the reverse) keeps its punctuation.
const isolate = (text) => `⁨${text}⁩`;

/** Unique rows by key (a later page can repeat a row when results shift). */
const uniqueBy = (rows, key) => {
  const seen = new Set();
  return rows.filter((r) => {
    const k = r && key(r);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};
const ROW_KEY = { people: (p) => p.id, posts: (p) => p.id, tags: (x) => x.tag, questions: (x) => x.id };

/**
 * Warning with a retry. ui/Alert keeps its action in a side column, which
 * squeezes the text on phones — there the button moves under the message.
 */
function RetryAlert({ title, children, retryLabel, onRetry }) {
  const button = (className) => (
    <Button variant="secondary" size="sm" iconStart={RotateCcw} onClick={onRetry} className={className}>
      {retryLabel}
    </Button>
  );
  return (
    <Alert tone="warning" title={title} action={button("hidden sm:inline-flex")}>
      {children}
      <div className="mt-3 sm:hidden">{button()}</div>
    </Alert>
  );
}

const coarsePointer = () => {
  try {
    return window.matchMedia("(pointer: coarse)").matches;
  } catch {
    return false;
  }
};

/**
 * /search — the client island. Owns the query (synced to ?q= with
 * history.replaceState while typing), the tabs, keyboard navigation and the
 * recent-search history. Local groups (curriculum, practice catalog, pages)
 * answer instantly; the database groups (search_all) are debounced, cancel
 * stale requests and keep the previous results on screen while loading.
 */
export default function SearchExperience({ header, railStatic, idle, suggest, practice }) {
  const t = useT("search");
  const tc = useT("common");
  const tn = useT("nav");
  const { locale } = useLocale();
  const { isLoaded: authLoaded, isSignedIn } = useAuthUser();
  const api = useSearchApi();
  const uid = useId().replace(/:/g, "");
  const params = useSearchParams();
  const urlQ = cleanQuery(params.get("q") || "");
  const urlTab = parseTab(params.get("tab"));

  const [query, setQuery] = useState(urlQ);
  const [tab, setTab] = useState(urlTab);
  const [curr, setCurr] = useState({ status: "loading", index: [] });
  const [remote, setRemote] = useState(IDLE_REMOTE);
  const [retry, setRetry] = useState(0);
  const [currLimit, setCurrLimit] = useState(CURRICULUM_PAGE);
  const [more, setMore] = useState(IDLE_MORE); // "show more" pages of one remote tab
  const recent = useRecentSearches();

  const inputRef = useRef(null);
  const regionRef = useRef(null);
  const anchorRef = useRef(null);
  const stickyRef = useRef(null);
  const lastWritten = useRef(searchKey(urlQ, urlTab));
  const searcherRef = useRef(null);
  const knownUnavailable = useRef(false);
  if (!searcherRef.current) searcherRef.current = api.createSearcher({ limit: REMOTE_LIMIT });

  const q = cleanQuery(query);
  const active = normalizeText(q).length >= 2;
  const dq = useDeferredValue(q);

  // ── curriculum index (its own chunk, loaded once; retried on failure) ──────
  const [currRetry, setCurrRetry] = useState(0);
  useEffect(() => {
    let alive = true;
    setCurr((c) => (c.status === "error" ? { status: "loading", index: [] } : c));
    loadCurriculumIndex()
      .then((index) => alive && setCurr({ status: "ready", index }))
      .catch(() => alive && setCurr({ status: "error", index: [] }));
    return () => {
      alive = false;
    };
  }, [currRetry]);

  // ── remember the search a visitor arrived with (e.g. from Ctrl K) ──────────
  const addRecent = recent.add;
  useEffect(() => {
    if (urlQ) addRecent(urlQ);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── URL → state (back/forward, "search everything" from the palette) ───────
  useEffect(() => {
    const key = searchKey(urlQ, urlTab);
    if (key === lastWritten.current) return;
    // Next.js mirrors our own replaceState writes into useSearchParams inside a
    // transition, so an older write can arrive after a newer one. If the
    // address bar already shows our latest write, this is such a late echo —
    // applying it would wipe what was typed since.
    const live = new URLSearchParams(window.location.search);
    if (searchKey(live.get("q"), live.get("tab")) === lastWritten.current) return;
    lastWritten.current = key;
    setQuery(urlQ);
    setTab(urlTab);
    if (urlQ) addRecent(urlQ);
  }, [urlQ, urlTab, addRecent]);

  // ── state → URL (replace, never push, while typing) ────────────────────────
  const writeUrl = useMemo(
    () =>
      debounce((nextQ, nextTab) => {
        const path = localizeHref("/search", locale);
        if (typeof window === "undefined" || window.location.pathname !== path) return; // navigated away
        const href = localizeHref(searchHref(nextQ, nextTab), locale);
        if (`${window.location.pathname}${window.location.search}` === href) return;
        lastWritten.current = searchKey(nextQ, nextTab);
        try {
          window.history.replaceState(null, "", href);
        } catch {
          /* ignore */
        }
      }, 250),
    [locale]
  );
  useEffect(() => {
    writeUrl(q, tab);
  }, [q, tab, writeUrl]);
  useEffect(() => () => writeUrl.cancel(), [writeUrl]);

  // ── remote search (search_all) ─────────────────────────────────────────────
  useEffect(() => () => searcherRef.current?.cancel(), []);
  useEffect(() => {
    const searcher = searcherRef.current;
    if (!active) {
      searcher.cancel();
      setRemote(IDLE_REMOTE);
      return;
    }
    setRemote((r) => ({ ...r, status: "loading", code: null }));
    searcher
      .search(q)
      .then((res) => {
        if (res?.available === false) setRemote({ status: "unavailable", data: null, query: q, code: null });
        else setRemote({ status: "done", data: res, query: q, code: null });
      })
      .catch((e) => {
        if (e?.code === "aborted") return;
        setRemote({ status: "error", data: null, query: q, code: e?.code || "unknown" });
      });
  }, [q, active, retry]);

  // An emptied field starts over on "all".
  useEffect(() => {
    if (!q) setTab("all");
  }, [q]);

  // New query → back to the first page of curriculum results.
  useEffect(() => setCurrLimit(CURRICULUM_PAGE), [dq]);

  // ── local indexes ──────────────────────────────────────────────────────────
  const practiceIndex = useMemo(() => buildPracticeIndex(practice), [practice]);
  const pagesIndex = useMemo(() => {
    const items = [
      ...APP_NAV.flatMap((s) => s.items.map((it) => ({ ...it, icon: NAV_ICONS[it.icon] }))),
      ...EXTRA_PAGES,
    ]
      // Sign-in-only pages appear once we know there is a session (never shown, then pulled, for guests).
      .filter((it) => !it.auth || (authLoaded && isSignedIn))
      .map((it) => ({
        key: it.key,
        href: it.href,
        icon: it.icon,
        auth: it.auth,
        label: tn(`items.${it.key}`),
        keywords: t.has(`pages.keywords.${it.key}`) ? t(`pages.keywords.${it.key}`) : "",
      }));
    return buildPagesIndex(items);
  }, [tn, t, authLoaded, isSignedIn]);

  const localActive = normalizeText(dq).length >= 2;
  const curriculumHits = useMemo(() => (localActive ? searchCurriculum(curr.index, dq) : []), [curr.index, dq, localActive]);
  const practiceHits = useMemo(() => (localActive ? searchLocal(practiceIndex, dq) : []), [practiceIndex, dq, localActive]);
  const pageHits = useMemo(() => (localActive ? searchLocal(pagesIndex, dq, ALL_TAB_LIMITS.pages) : []), [pagesIndex, dq, localActive]);

  // Labels for practice rows / bank questions in the active locale.
  const labels = useMemo(() => {
    const bySection = Object.fromEntries((practice?.sections || []).map((s) => [s.id, s]));
    const byTopic = Object.fromEntries((practice?.topics || []).map((tp) => [`${tp.section}:${tp.id}`, tp]));
    const pick = (o, fallback) => (o ? (locale === "en" ? o.en : o.ar) : fallback);
    return {
      section: (id) => pick(bySection[id], id),
      type: (exam) => pick(practice?.types?.[exam], exam),
      topicOf: (section, id) => pick(byTopic[`${section}:${id}`], id),
    };
  }, [practice, locale]);

  // ── remote view model ──────────────────────────────────────────────────────
  const fresh = remote.status === "done" && remote.query === q;
  const loading = active && remote.status === "loading";
  if (remote.status === "unavailable") knownUnavailable.current = true;
  else if (remote.status === "done" || remote.status === "error") knownUnavailable.current = false;
  const stale = loading && Boolean(remote.data);
  const shown = active && (fresh || stale) ? remote.data : null;
  const shownQuery = fresh ? q : remote.query;
  // Extra pages ("show more") belong to the query + tab they were loaded for.
  const moreKey = `${q}|${tab}`;
  const extra = (g) => (fresh && tab === g && more.key === moreKey ? more.rows : []);
  const people = uniqueBy(linkablePeople([...(shown?.people || []), ...extra("people")]), ROW_KEY.people);
  const posts = uniqueBy([...(shown?.posts || []), ...extra("posts")], ROW_KEY.posts);
  const tags = uniqueBy([...(shown?.tags || []), ...extra("tags")], ROW_KEY.tags);
  const questions = uniqueBy([...(shown?.questions || []), ...extra("questions")], ROW_KEY.questions);
  const counts = tabCounts({ curriculum: curriculumHits, practice: practiceHits }, fresh ? remote.data : null);
  // What is on screen (fresh or the previous query's rows while loading) — for "view all (n)".
  const shownCounts = tabCounts({ curriculum: curriculumHits, practice: practiceHits }, shown);
  const remoteSettled = !active || ((remote.status === "done" || remote.status === "unavailable" || remote.status === "error") && remote.query === q);
  const localSettled = curr.status !== "loading" && dq === q;
  const remoteTotal = fresh ? counts.people.n + counts.posts.n + counts.tags.n + (counts.questions.n - practiceHits.length) : 0;
  const localTotal = curriculumHits.length + practiceHits.length;
  const total = localTotal + remoteTotal;
  const currFailed = curr.status === "error";
  // Never claim "no results" while part of the search could not run.
  const zero = active && remoteSettled && localSettled && !currFailed && total === 0 && pageHits.length === 0;
  const remoteBlocked = active && remoteSettled && (remote.status === "unavailable" || remote.status === "error");

  // ── announcements for screen readers ───────────────────────────────────────
  const [announce, setAnnounce] = useState("");
  useEffect(() => {
    if (!active) setAnnounce("");
    else if (remoteSettled && localSettled) setAnnounce(t("status.count", { count: total }));
  }, [active, remoteSettled, localSettled, total, t]);

  // ── actions ────────────────────────────────────────────────────────────────
  const commit = useCallback(() => {
    if (active) addRecent(q);
  }, [active, q, addRecent]);

  const scrollToResults = useCallback(() => {
    const a = anchorRef.current;
    if (a && a.getBoundingClientRect().top < 0) a.scrollIntoView({ block: "start" });
  }, []);

  // Suggestion / recent chips: fill the field and show the results. Only a
  // mouse/trackpad keeps focus in the field — on touch screens focusing it
  // would open the keyboard over the results the visitor just asked for.
  const pick = useCallback(
    (text) => {
      setQuery(text);
      addRecent(text);
      if (coarsePointer()) inputRef.current?.blur();
      else inputRef.current?.focus();
      scrollToResults();
    },
    [addRecent, scrollToResults]
  );

  const changeTab = (next) => {
    setTab(next);
    scrollToResults();
  };

  const clear = () => {
    setQuery("");
    inputRef.current?.focus();
  };

  // ── keyboard: "/" focuses the field; ↑/↓ walk the results ─────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
      const el = e.target;
      if (el?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el?.tagName || "")) return;
      e.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const focusables = () => [...(regionRef.current?.querySelectorAll("[data-result]") || [])];
  // Focus a result and keep it clear of the sticky field and the mobile tab bar.
  const focusEl = (el) => {
    if (!el) return;
    el.focus({ preventScroll: true });
    const r = el.getBoundingClientRect();
    const top = (stickyRef.current?.getBoundingClientRect().bottom || 0) + 12;
    const navH = window.innerWidth < 1024 ? parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--bottomnav-h")) || 72 : 0;
    const bottom = window.innerHeight - navH - 12;
    if (r.top < top) window.scrollBy({ top: r.top - top });
    else if (r.bottom > bottom) window.scrollBy({ top: r.bottom - bottom });
  };

  const onFieldKey = (e) => {
    if (e.key === "ArrowDown") {
      const list = focusables();
      if (list.length) {
        e.preventDefault();
        focusEl(list[0]);
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      commit();
      if (coarsePointer()) e.currentTarget.blur(); // the keyboard's "search" key: put the results on screen
    } else if (e.key === "Escape" && query) {
      e.preventDefault();
      setQuery("");
    }
  };

  const onRegionKey = (e) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End", "Escape"].includes(e.key)) return;
    const list = focusables();
    const i = list.indexOf(document.activeElement);
    if (i === -1) return;
    e.preventDefault();
    if (e.key === "Escape") return inputRef.current?.focus();
    if (e.key === "Home") return focusEl(list[0]);
    if (e.key === "End") return focusEl(list[list.length - 1]);
    if (e.key === "ArrowDown") return focusEl(list[Math.min(i + 1, list.length - 1)]);
    if (i === 0) {
      inputRef.current?.focus();
      scrollToResults();
    } else focusEl(list[i - 1]);
  };

  // A click on any result counts as a finished search.
  const onRegionClick = (e) => {
    if (active && e.target.closest?.("a[data-result]")) commit();
  };

  // ── tabs ───────────────────────────────────────────────────────────────────
  // Once the database said "not available", later keystrokes don't flash
  // skeletons for groups that can't arrive.
  const remotePending = loading && !fresh && !knownUnavailable.current;
  const tabItems = TABS.map((value) => {
    if (value === "all") return { value, label: t("tabs.all") };
    const c = counts[value];
    const isRemote = value !== "curriculum";
    let count = null;
    if (active) {
      if (value === "curriculum") count = curr.status === "ready" ? formatNumber(c.n, locale) : null;
      else if (value === "questions") count = fresh || remote.status === "unavailable" || remote.status === "error" ? countLabel(formatNumber(c.n, locale), c.capped) : null;
      else if (fresh) count = countLabel(formatNumber(c.n, locale), c.capped);
    }
    return { value, label: t(`tabs.${value}`), count, pending: active && isRemote && remotePending };
  });

  // ── group renderers ────────────────────────────────────────────────────────
  const gid = (name) => `${uid}-${name}`;
  const viewAll = (to, n) => ({ onViewAll: () => changeTab(to), viewAllLabel: t("viewAll", { count: n }) });
  // First load: a shimmer per group. Later loads keep the previous rows (dimmed)
  // in the "all" tab instead of flashing skeletons for groups that may vanish.
  const remoteSkeleton = (name, variant, force = false) =>
    remotePending && (force || !stale) ? (
      <GroupSkeleton
        key={`sk-${name}`}
        id={gid(`${name}-sk`)}
        icon={GROUP_ICONS[name]}
        title={t(`groups.${name}`)}
        loadingLabel={t("status.loadingGroup", { group: t(`groups.${name}`) })}
        variant={variant}
        rows={force ? 3 : 1}
      />
    ) : null;

  const pagesGroup = pageHits.length > 0 && (
    <Group key="pages" id={gid("pages")} icon={GROUP_ICONS.pages} title={t("groups.pages")} bare>
      <ul className="flex flex-wrap gap-2">
        {pageHits.map((p) => (
          <PageChip key={p.id} page={p} q={dq} />
        ))}
      </ul>
    </Group>
  );

  const curriculumLoading = curr.status === "loading" && localActive;
  const curriculumSkeleton = () => (
    <GroupSkeleton key="curr-sk" id={gid("curr-sk")} icon={GROUP_ICONS.curriculum} title={t("groups.curriculum")} loadingLabel={t("status.loadingGroup", { group: t("groups.curriculum") })} rows={3} />
  );

  // The catalog chunk failed to load (offline, deploy in progress): say so, offer a retry.
  const currNotice = (
    <RetryAlert key="curr-error" title={t("currError.title")} retryLabel={tc("actions.retry")} onRetry={() => setCurrRetry((n) => n + 1)}>
      {t("currError.body")}
    </RetryAlert>
  );

  // "All" tab: one row per distinct name; a name found in several grades opens the Curriculum tab.
  const curriculumPreview = (limit) => {
    if (curriculumLoading) return curriculumSkeleton();
    if (currFailed) return currNotice;
    if (!curriculumHits.length) return null;
    const clusters = clusterCurriculum(curriculumHits).slice(0, limit);
    const n = formatNumber(curriculumHits.length, locale);
    return (
      <Group
        key="curriculum"
        id={gid("curriculum")}
        icon={GROUP_ICONS.curriculum}
        title={t("groups.curriculum")}
        count={n}
        {...(curriculumHits.length > clusters.length ? viewAll("curriculum", n) : {})}
      >
        <RowList>
          {clusters.map((c) =>
            c.entries.length === 1 ? (
              <CurriculumRow key={c.key} e={c.first} q={dq} locale={locale} t={t} />
            ) : (
              <CurriculumClusterRow key={c.key} c={c} q={dq} locale={locale} t={t} onOpen={() => changeTab("curriculum")} />
            )
          )}
        </RowList>
      </Group>
    );
  };

  // Curriculum tab: every match, by stage, a page at a time.
  const stageNames = useMemo(() => {
    const out = {};
    for (const e of curr.index) if (e.kind === "stage") out[e.stage] = locale === "en" ? e.en : e.ar;
    return out;
  }, [curr.index, locale]);
  const curriculumFull = () => {
    if (curriculumLoading) return curriculumSkeleton();
    if (currFailed) return currNotice;
    const rows = curriculumHits.slice(0, currLimit);
    const more = curriculumHits.length - rows.length;
    return (
      <div key="curriculum-full" className="space-y-7">
        {groupByStage(rows).map(({ stage, entries }) => (
          <Group key={stage} id={gid(`curr-${stage}`)} icon={GROUP_ICONS.curriculum} title={stageNames[stage] || t(`stagesShort.${stage}`)} count={formatNumber(curriculumHits.filter((e) => e.stage === stage).length, locale)}>
            <RowList>
              {entries.map((e) => (
                <CurriculumRow key={e.id} e={e} q={dq} locale={locale} t={t} />
              ))}
            </RowList>
          </Group>
        ))}
        {more > 0 && (
          <Button variant="secondary" block onClick={() => setCurrLimit((x) => x + CURRICULUM_PAGE)}>
            {t("results.remaining", { count: Math.min(more, CURRICULUM_PAGE) })}
          </Button>
        )}
      </div>
    );
  };

  const practiceGroup = (limit, withViewAll) =>
    practiceHits.length > 0 && (
      <Group
        key="practice"
        id={gid("practice")}
        icon={GROUP_ICONS.practice}
        title={t("groups.practice")}
        {...(withViewAll && practiceHits.length > limit ? viewAll("questions", countLabel(formatNumber(shownCounts.questions.n, locale), shownCounts.questions.capped)) : {})}
      >
        <RowList>
          {practiceHits.slice(0, limit).map((e) => (
            <PracticeRow key={e.id} e={e} q={dq} locale={locale} t={t} labels={labels} />
          ))}
        </RowList>
      </Group>
    );

  const questionsGroup = (limit, withViewAll) => {
    if (!questions.length) return remoteSkeleton("questions", "row", !withViewAll);
    const rows = questions.slice(0, limit);
    return (
      <Group
        key="questions"
        id={gid("questions")}
        icon={GROUP_ICONS.questions}
        title={t("groups.questions")}
        stale={stale}
        {...(withViewAll && questions.length > rows.length ? viewAll("questions", countLabel(formatNumber(shownCounts.questions.n, locale), shownCounts.questions.capped)) : {})}
      >
        <RowList>
          {rows.map((item) => (
            <QuestionRow key={item.id} item={item} q={shownQuery} labels={{ section: labels.section, topic: (id) => labels.topicOf(item.section, id) }} />
          ))}
        </RowList>
      </Group>
    );
  };

  const peopleGroup = (limit, withViewAll) => {
    if (!people.length) return remoteSkeleton("people", "person", !withViewAll);
    const rows = people.slice(0, limit);
    return (
      <Group
        key="people"
        id={gid("people")}
        icon={GROUP_ICONS.people}
        title={t("groups.people")}
        stale={stale}
        {...(withViewAll && people.length > rows.length ? viewAll("people", countLabel(formatNumber(shownCounts.people.n, locale), shownCounts.people.capped)) : {})}
      >
        <RowList className={cn(rows.length > 1 && "sm:grid sm:grid-cols-2 sm:gap-x-1 sm:divide-y-0")}>
          {rows.map((p) => (
            <PersonRow key={p.id} p={p} q={shownQuery} />
          ))}
        </RowList>
      </Group>
    );
  };

  const postsGroup = (limit, withViewAll) => {
    if (!posts.length) return remoteSkeleton("posts", "post", !withViewAll);
    const rows = posts.slice(0, limit);
    return (
      <Group
        key="posts"
        id={gid("posts")}
        icon={GROUP_ICONS.posts}
        title={t("groups.posts")}
        stale={stale}
        {...(withViewAll && posts.length > rows.length ? viewAll("posts", countLabel(formatNumber(shownCounts.posts.n, locale), shownCounts.posts.capped)) : {})}
      >
        <RowList>
          {rows.map((post) => (
            <PostRow key={post.id} post={post} q={shownQuery} locale={locale} t={t} />
          ))}
        </RowList>
      </Group>
    );
  };

  const tagsGroup = (limit, withViewAll) => {
    if (!tags.length) return remoteSkeleton("tags", "row", !withViewAll);
    const rows = tags.slice(0, limit);
    return (
      <Group
        key="tags"
        id={gid("tags")}
        icon={GROUP_ICONS.tags}
        title={t("groups.tags")}
        stale={stale}
        bare
        {...(withViewAll && tags.length > rows.length ? viewAll("tags", countLabel(formatNumber(shownCounts.tags.n, locale), shownCounts.tags.capped)) : {})}
      >
        <ul className="flex flex-wrap gap-2">
          {rows.map((tg) => (
            <TagChip key={tg.tag} tag={tg} q={shownQuery} tc={tc} />
          ))}
        </ul>
      </Group>
    );
  };

  const remoteNotice =
    remoteBlocked &&
    (remote.status === "unavailable" ? (
      <Alert key="unavailable" tone="info" title={t("unavailable.title")}>
        {t("unavailable.body")}
      </Alert>
    ) : (
      <RetryAlert key="error" title={t("error.title")} retryLabel={tc("actions.retry")} onRetry={() => setRetry((n) => n + 1)}>
        {remote.code === "network" ? tc("states.networkError") : t("error.body")}
      </RetryAlert>
    ));

  // Without the 0012 totals a tab can't page: say that only the first rows are shown.
  const cappedNote = (groups) =>
    fresh && !remote.data?.totals && groups.some((g) => counts[g]?.capped) ? <p className="t-caption px-1">{t("results.capped", { count: REMOTE_LIMIT })}</p> : null;

  // "Show more" in a remote tab: the next page of that group only (search_all
  // p_types + p_offset), appended below. Needs the per-group totals of 0012.
  const moreGroup = tab === "people" || tab === "posts" || tab === "tags" || tab === "questions" ? tab : null;
  const loadedRows = moreGroup && fresh ? (remote.data?.[moreGroup]?.length || 0) + (more.key === moreKey ? more.loaded : 0) : 0;
  const canMore = Boolean(moreGroup && fresh && typeof api.searchAll === "function" && hasMoreRows(remote.data, moreGroup, loadedRows));
  const loadMore = async () => {
    if (!canMore || more.loading) return;
    const key = moreKey;
    const group = moreGroup;
    const offset = loadedRows;
    setMore((m) => (m.key === key ? { ...m, loading: true, error: false } : { ...IDLE_MORE, key, loading: true }));
    try {
      const page = await api.searchAll(q, { types: [group], limit: REMOTE_LIMIT, offset });
      const rows = Array.isArray(page?.[group]) ? page[group] : [];
      setMore((m) => (m.key !== key ? m : { key, rows: [...m.rows, ...rows], loaded: m.loaded + rows.length, loading: false, error: false }));
    } catch (e) {
      if (e?.code === "aborted") return;
      setMore((m) => (m.key !== key ? m : { ...m, loading: false, error: true }));
    }
  };
  const moreButton = canMore ? (
    <div key="more" className="space-y-2">
      {more.key === moreKey && more.error && <p role="alert" className="t-small px-1 text-danger">{t("results.moreError")}</p>}
      <Button variant="secondary" block loading={more.key === moreKey && more.loading} onClick={loadMore}>
        {t("results.remaining", { count: Math.max(1, Math.min(REMOTE_LIMIT, remote.data?.totalsCapped?.[moreGroup] ? REMOTE_LIMIT : (Number(remote.data?.totals?.[moreGroup]) || 0) - loadedRows)) })}
      </Button>
    </div>
  ) : null;

  // ── zero states ────────────────────────────────────────────────────────────
  const suggestions = t.raw("idle.suggestions");
  const tryChips = (title, id) =>
    Array.isArray(suggestions) && suggestions.length ? (
      <section aria-labelledby={id}>
        <h2 id={id} className="t-caption mb-2.5 font-medium">
          {title}
        </h2>
        <ul className="flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <li key={s}>
              <button
                type="button"
                data-result
                onClick={() => pick(s)}
                className="inline-flex h-11 items-center rounded-full border border-line/15 bg-surface px-4 text-sm font-medium text-ink-2 shadow-xs outline-none transition-colors hover:border-gold-300 hover:bg-gold-50 hover:text-ink focus-visible:bg-gold-50 focus-visible:[box-shadow:var(--ring)] sm:h-10"
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      </section>
    ) : null;

  const zeroAll = (
    <div className="surface animate-fade px-5 py-8 text-center sm:px-8 sm:py-10">
      <div aria-hidden="true" className="art-frame mx-auto w-full max-w-[220px] rounded-xl">
        <Illustration id="support.not-found" aspect="4/3" sizes="220px" />
      </div>
      <h2 className="t-h3 mx-auto mt-4 max-w-md break-words">{t(remoteBlocked ? "empty.titleLocal" : "empty.title", { query: isolate(q) })}</h2>
      <p className="t-body mx-auto mt-2 max-w-md text-ink-3">{t("empty.body")}</p>
      {remoteBlocked && <div className="mx-auto mt-5 max-w-lg text-start">{remoteNotice}</div>}
      <div className="mx-auto mt-8 max-w-2xl space-y-7 border-t border-line/10 pt-7 text-start">
        {tryChips(t("suggest.topicsTitle"), `${uid}-zero-try`)}
        {suggest}
      </div>
    </div>
  );

  const zeroTab = (name) => {
    const elsewhere = TABS.filter((x) => x !== "all" && x !== name && counts[x]?.n > 0);
    return (
      <div className="surface animate-fade px-5 py-8 text-center sm:py-10">
        <h2 className="t-h4 mx-auto max-w-md break-words">{t("empty.tabTitle", { group: t(`tabs.${name}`), query: isolate(q) })}</h2>
        <p className="t-small mx-auto mt-1.5 max-w-md text-ink-3">{elsewhere.length || pageHits.length ? t("empty.tabElsewhere") : t("empty.tabNone")}</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {elsewhere.map((x) => (
            <Button key={x} variant="secondary" size="sm" onClick={() => changeTab(x)}>
              {t(`tabs.${x}`)}
              <span className="rounded-full bg-surface-3 px-1.5 text-xs tabular text-ink-3">{countLabel(formatNumber(counts[x].n, locale), counts[x].capped)}</span>
            </Button>
          ))}
          {!elsewhere.length && (
            <Button variant="secondary" size="sm" onClick={() => changeTab("all")}>
              {t("empty.searchAll")}
            </Button>
          )}
        </div>
      </div>
    );
  };

  // ── panels ─────────────────────────────────────────────────────────────────
  let panel;
  if (!active) {
    panel = (
      <div className="space-y-9">
        {q.length > 0 && <p className="t-small px-1 text-ink-3">{t("field.minChars")}</p>}
        <RecentSearches variant="chips" className="lg:hidden" items={recent.items} ready={recent.ready} onPick={pick} onRemove={recent.remove} onClear={recent.clear} />
        {tryChips(t("idle.tryTitle"), `${uid}-try`)}
        {idle}
      </div>
    );
  } else if (zero) {
    panel = zeroAll;
  } else if (tab === "all") {
    const groups = [
      pagesGroup,
      curriculumPreview(ALL_TAB_LIMITS.curriculum),
      practiceGroup(ALL_TAB_LIMITS.practice, true),
      remoteBlocked ? null : questionsGroup(ALL_TAB_LIMITS.questions, true),
      remoteBlocked ? null : peopleGroup(ALL_TAB_LIMITS.people, true),
      remoteBlocked ? null : postsGroup(ALL_TAB_LIMITS.posts, true),
      remoteBlocked ? null : tagsGroup(ALL_TAB_LIMITS.tags, true),
      remoteNotice,
    ].filter(Boolean);
    panel = <div className="space-y-7">{groups}</div>;
  } else if (tab === "curriculum") {
    panel = curriculumLoading || currFailed || curriculumHits.length ? curriculumFull() : zeroTab("curriculum");
  } else {
    const body = {
      people: () => peopleGroup(REMOTE_LIMIT, false),
      posts: () => postsGroup(REMOTE_LIMIT, false),
      tags: () => tagsGroup(REMOTE_LIMIT, false),
      questions: () => (
        <>
          {practiceGroup(Infinity, false)}
          {!remoteBlocked && questionsGroup(REMOTE_LIMIT, false)}
        </>
      ),
    }[tab]();
    const has = counts[tab].n > 0; // questions count includes the practice catalog
    panel = (
      <div className="space-y-7">
        {!remoteSettled || has ? body : remoteBlocked ? null : zeroTab(tab)}
        {has && moreButton}
        {remoteNotice}
        {cappedNote(tab === "questions" ? ["questions"] : [tab])}
      </div>
    );
  }

  const main = (
    <>
      <div ref={anchorRef} className="scroll-mt-[var(--topbar-h)]" />
      <div ref={stickyRef} className="glass-chrome sticky top-[var(--topbar-h)] z-10 -mx-[var(--gutter)] px-[var(--gutter)] pb-3 pt-2 lg:mx-0 lg:px-0">
        <SearchField
          ref={inputRef}
          id={`${uid}-q`}
          value={query}
          onChange={setQuery}
          onKeyDown={onFieldKey}
          onClear={clear}
          busy={loading}
          label={t("field.label")}
          placeholder={t("field.placeholder")}
          clearLabel={t("field.clear")}
          busyLabel={t("field.searching")}
          shortcutLabel={t("field.shortcut")}
        />
        {active && (
          <div className="mt-3">
            <SearchTabs items={tabItems} value={tab} onChange={changeTab} label={t("tabs.label")} idBase={uid} />
          </div>
        )}
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>
      <div
        ref={regionRef}
        id={`${uid}-panel`}
        role={active ? "tabpanel" : "region"}
        aria-labelledby={active ? `${uid}-tab-${tab}` : undefined}
        aria-label={active ? undefined : t("status.region")}
        onKeyDown={onRegionKey}
        onClickCapture={onRegionClick}
        className="mt-5 sm:mt-6"
      >
        {panel}
      </div>
    </>
  );

  const rail = (
    <>
      <RecentSearches className="hidden lg:block" items={recent.items} ready={recent.ready} onPick={pick} onRemove={recent.remove} onClear={recent.clear} />
      {railStatic}
    </>
  );

  return <SearchLayout header={header} main={main} rail={rail} />;
}
