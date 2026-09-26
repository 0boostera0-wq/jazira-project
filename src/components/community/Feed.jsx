"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { ArrowUp, Hash, RotateCcw, ShieldCheck, Users } from "lucide-react";
import { useLocale, useT } from "@/i18n/client";
import { Link } from "@/i18n/navigation";
import Button from "@/components/ui/Button";
import Alert from "@/components/ui/Alert";
import EmptyState from "@/components/ui/EmptyState";
import { cn } from "@/components/ui/cn";
import Composer from "./Composer";
import PostCard from "./PostCard";
import WhoToFollow from "./WhoToFollow";
import { BELOW_LG } from "./breakpoints";
import { PostSkeleton } from "./skeletons";
import { useSignInPrompt } from "./SignInPrompt";
import { useViewer } from "./useViewer";
import { FEED_INITIAL, feedReducer, mergeTopics } from "./model";
import { POST_KINDS, STARTER_TOPICS, tagInline } from "./topics";
import { useApi } from "./context";
import { textProps } from "./text";

/**
 * The community feed island: composer · topic filters · posts (keyset pages,
 * infinite scroll with a real "load more" button as fallback) · "new posts"
 * pill (polled while the tab is visible — the posts table is no longer in
 * realtime since 0012). One component serves /community, /tags/[tag] and the
 * profile tabs through `scope`.
 *
 *   scope: "all" | "tag" | "author" | "liked" | "reposted"
 *   withFilters  topic chips (scope "all")
 *   withComposer composer on top (lockedTag on tag pages)
 *   source       data functions (defaults to src/lib/social.js)
 */
const POLL_MS = 45000; // "new posts" check + visible counts, while the tab is visible
const POLL_GAP_MS = 15000; // focus and visibilitychange fire together: one check is enough
const REFRESH_MAX = 30; // posts whose counts are refreshed per check (the top of the feed)

export default function Feed({
  scope = "all",
  tag = null,
  userId = null,
  withFilters = false,
  withComposer = false,
  peopleStrip = false,
  guidelinesNote = false,
  isSelf = false,
  pageSize,
  source,
  viewer: viewerOverride,
  className,
}) {
  const t = useT("community");
  const { locale } = useLocale();
  const api = useApi(source);
  const viewer = useViewer(viewerOverride);
  const [prompt, askSignIn] = useSignInPrompt();
  const [state, dispatch] = useReducer(feedReducer, FEED_INITIAL);
  const [filter, setFilter] = useState({ kind: "all", tag: null });
  const [popular, setPopular] = useState([]);
  const [fresh, setFresh] = useState(0);
  const [openSignal, setOpenSignal] = useState(0);
  const stateRef = useRef(state);
  const reqRef = useRef(0);
  const sentinel = useRef(null);
  const top = useRef(null);
  stateRef.current = state;

  // What to ask the data layer for.
  const query = useMemo(() => {
    if (scope !== "all") return { scope, tag, userId };
    if (filter.kind === "following") return { scope: "following" };
    if (filter.kind === "tag") return { scope: "tag", tag: filter.tag };
    return { scope: "all" };
  }, [scope, tag, userId, filter]);
  const queryKey = JSON.stringify(query);

  const load = useCallback(async (append = false) => {
    const req = ++reqRef.current;
    const s = stateRef.current;
    if (append) {
      if (!s.cursor || s.loadingMore) return;
      dispatch({ type: "loadingMore" });
    } else {
      dispatch({ type: "reset" });
    }
    try {
      const res = await api.listPosts({ ...query, cursor: append ? s.cursor : null, ...(pageSize ? { limit: pageSize } : {}) });
      if (req === reqRef.current) dispatch({ type: "page", ...res, append });
    } catch (e) {
      if (req === reqRef.current && e?.code !== "aborted") dispatch({ type: "error", code: e?.code || "unknown", append });
    }
  }, [api, queryKey, pageSize]); // eslint-disable-line react-hooks/exhaustive-deps

  // First page once auth is known (reactions depend on the viewer).
  useEffect(() => {
    if (!viewer.isLoaded) return;
    setFresh(0);
    load(false);
  }, [viewer.isLoaded, viewer.userId, load]);

  // Topic chips: curated starters + real popular tags.
  useEffect(() => {
    if (!withFilters) return;
    let alive = true;
    api.getPopularTags({ limit: 12 }).then((r) => alive && setPopular(r.items || [])).catch(() => {});
    return () => { alive = false; };
  }, [api, withFilters]);

  // Infinite scroll: fetch the next page well before the end.
  const hasMore = Boolean(state.cursor);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      const s = stateRef.current;
      if (entries.some((e) => e.isIntersecting) && s.status === "ready" && !s.loadingMore && !s.error) load(true);
    }, { rootMargin: "900px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, state.status, load]);

  // Live-ish updates on the main feed, polled while the tab is visible: how
  // many newer posts exist (behind a pill — the database leaves out your own
  // and blocked members' posts) and fresh counts for the posts on screen.
  const live = scope === "all" && filter.kind === "all" && state.status === "ready";
  const loadedAt = useRef(null);
  useEffect(() => {
    if (state.status === "ready" && !state.loadingMore && !loadedAt.current) loadedAt.current = new Date().toISOString();
    if (state.status === "loading") loadedAt.current = null;
  }, [state.status, state.loadingMore]);
  useEffect(() => {
    if (!live || typeof api.countNewPosts !== "function") return undefined;
    let alive = true;
    let last = Date.now();
    const check = async () => {
      if (document.visibilityState !== "visible" || Date.now() - last < POLL_GAP_MS) return;
      last = Date.now();
      const items = stateRef.current.items;
      const head = items[0];
      const since = head ? { since: head.created_at, sinceId: head.id } : { since: loadedAt.current };
      const [n, rows] = await Promise.all([
        api.countNewPosts(since).catch(() => null),
        items.length && typeof api.refreshPosts === "function"
          ? api.refreshPosts(items.slice(0, REFRESH_MAX).map((p) => p.id)).catch(() => [])
          : Promise.resolve([]),
      ]);
      if (!alive) return;
      if (typeof n === "number") setFresh(n);
      for (const row of rows || []) dispatch({ type: "row", row });
    };
    const id = setInterval(check, POLL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [live, api]);

  const onPatch = useCallback((id, patch) => dispatch({ type: "patch", id, patch }), []);
  const onRemove = useCallback((id) => dispatch({ type: "remove", id }), []);
  const onBlocked = useCallback((uid) => dispatch({ type: "removeAuthor", userId: uid }), []);
  const onPublished = useCallback((post) => {
    dispatch({ type: "prepend", post });
    top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const showNew = () => {
    setFresh(0);
    load(false);
    top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Two tiers: post types (primary) and subjects (curated starters + up to
  // four real popular tags).
  const chips = useMemo(() => {
    if (!withFilters) return { kinds: [], subjects: [] };
    const kinds = POST_KINDS.map((k) => ({ key: `k-${k.id}`, tag: k.tag, icon: k.icon, label: t(`filters.kinds.${k.id}`) }));
    const subjects = mergeTopics(STARTER_TOPICS, popular, STARTER_TOPICS.length + 4)
      .filter((x) => !POST_KINDS.some((k) => k.tag === x.tag))
      .map((x) => ({ key: `t-${x.tag}`, tag: x.tag, label: x.id ? t(`topics.${x.id}`) : x.tag, content: !x.id }));
    return { kinds, subjects };
  }, [withFilters, popular, t]);

  const lockedTag = scope === "tag" ? tag : null;

  return (
    <div className={cn("space-y-4", className)}>
      <div ref={top} className="scroll-mt-24" />
      {withComposer && (
        <Composer api={api} viewer={viewer} askSignIn={askSignIn} lockedTag={lockedTag} onPublished={onPublished} openSignal={openSignal} />
      )}

      {guidelinesNote && (
        <p className="t-small flex items-start gap-2 rounded-md bg-surface-2/70 px-3.5 py-2.5 text-ink-2 lg:hidden">
          <ShieldCheck size={16} aria-hidden="true" className="mt-[3px] shrink-0 text-green-600" />
          <span>
            {t("rail.guidelines.short")}{" "}
            <Link href="/community-guidelines" className="font-medium text-gold-600 hover:underline hover:underline-offset-4">{t("rail.guidelines.link")}</Link>
          </span>
        </p>
      )}

      {withFilters && state.status !== "unavailable" && (
        <FilterBar
          chips={chips}
          filter={filter}
          onChange={setFilter}
          signedIn={viewer.isSignedIn}
          t={t}
          locale={locale}
        />
      )}

      {fresh > 0 && (
        <div className="sticky top-[calc(var(--topbar-h)+0.75rem)] z-20 flex justify-center">
          <Button size="sm" iconStart={ArrowUp} onClick={showNew} className="shadow-md">
            {t("feed.newPosts", { count: fresh })}
          </Button>
        </div>
      )}

      <div aria-busy={state.status === "loading" || state.loadingMore}>
        {state.status === "loading" && <FeedSkeleton />}

        {state.status === "unavailable" && (
          <div className="surface">
            <EmptyState
              image="support.offline"
              compact
              title={t("feed.unavailable.title")}
              description={t("feed.unavailable.body")}
              action={<Button variant="secondary" iconStart={RotateCcw} onClick={() => load(false)}>{t("feed.retry")}</Button>}
            />
          </div>
        )}

        {state.status === "error" && (
          <Alert
            tone="danger"
            title={t("feed.error.title")}
            action={<Button size="sm" variant="secondary" iconStart={RotateCcw} onClick={() => load(false)}>{t("feed.retry")}</Button>}
          >
            {t(`errors.${state.error}`)}
          </Alert>
        )}

        {state.status === "ready" && state.items.length === 0 && (
          <FeedEmpty
            t={t}
            scope={scope}
            filter={filter}
            reason={state.reason}
            tag={tag}
            locale={locale}
            isSelf={isSelf}
            onCompose={withComposer ? () => setOpenSignal((n) => n + 1) : null}
            onShowAll={() => setFilter({ kind: "all", tag: null })}
          />
        )}

        {state.status === "ready" && state.items.length > 0 && (
          <>
            <h2 className="sr-only">{t("feed.title")}</h2>
            <ol className="space-y-4">
              {state.items.map((post, i) => (
                <li key={post.id}>
                  <PostCard
                    post={post}
                    api={api}
                    viewer={viewer}
                    askSignIn={askSignIn}
                    onPatch={onPatch}
                    onRemove={onRemove}
                    onBlocked={onBlocked}
                    showFollow={scope !== "author"}
                  />
                  {peopleStrip && i === 2 && filter.kind === "all" && (
                    // Below lg only: `gate` keeps it from fetching where CSS hides it.
                    <WhoToFollow variant="strip" gate={BELOW_LG} source={api} viewer={viewer} limit={6} className="mt-4 lg:hidden" />
                  )}
                </li>
              ))}
            </ol>

            <div ref={sentinel} aria-hidden="true" />
            {state.loadingMore && <div className="mt-4"><PostSkeleton /></div>}
            {state.error && (
              <Alert tone="danger" className="mt-4" action={<Button size="sm" variant="secondary" onClick={() => load(true)}>{t("feed.retry")}</Button>}>
                {t(`errors.${state.error}`)}
              </Alert>
            )}
            {hasMore && !state.loadingMore && !state.error && (
              <div className="mt-5 flex justify-center">
                <Button variant="secondary" onClick={() => load(true)}>{t("feed.loadMore")}</Button>
              </div>
            )}
            {!hasMore && state.items.length > 3 && (
              <p className="t-caption mt-6 text-center">{t("feed.end")}</p>
            )}
          </>
        )}
      </div>
      {prompt}
    </div>
  );
}

function FilterBar({ chips, filter, onChange, signedIn, t, locale }) {
  const active = (k, tg = null) => filter.kind === k && filter.tag === tg;
  const toggleTag = (tag) => onChange(active("tag", tag) ? { kind: "all", tag: null } : { kind: "tag", tag });
  const primary = (key, label, on, onClick, Icon) => (
    <button
      key={key}
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-sm transition-colors duration-fast sm:h-9",
        on ? "border-transparent bg-primary font-medium text-primary-fg" : "border-line/15 bg-surface text-ink-2 hover:border-line/30 hover:text-ink"
      )}
    >
      {Icon && <Icon size={15} aria-hidden="true" className={on ? "" : "text-gold-600"} />}
      {label}
    </button>
  );
  const current = filter.kind === "tag" ? filter.tag : null;
  const scroller = "-mx-[var(--gutter)] flex gap-2 overflow-x-auto px-[var(--gutter)] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0";
  return (
    <div role="group" aria-label={t("filters.label")} className="space-y-2.5">
      <div role="group" aria-label={t("filters.typesLabel")} className={cn(scroller, "pb-0.5")} style={{ scrollbarWidth: "none" }}>
        {primary("all", t("filters.all"), active("all"), () => onChange({ kind: "all", tag: null }))}
        {signedIn && primary("following", t("filters.following"), active("following"), () => onChange({ kind: "following", tag: null }), Users)}
        <span aria-hidden="true" className="mx-0.5 w-px shrink-0 self-stretch bg-line/15" />
        {chips.kinds.map((c) => primary(c.key, c.label, active("tag", c.tag), () => toggleTag(c.tag), c.icon))}
      </div>
      <div role="group" aria-label={t("filters.subjectsLabel")} className={cn(scroller, "gap-1.5")} style={{ scrollbarWidth: "none" }}>
        {chips.subjects.map((c) => {
          const on = active("tag", c.tag);
          return (
            <button
              key={c.key}
              type="button"
              aria-pressed={on}
              onClick={() => toggleTag(c.tag)}
              className={cn(
                "inline-flex h-11 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-3.5 text-[0.8125rem] transition-colors duration-fast sm:h-8 sm:px-3",
                on ? "bg-gold-100 font-medium text-gold-800 ring-1 ring-inset ring-gold-300" : "bg-surface-2 text-ink-2 hover:bg-surface-3 hover:text-ink"
              )}
            >
              <Hash size={12} aria-hidden="true" className="opacity-60" />
              {c.content ? <bdi {...textProps(c.label)}>{c.label}</bdi> : c.label}
            </button>
          );
        })}
      </div>
      {current && (
        <p className="t-small flex flex-wrap items-center gap-x-2 gap-y-1 pt-1 text-ink-3">
          <span>{t("filters.showing", { topic: tagInline(t, current, locale) })}</span>
          <span aria-hidden="true">·</span>
          <Link href={`/tags/${encodeURIComponent(current)}`} className="font-medium text-gold-600 hover:underline hover:underline-offset-4">
            {t("filters.openTopic")}
          </Link>
        </p>
      )}
    </div>
  );
}

function FeedEmpty({ t, scope, filter, reason, tag, locale, isSelf, onCompose, onShowAll }) {
  let key = "all";
  let action = null;
  if (scope === "all" && filter.kind === "following") {
    key = reason === "no_following" ? "noFollowing" : "following";
    action = <Button variant="secondary" onClick={onShowAll}>{t("feed.empty.showAll")}</Button>;
  } else if (scope === "tag" || (scope === "all" && filter.kind === "tag")) {
    key = "tag";
    action = onCompose && scope === "tag" ? <Button onClick={onCompose}>{t("feed.empty.tag.cta")}</Button> : <Button variant="secondary" onClick={onShowAll}>{t("feed.empty.showAll")}</Button>;
  } else if (scope === "author") {
    key = isSelf ? "authorSelf" : "author";
    action = isSelf ? <Button href="/community">{t("feed.empty.authorSelf.cta")}</Button> : null;
  } else if (scope === "liked" || scope === "reposted") {
    key = scope;
  } else if (onCompose) {
    action = <Button onClick={onCompose}>{t("feed.empty.all.cta")}</Button>;
  }
  const shownTag = scope === "tag" ? tag : filter.tag;
  const big = key === "all" || key === "tag";
  return (
    <div className="surface">
      <EmptyState
        image={big ? "community.conversation" : undefined}
        icon={big ? undefined : Users}
        compact={!big}
        title={t(`feed.empty.${key}.title`, { tag: shownTag ? tagInline(t, shownTag, locale) : "" })}
        description={t(`feed.empty.${key}.body`)}
        action={action}
      />
    </div>
  );
}

export function FeedSkeleton({ count = 3 }) {
  return (
    <div className="space-y-4" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => <PostSkeleton key={i} media={i === 1} />)}
    </div>
  );
}
