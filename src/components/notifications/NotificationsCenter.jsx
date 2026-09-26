"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, BellRing, CheckCheck, ClipboardCheck, LogIn, RefreshCw, Settings2, Users } from "lucide-react";
import { useT, useLocale } from "@/i18n/client";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import Skeleton from "@/components/ui/Skeleton";
import Tabs from "@/components/ui/Tabs";
import { cn } from "@/components/ui/cn";
import { FILTERS, buildFeed, filterItems, mergePages, newerItems, setRead } from "./model";
import { useNotificationsApi, useNotificationsAuth } from "./NotificationsContext";
import NotificationItem from "./NotificationItem";

const PAGE = 20;
const CHECK_MS = 60000; // look for new notifications while the tab is visible
const MIN_GAP_MS = 15000; // focus + visibilitychange fire together; one check is enough

/**
 * The notifications list: first page after mount, keyset "load more", client
 * filters, day groups with aggregation, optimistic read state. While the tab is
 * visible it checks for newer rows (every minute and on focus) and offers them
 * behind a "new notifications" button instead of shifting the list under the
 * reader. `header` is the server-rendered title block; actions sit beside it.
 */
export default function NotificationsCenter({ header }) {
  const t = useT("notifications");
  const { intl } = useLocale();
  const auth = useNotificationsAuth();
  const api = useNotificationsApi();

  const [state, setState] = useState({ status: "loading", items: [], nextCursor: null, available: true, error: null });
  const [more, setMore] = useState({ loading: false, error: false });
  const [filter, setFilter] = useState("all");
  const [unread, setUnread] = useState(null);
  const [markError, setMarkError] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [fresh, setFresh] = useState([]); // newer rows found after the first load, not shown yet
  const run = useRef(0);
  const stateRef = useRef(state);
  stateRef.current = state;
  const lastCheck = useRef(0);

  const refreshUnread = useCallback(() => {
    api.getUnreadCount().then(setUnread).catch(() => setUnread(null));
  }, [api]);

  const loadFirst = useCallback(async () => {
    const id = ++run.current;
    setState((s) => ({ ...s, status: "loading", error: null }));
    try {
      const page = await api.listNotifications({ limit: PAGE });
      if (id !== run.current) return;
      setNow(Date.now());
      setFresh([]);
      lastCheck.current = Date.now();
      setState({ status: "ready", items: page.items, nextCursor: page.nextCursor, available: page.available !== false, error: null });
    } catch (error) {
      if (id !== run.current) return;
      setState((s) => ({ ...s, status: "error", error }));
    }
  }, [api]);

  // Newer rows than the loaded head → offered behind a button (never auto-inserted).
  const checkNew = useCallback(async () => {
    const cur = stateRef.current;
    if (cur.status !== "ready" || !cur.available || document.visibilityState !== "visible") return;
    if (Date.now() - lastCheck.current < MIN_GAP_MS) return;
    lastCheck.current = Date.now();
    try {
      const page = await api.listNotifications({ limit: PAGE });
      const latest = stateRef.current;
      if (latest.status !== "ready") return;
      const found = newerItems(latest.items, page.items);
      // A full page of new rows may hide a gap before the loaded ones → reload instead.
      if (found.length >= PAGE) return loadFirst();
      setFresh(found);
      if (found.length) refreshUnread();
    } catch {
      /* the next check retries */
    }
  }, [api, loadFirst, refreshUnread]);

  useEffect(() => {
    if (!auth.isLoaded || !auth.isSignedIn) return undefined;
    loadFirst();
    refreshUnread();
    const tick = () => {
      setNow(Date.now());
      checkNew();
    };
    const onVisible = () => { if (document.visibilityState === "visible") tick(); };
    const id = setInterval(tick, CHECK_MS);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [auth.isLoaded, auth.isSignedIn, auth.userId, loadFirst, refreshUnread, checkNew]);

  const showFresh = () => {
    setState((s) => ({ ...s, items: mergePages(fresh, s.items) }));
    setFresh([]);
    setNow(Date.now());
    setFilter((f) => (f === "unread" || f === "all" ? f : "all"));
    try {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    } catch { /* old browsers */ }
  };

  const loadMore = async () => {
    if (!state.nextCursor || more.loading) return;
    setMore({ loading: true, error: false });
    try {
      const page = await api.listNotifications({ limit: PAGE, ...state.nextCursor });
      setState((s) => ({ ...s, items: mergePages(s.items, page.items), nextCursor: page.nextCursor }));
      setMore({ loading: false, error: false });
    } catch {
      setMore({ loading: false, error: true });
    }
  };

  // ── read state (optimistic; the data layer fires "jz:notifications-read" for the bell) ──
  const markIds = useCallback(async (ids) => {
    if (!ids.length) return;
    setMarkError(false);
    setState((s) => ({ ...s, items: setRead(s.items, ids, true) }));
    setUnread((u) => (typeof u === "number" ? Math.max(0, u - ids.length) : u));
    try {
      await api.markNotificationsRead(ids);
    } catch {
      setState((s) => ({ ...s, items: setRead(s.items, ids, false) }));
      setMarkError(true);
      refreshUnread();
    }
  }, [api, refreshUnread]);

  const onOpen = useCallback((group) => { markIds(group.unreadIds); }, [markIds]);
  const onMarkRead = useCallback((group) => { markIds(group.unreadIds); }, [markIds]);

  const markAll = async () => {
    setMarkError(false);
    setMarkingAll(true);
    // Remember WHICH rows were unread (loaded + "new" ones): a failure turns
    // exactly those back, on the current lists — pages loaded meanwhile stay.
    const wasUnread = [...state.items, ...fresh].filter((n) => !n.read).map((n) => n.id);
    setState((s) => ({ ...s, items: setRead(s.items, null, true) }));
    setFresh((f) => setRead(f, null, true)); // the server marks those too
    setUnread(0);
    try {
      await api.markAllNotificationsRead();
    } catch {
      setState((s) => ({ ...s, items: setRead(s.items, wasUnread, false) })); // "new" rows may have moved in
      setFresh((f) => setRead(f, wasUnread, false));
      setMarkError(true);
      refreshUnread();
    }
    setMarkingAll(false);
  };

  const visible = useMemo(() => filterItems(state.items, filter), [state.items, filter]);
  const feed = useMemo(() => buildFeed(visible, new Date(now)), [visible, now]);
  const dayLabel = useMemo(() => {
    const rtf = new Intl.RelativeTimeFormat(intl, { numeric: "auto" });
    const cap = (s) => s.charAt(0).toLocaleUpperCase(intl) + s.slice(1);
    return { today: cap(rtf.format(0, "day")), yesterday: cap(rtf.format(-1, "day")), earlier: t("days.earlier") };
  }, [intl, t]);

  const signedIn = auth.isLoaded && auth.isSignedIn;
  const loadedUnread = state.items.some((n) => !n.read);
  const canMarkAll = signedIn && state.status === "ready" && (unread > 0 || loadedUnread);
  // The unread summary and "mark all" only mean something next to a list (not
  // beside the empty / error / unavailable states, where the count is unknown or moot).
  const hasList = state.status === "ready" && state.items.length > 0;
  const showListMeta = signedIn && (state.status === "loading" || hasList);

  return (
    <div>
      {/* ── Header: title (server) · unread summary · actions ── */}
      <div className={cn("mb-6 flex gap-4 sm:mb-7 sm:flex-row sm:items-end sm:justify-between", showListMeta ? "flex-col" : "items-start justify-between")}>
        <div className="min-w-0">
          {header}
          {showListMeta && (
            <p className="t-small mt-2 min-h-[1.5rem] text-ink-3" aria-live="polite">
              {hasList && typeof unread === "number" ? t("unread", { count: unread }) : ""}
            </p>
          )}
        </div>
        {signedIn && (
          <div className="flex shrink-0 items-center gap-2">
            {showListMeta && (
              <Button variant="secondary" size="sm" iconStart={CheckCheck} onClick={markAll} loading={markingAll} disabled={!canMarkAll}>
                {t("actions.markAllRead")}
              </Button>
            )}
            <Button href="/settings?section=notifications" variant="ghost" size="icon" aria-label={t("actions.settings")} title={t("actions.settings")} className="lg:hidden">
              <Settings2 size={18} aria-hidden="true" />
            </Button>
          </div>
        )}
      </div>

      {!auth.isLoaded ? (
        <ListSkeleton />
      ) : !auth.isSignedIn ? (
        <EmptyState
          icon={LogIn}
          title={t("states.guest.title")}
          description={t("states.guest.body")}
          action={<Button href="/sign-in?next=%2Fnotifications">{t("states.guest.cta")}</Button>}
          className="surface"
        />
      ) : (
        <>
          {/* Filters only mean something once there is a list (hidden for empty / error / unavailable). */}
          {(state.status === "loading" || state.items.length > 0) && (
            <Tabs
              label={t("filters.label")}
              value={filter}
              onChange={setFilter}
              className="mb-5 w-fit max-w-full [&>button]:h-11 sm:[&>button]:h-9" /* 44px targets on touch widths */
              items={FILTERS.map((f) => ({ value: f, label: t(`filters.${f}`), count: f === "unread" && unread > 0 ? unread : undefined }))}
            />
          )}

          {markError && <Alert tone="danger" className="mb-4">{t("states.markFailed")}</Alert>}

          {/* Stays in view under the top bar so it's found even when scrolled down the list. */}
          {fresh.length > 0 && (
            <div className="pointer-events-none sticky top-[calc(var(--topbar-h)+0.75rem)] z-20 mb-4 flex justify-center">
              <Button variant="primary" size="sm" iconStart={ArrowUp} onClick={showFresh} className="pointer-events-auto animate-in shadow-md">
                {t("actions.showNew", { count: fresh.length })}
              </Button>
            </div>
          )}

          {state.status === "loading" ? (
            <ListSkeleton />
          ) : state.status === "error" ? (
            <EmptyState
              image="system.offline"
              compact
              title={t("states.error.title")}
              description={t("states.error.body")}
              action={<Button variant="secondary" iconStart={RefreshCw} onClick={loadFirst}>{t("actions.retry")}</Button>}
              className="surface"
            />
          ) : !state.available && state.items.length === 0 ? (
            <EmptyState image="system.offline" compact title={t("states.unavailable.title")} description={t("states.unavailable.body")} className="surface" />
          ) : state.items.length === 0 ? (
            <EmptyState
              image="support.empty"
              title={t("states.empty.title")}
              description={t("states.empty.body")}
              action={<Button href="/exams" iconStart={ClipboardCheck}>{t("states.empty.exams")}</Button>}
              secondary={<Button href="/community" variant="secondary" iconStart={Users}>{t("states.empty.community")}</Button>}
              className="surface"
            />
          ) : visible.length === 0 ? (
            <EmptyState
              icon={BellRing}
              compact
              title={t(`states.filtered.${filter}.title`)}
              description={state.nextCursor ? `${t(`states.filtered.${filter}.body`)} ${t("states.filtered.more")}` : t(`states.filtered.${filter}.body`)}
              action={state.nextCursor ? <Button variant="secondary" loading={more.loading} onClick={loadMore}>{t("actions.loadMore")}</Button> : null}
              secondary={<Button variant="ghost" onClick={() => setFilter("all")}>{t("states.filtered.showAll")}</Button>}
              className="surface"
            />
          ) : (
            <div className="space-y-6">
              {feed.map((section) => (
                <section key={section.day} aria-labelledby={`notif-day-${section.day}`} className="cv-auto">
                  <h2 id={`notif-day-${section.day}`} className="t-caption mb-2 px-1 font-medium text-ink-2">
                    {dayLabel[section.day]}
                  </h2>
                  <ul className="surface divide-y divide-line/10 overflow-hidden">
                    {section.groups.map((g) => (
                      <NotificationItem key={g.key} group={g} now={now} onOpen={onOpen} onMarkRead={onMarkRead} />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}

          {state.status === "ready" && visible.length > 0 && (
            <div className="mt-6 flex flex-col items-center gap-2">
              {state.nextCursor ? (
                <>
                  <Button variant="secondary" loading={more.loading} onClick={loadMore} className="w-full sm:w-auto">
                    {t("actions.loadMore")}
                  </Button>
                  {more.error && <p role="alert" className="t-caption text-danger">{t("states.moreError")}</p>}
                </>
              ) : (
                <p className="t-caption">{t("states.end")}</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div aria-hidden="true" className="space-y-6">
      {[3, 4].map((n, s) => (
        <div key={s}>
          <Skeleton className="mb-2 ms-1 h-3 w-14" />
          <div className="surface divide-y divide-line/10 overflow-hidden">
            {Array.from({ length: n }, (_, i) => (
              <div key={i} className={cn("flex gap-4 px-5 py-4", i === 0 && s === 0 && "bg-gold-50/40")}>
                <Skeleton rounded="full" className="h-11 w-11 shrink-0" />
                <div className="flex-1 space-y-2 pt-0.5">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
