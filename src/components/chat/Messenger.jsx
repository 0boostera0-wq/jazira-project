"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Inbox, LogIn, MessageCircle, RotateCcw, X } from "lucide-react";
import { useT } from "@/i18n/client";
import { useAuthUser } from "@/context/AuthProvider";
import Button from "@/components/ui/Button";
import Tabs from "@/components/ui/Tabs";
import Alert from "@/components/ui/Alert";
import Skeleton from "@/components/ui/Skeleton";
import EmptyState from "@/components/ui/EmptyState";
import { cn } from "@/components/ui/cn";
import { ConversationRow, RequestRow } from "./ConversationRow";
import Thread from "./ThreadPane";
import NoSelection from "./NoSelection";
import { applyIncoming, isUnread, sortConversations } from "./messaging";
import {
  getConversation, listConversations, listRequests, subscribeInbox, markConversationRead, respondMessageRequest, startConversation,
} from "./data";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Same frame as /assistant: fills the viewport under the top bar (and above
// the bottom tab bar below lg).
export const PANE_H =
  "h-[calc(100dvh-var(--topbar-h)-var(--bottomnav-h)-env(safe-area-inset-bottom)-3.5rem)] " +
  "sm:h-[calc(100dvh-var(--topbar-h)-var(--bottomnav-h)-env(safe-area-inset-bottom)-4rem)] " +
  "lg:h-[calc(100dvh-var(--topbar-h)-3.5rem)]";

const setUrl = (id, mode = "replace") => {
  try {
    const url = id ? `${window.location.pathname}?c=${id}` : window.location.pathname;
    if (mode === "push") window.history.pushState(null, "", url);
    else window.history.replaceState(null, "", url);
  } catch {}
};

/**
 * /chat — two-pane messenger (list + thread on md+, list → thread on phones).
 * Conversations and requests load independently; realtime keeps the list,
 * previews and the open thread current. ?to=<member id> opens (or starts) a
 * conversation through start_conversation(); ?c=<conversation id> deep-links.
 */
export default function Messenger() {
  const t = useT("chat");
  const tc = useT("common");
  const { isLoaded, isSignedIn, userId: me } = useAuthUser();

  const [tab, setTab] = useState("chats");
  const [convs, setConvs] = useState({ status: "idle", items: [], nextCursor: null, loadingMore: false });
  const [reqs, setReqs] = useState({ status: "idle", items: [] });
  const [active, setActive] = useState(null);
  const [respond, setRespond] = useState(null); // { id, kind }
  const [notice, setNotice] = useState(null); // { tone, text }
  const [opening, setOpening] = useState(false);

  const activeRef = useRef(null);
  activeRef.current = active;
  const convsRef = useRef(convs);
  convsRef.current = convs;
  const pushed = useRef(false);
  const listeners = useRef(new Set());
  const readTimers = useRef(new Map());
  const convReq = useRef(0); // latest list request wins (realtime refetches can overlap)
  const reqReq = useRef(0);

  // ── loading ────────────────────────────────────────────────────────────
  const loadConvs = useCallback(async () => {
    if (!me) return;
    const req = ++convReq.current;
    setConvs((s) => ({ ...s, status: s.items.length ? s.status : "loading" }));
    try {
      const page = await listConversations(me);
      if (req !== convReq.current) return;
      setConvs({ status: "ready", items: page.items, nextCursor: page.nextCursor, loadingMore: false });
    } catch (err) {
      if (req !== convReq.current) return;
      setConvs((s) => (s.items.length ? s : { status: err?.code === "unavailable" ? "unavailable" : "error", items: [], nextCursor: null, loadingMore: false }));
    }
  }, [me]);

  const loadReqs = useCallback(async () => {
    if (!me) return;
    const req = ++reqReq.current;
    setReqs((s) => ({ ...s, status: s.items.length ? s.status : "loading" }));
    try {
      const items = await listRequests(me);
      if (req !== reqReq.current) return;
      setReqs({ status: "ready", items });
    } catch (err) {
      if (req !== reqReq.current) return;
      setReqs((s) => (s.items.length ? s : { status: err?.code === "unavailable" ? "unavailable" : "error", items: [] }));
    }
  }, [me]);

  useEffect(() => {
    if (!me) return;
    loadConvs();
    loadReqs();
  }, [me, loadConvs, loadReqs]);

  const loadMore = async () => {
    const { nextCursor, loadingMore } = convsRef.current;
    if (!nextCursor || loadingMore) return;
    setConvs((s) => ({ ...s, loadingMore: true }));
    try {
      const page = await listConversations(me, { cursor: nextCursor });
      setConvs((s) => {
        const seen = new Set(s.items.map((c) => c.id));
        return { ...s, items: sortConversations([...s.items, ...page.items.filter((c) => !seen.has(c.id))]), nextCursor: page.nextCursor, loadingMore: false };
      });
    } catch {
      setConvs((s) => ({ ...s, loadingMore: false }));
    }
  };

  // ── realtime ───────────────────────────────────────────────────────────
  const subscribe = useCallback((fn) => {
    listeners.current.add(fn);
    return () => listeners.current.delete(fn);
  }, []);

  useEffect(() => {
    if (!me) return undefined;
    let off = () => {};
    let live = true;
    let refetch = 0;
    const scheduleRefetch = () => {
      clearTimeout(refetch);
      refetch = setTimeout(() => { loadConvs(); loadReqs(); }, 600);
    };
    subscribeInbox(me, {
      onMessage: (m) => {
        listeners.current.forEach((fn) => fn({ type: "insert", message: m }));
        // A conversation we don't list yet (new, or a request) → refetch.
        if (!applyIncoming(convsRef.current.items, m).known) scheduleRefetch();
        setConvs((s) => {
          const res = applyIncoming(s.items, m);
          return res.known ? { ...s, items: res.list } : s;
        });
        setReqs((s) => ({ ...s, items: s.items.map((r) => (r.conversationId === m.conversation_id ? { ...r, last: m } : r)) }));
      },
      onMessageUpdate: (m) => {
        listeners.current.forEach((fn) => fn({ type: "update", message: m }));
        setConvs((s) => ({ ...s, items: s.items.map((c) => (c.last?.id === m.id ? { ...c, last: { ...c.last, ...m } } : c)) }));
      },
      onRequest: () => {
        clearTimeout(refetch);
        refetch = setTimeout(loadReqs, 400);
      },
    }).then((fn) => {
      if (live) off = fn;
      else fn();
    });
    return () => {
      live = false;
      clearTimeout(refetch);
      off();
    };
  }, [me, loadConvs, loadReqs]);

  // ── read receipts (debounced per conversation) ──────────────────────────
  const onRead = useCallback((conv) => {
    const id = conv.id;
    clearTimeout(readTimers.current.get(id));
    readTimers.current.set(id, setTimeout(() => {
      markConversationRead(id).catch(() => {});
      const now = new Date().toISOString();
      setConvs((s) => ({ ...s, items: s.items.map((c) => (c.id === id ? { ...c, lastReadAt: now } : c)) }));
    }, 500));
  }, []);
  useEffect(() => () => readTimers.current.forEach((x) => clearTimeout(x)), []);

  const onActivity = useCallback((m, { update = false } = {}) => {
    setConvs((s) => {
      if (update) return { ...s, items: s.items.map((c) => (c.last?.id === m.id ? { ...c, last: { ...c.last, ...m } } : c)) };
      const res = applyIncoming(s.items, m);
      if (res.known) return { ...s, items: res.list };
      const conv = activeRef.current;
      if (conv && conv.id === m.conversation_id) return { ...s, items: [{ ...conv, last: m, lastMessageAt: m.created_at }, ...s.items] };
      return s;
    });
  }, []);

  // ── navigation between list and thread ─────────────────────────────────
  const open = useCallback((conv, { history = "auto" } = {}) => {
    setNotice(null);
    const mode = history === "auto" ? (activeRef.current ? "replace" : "push") : history;
    if (mode === "push") pushed.current = true;
    setUrl(conv.id, mode);
    setActive(conv);
  }, []);

  const openRequest = useCallback((req) => {
    open({
      id: req.conversationId,
      isRequest: true,
      request: { id: req.id, status: "pending", requesterId: req.requesterId, recipientId: me },
      other: req.other,
      otherId: req.requesterId,
      last: req.last,
      createdAt: req.createdAt,
      lastReadAt: null,
    });
  }, [open, me]);

  const close = useCallback(() => {
    if (pushed.current) {
      pushed.current = false;
      try { window.history.back(); return; } catch {}
    }
    setUrl(null);
    setActive(null);
  }, []);

  useEffect(() => {
    const onPop = () => {
      const c = new URLSearchParams(window.location.search).get("c");
      if (!c) {
        pushed.current = false;
        setActive(null);
        return;
      }
      if (activeRef.current?.id === c) return;
      const known = convsRef.current.items.find((x) => x.id === c);
      if (known) setActive(known);
      else if (me) getConversation(me, c).then((conv) => conv && setActive(conv)).catch(() => {});
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [me]);

  // ?to=<member> (profile "Message" button) · ?c=<conversation> (deep link)
  useEffect(() => {
    if (!me) return;
    let alive = true;
    const sp = new URLSearchParams(window.location.search);
    const to = sp.get("to");
    const c = sp.get("c");
    (async () => {
      if (to && UUID_RE.test(to) && to !== me) {
        setOpening(true);
        const res = await startConversation(to);
        if (!alive) return;
        if (!res.ok) {
          setOpening(false);
          setUrl(null);
          const key = `start.errors.${res.reason}`;
          setNotice({ tone: "warning", text: t(t.has(key) ? key : "start.errors.error") });
          return;
        }
        const conv = await getConversation(me, res.conversationId).catch(() => null);
        if (!alive) return;
        setOpening(false);
        if (conv) {
          open(conv, { history: "replace" });
          setConvs((s) => (s.items.some((x) => x.id === conv.id) || (conv.isRequest && conv.request?.recipientId === me) ? s : { ...s, items: sortConversations([conv, ...s.items]) }));
        } else {
          setUrl(null);
          setNotice({ tone: "warning", text: t("start.errors.error") });
        }
      } else if (c && UUID_RE.test(c)) {
        const conv = await getConversation(me, c).catch(() => null);
        if (alive && conv) open(conv, { history: "replace" });
        else if (alive) setUrl(null);
      } else if (to || c) {
        setUrl(null);
      }
    })();
    return () => { alive = false; };
    // run once per signed-in member
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  // ── requests ───────────────────────────────────────────────────────────
  const onRespond = useCallback(async (target, accept) => {
    const requestId = target.request?.id ?? target.id;
    const conversationId = target.request ? target.id : target.conversationId;
    setRespond({ id: requestId, kind: accept ? "accept" : "ignore" });
    setNotice(null);
    const res = await respondMessageRequest(requestId, accept);
    setRespond(null);
    if (!res.ok) {
      setNotice({ tone: "danger", text: t(accept ? "requests.acceptError" : "requests.ignoreError") });
      return;
    }
    setReqs((s) => ({ ...s, items: s.items.filter((r) => r.id !== requestId) }));
    const current = activeRef.current;
    if (accept) {
      const base = current?.id === conversationId ? current : null;
      const req = reqs.items.find((r) => r.id === requestId);
      const conv = base || (req && {
        id: req.conversationId, other: req.other, otherId: req.requesterId, last: req.last, createdAt: req.createdAt, lastReadAt: null,
      });
      if (conv) {
        const accepted = { ...conv, isRequest: false, request: { ...(conv.request || {}), id: requestId, status: "accepted" } };
        if (current?.id === conversationId) setActive(accepted);
        else open(accepted); // accepting from the list opens the conversation
        setTab("chats"); // …which now lives under Chats
        setConvs((s) => ({ ...s, items: sortConversations([accepted, ...s.items.filter((x) => x.id !== conversationId)]) }));
      }
    } else if (current?.id === conversationId) {
      close();
    }
  }, [t, reqs.items, close, open]);

  // ── derived ────────────────────────────────────────────────────────────
  const unreadCount = useMemo(() => convs.items.filter((c) => isUnread(c, me) && c.id !== active?.id).length, [convs.items, me, active?.id]);
  const tabs = [
    { value: "chats", label: t("tabs.chats"), count: unreadCount || undefined },
    { value: "requests", label: t("tabs.requests"), count: reqs.items.length || undefined },
  ];

  if (isLoaded && !isSignedIn) {
    // An expired session keeps ?to= / ?c= through sign-in.
    const next = encodeURIComponent(`/chat${typeof window === "undefined" ? "" : window.location.search}`);
    return (
      <div className={cn("surface grid grid-cols-[minmax(0,1fr)] overflow-hidden lg:-mb-10 md:grid-cols-[300px_minmax(0,1fr)] lg:grid-cols-[340px_minmax(0,1fr)]", PANE_H)}>
        <div className="flex min-h-0 min-w-0 flex-col md:border-e md:border-line/10">
          <div className="px-4 pb-3 pt-4 sm:px-5">
            <h1 className="t-h3">{t("page.title")}</h1>
            <p className="t-caption mt-0.5">{t("page.lead")}</p>
          </div>
          <div className="flex flex-1 items-center justify-center border-t border-line/10">
            <EmptyState
              compact
              icon={MessageCircle}
              title={t("guest.title")}
              description={t("guest.body")}
              action={<Button href={`/sign-in?next=${next}`} iconStart={LogIn}>{t("guest.cta")}</Button>}
            />
          </div>
        </div>
        <div className="hidden min-h-0 min-w-0 flex-col md:flex">
          <NoSelection about />
        </div>
      </div>
    );
  }

  const listBody = tab === "chats" ? (
    <ListState
      state={convs}
      empty={
        <EmptyState
          compact
          icon={MessageCircle}
          title={t("list.empty.title")}
          description={t("list.empty.body")}
          action={<Button href="/community" size="sm" variant="secondary">{t("list.empty.cta")}</Button>}
        />
      }
      onRetry={loadConvs}
    >
      <ul aria-label={t("list.label")} className="divide-y divide-line/[0.07]">
        {convs.items.map((c) => (
          <li key={c.id}>
            <ConversationRow conv={c} me={me} active={active?.id === c.id} onOpen={open} />
          </li>
        ))}
      </ul>
      {convs.nextCursor && <LoadMore onMore={loadMore} loading={convs.loadingMore} label={t("list.loadMore")} />}
    </ListState>
  ) : (
    <ListState
      state={reqs}
      empty={<EmptyState compact icon={Inbox} title={t("requests.empty.title")} description={t("requests.empty.body")} />}
      onRetry={loadReqs}
    >
      <ul aria-label={t("tabs.requests")} className="divide-y divide-line/[0.07]">
        {reqs.items.map((r) => (
          <li key={r.id}>
            <RequestRow
              req={r}
              active={active?.id === r.conversationId}
              busy={respond?.id === r.id ? respond.kind : null}
              onOpen={openRequest}
              onAccept={(x) => onRespond(x, true)}
              onIgnore={(x) => onRespond(x, false)}
            />
          </li>
        ))}
      </ul>
    </ListState>
  );

  return (
    <div className={cn("surface grid grid-cols-[minmax(0,1fr)] overflow-hidden lg:-mb-10 md:grid-cols-[300px_minmax(0,1fr)] lg:grid-cols-[340px_minmax(0,1fr)]", PANE_H)}>
      <div className={cn("min-h-0 min-w-0 flex-col border-line/10 md:flex md:border-e", active || opening ? "hidden" : "flex")}>
        <div className="px-4 pb-3 pt-4 sm:px-5">
          <h1 className="t-h3">{t("page.title")}</h1>
          <p className="t-caption mt-0.5">{t("page.lead")}</p>
          <Tabs items={tabs} value={tab} onChange={setTab} label={t("tabs.label")} className="mt-4 w-full [&>button]:flex-1 [&>button]:justify-center" />
        </div>
        {notice && (
          <div className="px-4 pb-3 sm:px-5">
            <Alert
              tone={notice.tone}
              action={
                <button type="button" onClick={() => setNotice(null)} aria-label={tc("a11y.close")} className="-m-1 grid h-7 w-7 place-items-center rounded-full hover:bg-surface/60">
                  <X size={14} aria-hidden="true" />
                </button>
              }
            >
              {notice.text}
            </Alert>
          </div>
        )}
        <div role="tabpanel" aria-label={tab === "chats" ? t("tabs.chats") : t("tabs.requests")} className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-line/10">{listBody}</div>
      </div>

      <div className={cn("min-h-0 min-w-0 flex-col", active || opening ? "flex" : "hidden md:flex")}>
        {opening ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-ink-3">
            <Skeleton rounded="full" className="h-14 w-14" />
            <p className="t-small">{t("start.opening")}</p>
          </div>
        ) : active ? (
          <Thread
            key={active.id}
            conv={active}
            me={me}
            onBack={close}
            subscribe={subscribe}
            onRead={onRead}
            onActivity={onActivity}
            onRespond={onRespond}
            respondBusy={active.request && respond?.id === active.request.id ? respond.kind : null}
          />
        ) : (
          <NoSelection about={convs.status === "error" || convs.status === "unavailable" || (convs.status === "ready" && !convs.items.length)} />
        )}
      </div>
    </div>
  );
}

function ListState({ state, empty, onRetry, children }) {
  const t = useT("chat");
  if (state.status === "idle" || state.status === "loading") return <RowsSkeleton />;
  if (state.status === "unavailable") return <p className="t-small px-6 py-10 text-center text-ink-3">{t("errors.unavailable")}</p>;
  if (state.status === "error") {
    return (
      <div className="px-6 py-10 text-center">
        <p role="alert" className="t-small text-ink-2">{t("list.error")}</p>
        <Button size="sm" variant="secondary" iconStart={RotateCcw} onClick={onRetry} className="mt-3">{t("list.retry")}</Button>
      </div>
    );
  }
  if (!state.items.length) return empty;
  return children;
}

function LoadMore({ onMore, loading, label }) {
  const ref = useRef(null);
  const cb = useRef(onMore);
  cb.current = onMore;
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return undefined;
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && cb.current(), { rootMargin: "240px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className="px-4 py-3">
      <Button size="sm" variant="ghost" block loading={loading} onClick={onMore}>{label}</Button>
    </div>
  );
}

function RowsSkeleton() {
  return (
    <div aria-hidden="true" className="divide-y divide-line/[0.07]">
      {Array.from({ length: 7 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3 sm:px-5">
          <Skeleton rounded="full" className="h-[46px] w-[46px] shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5" style={{ width: `${55 - (i % 3) * 10}%` }} />
            <Skeleton className="h-3" style={{ width: `${80 - (i % 4) * 12}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
