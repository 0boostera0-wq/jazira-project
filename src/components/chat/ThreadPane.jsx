"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Ban, Info, MoreVertical, RotateCcw, ShieldOff, UserRound } from "lucide-react";
import { useT, useLocale } from "@/i18n/client";
import { Link } from "@/i18n/navigation";
import { formatDate } from "@/i18n/format";
import { useDismiss } from "@/components/ui/useDismiss";
import Avatar from "@/components/Avatar";
import Button from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";
import Alert from "@/components/ui/Alert";
import Skeleton from "@/components/ui/Skeleton";
import EliteBadge from "@/components/subscriptions/EliteBadge";
import { cn } from "@/components/ui/cn";
import MessageBubble from "./MessageBubble";
import ThreadComposer from "./ThreadComposer";
import { displayName } from "./ConversationRow";
import { buildThreadItems, composerState, dirOfText, mergeMessages, outgoingText, relativeDay } from "./messaging";
import { deleteForEveryone, isBlockedByMe, listMessages, sendMessage, setBlocked } from "./data";

let tmp = 0;

/**
 * Conversation pane: header (member, menu), messages (paged upward, day
 * separators, grouped bubbles, receipts), and the composer — or the banner
 * that explains why you can't write (request, declined, blocked).
 */
export default function Thread({ conv, me, onBack, subscribe, onRead, onActivity, onRespond, respondBusy }) {
  const t = useT("chat");
  const tc = useT("common");
  const { locale, isRTL } = useLocale();
  const name = displayName(conv.other, t);
  // Names inside sentences are bidi-isolated (FSI … PDI) so an English name in
  // Arabic copy — or the reverse — never reorders the punctuation around it.
  const inText = `⁨${name}⁩`;

  const [state, setState] = useState({ status: "loading", messages: [], cursor: null, loadingEarlier: false });
  const [blockedByMe, setBlockedByMe] = useState(false);
  const [blockDialog, setBlockDialog] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);
  const [blockError, setBlockError] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const [cannotSend, setCannotSend] = useState(false);
  const [menu, setMenu] = useState(false);

  const scroller = useRef(null);
  const menuRef = useRef(null);
  const composerRef = useRef(null);
  const stick = useRef(true);
  const prepend = useRef(null); // scrollHeight before older messages were added
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true; // re-arm after a StrictMode remount
    return () => { alive.current = false; };
  }, []);
  useDismiss(menuRef, menu, () => setMenu(false));

  const load = useCallback(async () => {
    setState({ status: "loading", messages: [], cursor: null, loadingEarlier: false });
    try {
      const page = await listMessages(conv.id);
      if (!alive.current) return;
      stick.current = true;
      setState({ status: "ready", messages: page.items, cursor: page.nextCursor, loadingEarlier: false });
      onRead?.(conv);
    } catch (err) {
      if (alive.current) setState({ status: err?.code === "unavailable" ? "unavailable" : "error", messages: [], cursor: null, loadingEarlier: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conv.id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let on = true;
    isBlockedByMe(conv.otherId).then((b) => on && setBlockedByMe(b)).catch(() => {});
    return () => { on = false; };
  }, [conv.otherId]);

  // Realtime: new messages and changes (deletes, read receipts) for this thread.
  useEffect(() => {
    if (!subscribe) return undefined;
    return subscribe((evt) => {
      const m = evt.message;
      if (!m || m.conversation_id !== conv.id) return;
      setState((s) => {
        if (evt.type === "update" && !s.messages.some((x) => x.id === m.id)) return s;
        // drop the optimistic copy when the echo of my own insert arrives first
        const list = evt.type === "insert" && m.sender_id === me
          ? s.messages.filter((x) => !(x.pending && x.content === m.content))
          : s.messages;
        return { ...s, messages: mergeMessages(list, [m]) };
      });
      if (evt.type === "insert" && m.sender_id !== me && document.visibilityState === "visible") onRead?.(conv);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscribe, conv.id, me]);

  // Scroll: keep the reader at the bottom unless they scrolled up; keep the
  // position steady when older messages are prepended.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (prepend.current != null) {
      el.scrollTop += el.scrollHeight - prepend.current;
      prepend.current = null;
    } else if (stick.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [state.messages]);

  // Late layout (lazy-rendered rows, images) keeps a reader at the bottom there.
  const listRef = useRef(null);
  const hasMessages = state.messages.length > 0;
  useEffect(() => {
    const el = listRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(() => {
      const box = scroller.current;
      if (box && stick.current && prepend.current == null) box.scrollTop = box.scrollHeight;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [state.status, hasMessages]);

  const onScroll = () => {
    const el = scroller.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  const loadEarlier = async () => {
    if (!state.cursor || state.loadingEarlier) return;
    setState((s) => ({ ...s, loadingEarlier: true }));
    try {
      const page = await listMessages(conv.id, { cursor: state.cursor });
      if (!alive.current) return;
      prepend.current = scroller.current?.scrollHeight ?? null;
      setState((s) => ({ ...s, messages: mergeMessages(page.items, s.messages), cursor: page.nextCursor, loadingEarlier: false }));
    } catch {
      if (alive.current) setState((s) => ({ ...s, loadingEarlier: false }));
    }
  };

  // Auto-load older messages when the top sentinel scrolls into view.
  const sentinel = useRef(null);
  const loadEarlierRef = useRef(loadEarlier);
  loadEarlierRef.current = loadEarlier;
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !state.cursor || typeof IntersectionObserver === "undefined") return undefined;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && scroller.current?.scrollTop > 0) loadEarlierRef.current();
    }, { root: scroller.current, rootMargin: "200px 0px 0px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [state.cursor, state.status]);

  const deliver = async (tempId, text) => {
    try {
      const saved = await sendMessage(conv.id, me, text);
      if (!alive.current) return;
      setState((s) => ({ ...s, messages: mergeMessages(s.messages.filter((x) => x.id !== tempId), [saved]) }));
      setCannotSend(false);
      onActivity?.(saved);
    } catch (err) {
      if (!alive.current) return;
      if (err?.code === "cannot_send") setCannotSend(true);
      setState((s) => ({ ...s, messages: s.messages.map((x) => (x.id === tempId ? { ...x, pending: false, failed: true } : x)) }));
    }
  };

  const send = (raw) => {
    const text = outgoingText(raw);
    if (!text) return;
    const temp = { id: `tmp-${Date.now()}-${tmp++}`, conversation_id: conv.id, sender_id: me, content: text, created_at: new Date().toISOString(), pending: true };
    stick.current = true;
    setSelectedId(null);
    setState((s) => ({ ...s, messages: [...s.messages, temp] }));
    deliver(temp.id, text);
  };

  const resend = (m) => {
    setState((s) => ({ ...s, messages: s.messages.map((x) => (x.id === m.id ? { ...x, failed: false, pending: true, created_at: new Date().toISOString() } : x)) }));
    deliver(m.id, m.content);
  };
  const discard = (m) => setState((s) => ({ ...s, messages: s.messages.filter((x) => x.id !== m.id) }));

  const confirmDelete = async () => {
    const m = toDelete;
    if (!m) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const updated = await deleteForEveryone(m.id);
      if (!alive.current) return;
      setState((s) => ({ ...s, messages: mergeMessages(s.messages, [updated]) }));
      onActivity?.(updated, { update: true });
      setToDelete(null);
      setSelectedId(null);
    } catch (err) {
      if (alive.current) setDeleteError(err?.code === "message_delete_window_expired" ? "deleteExpired" : "deleteError");
    } finally {
      if (alive.current) setDeleting(false);
    }
  };

  const toggleBlock = async () => {
    setBlockBusy(true);
    setBlockError(false);
    try {
      const next = await setBlocked(conv.otherId, !blockedByMe);
      if (!alive.current) return;
      setBlockedByMe(next);
      setCannotSend(false);
      setBlockDialog(false);
    } catch {
      if (alive.current) setBlockError(true);
    } finally {
      if (alive.current) setBlockBusy(false);
    }
  };

  const items = useMemo(() => buildThreadItems(state.messages, me), [state.messages, me]);
  const mode = composerState(conv, me, { blockedByMe });
  const profileHref = conv.other?.username ? `/u/${encodeURIComponent(conv.other.username)}` : null;

  const dayLabel = (key) => {
    const rel = relativeDay(key);
    if (rel) return t(`thread.${rel}`);
    const [y, mo, d] = key.split("-").map(Number);
    const date = new Date(y, mo - 1, d);
    const sameYear = y === new Date().getFullYear();
    return formatDate(date, locale, sameYear ? { weekday: "long", day: "numeric", month: "long" } : { day: "numeric", month: "long", year: "numeric" });
  };

  const Identity = (
    <>
      <Avatar src={conv.other?.avatar_url} name={name} alt="" size={40} />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5">
          <span dir={dirOfText(name)} className={cn("truncate font-bold text-ink", isRTL ? "text-right" : "text-left")}>{name}</span>
          {conv.other?.is_elite && conv.other?.show_elite_badge !== false && <EliteBadge size="xs" iconOnly />}
        </span>
        {conv.other?.username && <span dir="ltr" className="ltr block truncate text-start text-xs text-ink-3">@{conv.other.username}</span>}
      </span>
    </>
  );

  return (
    <section aria-label={name} className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-2 border-b border-line/10 px-2 py-2 sm:px-4 sm:py-2.5">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label={t("thread.back")} className="md:hidden">
          <ArrowLeft size={20} className="flip-rtl" aria-hidden="true" />
        </Button>
        {profileHref ? (
          <Link href={profileHref} className="flex min-w-0 flex-1 items-center gap-3 rounded-md py-1 pe-2">{Identity}</Link>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-3 py-1">{Identity}</div>
        )}
        <div ref={menuRef} className="relative">
          <Button variant="ghost" size="icon" onClick={() => setMenu((v) => !v)} aria-label={t("thread.menu")} aria-expanded={menu} aria-haspopup="menu">
            <MoreVertical size={19} aria-hidden="true" />
          </Button>
          {menu && (
            <div role="menu" className="animate-scale absolute end-0 top-full z-20 mt-1 w-56 overflow-hidden rounded-md border border-line/15 bg-surface p-1 shadow-lg">
              {profileHref && (
                <Link role="menuitem" href={profileHref} onClick={() => setMenu(false)} className="flex h-10 items-center gap-2.5 rounded-sm px-3 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink">
                  <UserRound size={16} aria-hidden="true" />
                  {t("thread.viewProfile")}
                </Link>
              )}
              <button
                role="menuitem"
                type="button"
                onClick={() => { setMenu(false); setBlockError(false); setBlockDialog(true); }}
                className={cn("flex h-10 w-full items-center gap-2.5 rounded-sm px-3 text-start text-sm hover:bg-surface-2", blockedByMe ? "text-ink-2" : "text-danger")}
              >
                {blockedByMe ? <ShieldOff size={16} aria-hidden="true" /> : <Ban size={16} aria-hidden="true" />}
                {blockedByMe ? t("thread.unblock") : t("thread.block")}
              </button>
            </div>
          )}
        </div>
      </header>

      <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-surface-2/40 px-3 pb-4 sm:px-5">
        {state.status === "loading" ? (
          <ThreadSkeleton />
        ) : state.status !== "ready" ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <p role="alert" className="font-medium text-ink">{state.status === "unavailable" ? t("errors.unavailable") : t("thread.loadError")}</p>
            <Button size="sm" variant="secondary" iconStart={RotateCcw} onClick={load} className="mt-3">{t("thread.retry")}</Button>
          </div>
        ) : (
          <>
            <div ref={sentinel} aria-hidden="true" className="h-px" />
            {state.cursor && (
              <div className="flex justify-center pt-4">
                <Button size="sm" variant="ghost" loading={state.loadingEarlier} onClick={loadEarlier} className="h-8">{t("thread.loadEarlier")}</Button>
              </div>
            )}
            {items.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center py-12 text-center">
                <Avatar src={conv.other?.avatar_url} name={name} alt="" size={64} />
                <p dir="auto" className="mt-3 font-bold text-ink">{name}</p>
                <p className="t-small mt-1 max-w-xs text-ink-3">{mode === "ok" || mode === "requestSent" ? t("thread.empty.body") : t("thread.empty.title")}</p>
              </div>
            ) : (
              <ol ref={listRef} aria-label={name} className="pt-2">
                {items.map((it) =>
                  it.type === "day" ? (
                    <li key={`d-${it.key}`} className="sticky top-2 z-[1] flex justify-center pb-1 pt-4">
                      <span className="rounded-full border border-line/10 bg-surface/95 px-3 py-1 text-xs font-medium text-ink-3 shadow-xs backdrop-blur">{dayLabel(it.key)}</span>
                    </li>
                  ) : (
                    <li key={it.message.id} className="[content-visibility:auto] [contain-intrinsic-size:auto_64px]">
                      <MessageBubble
                        item={it}
                        me={me}
                        selected={selectedId === it.message.id}
                        onSelect={setSelectedId}
                        onDelete={(m) => { setDeleteError(null); setToDelete(m); }}
                        onResend={resend}
                        onDiscard={discard}
                      />
                    </li>
                  )
                )}
              </ol>
            )}
          </>
        )}
      </div>

      <Footer
        mode={mode}
        name={inText}
        cannotSend={cannotSend}
        onSend={send}
        composerRef={composerRef}
        disabled={state.status !== "ready"}
        respondBusy={respondBusy}
        onAccept={() => onRespond?.(conv, true)}
        onIgnore={() => onRespond?.(conv, false)}
        onUnblock={() => { setBlockError(false); setBlockDialog(true); }}
      />

      <Dialog
        open={Boolean(toDelete)}
        onClose={() => !deleting && setToDelete(null)}
        size="sm"
        title={t("thread.deleteTitle")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setToDelete(null)} disabled={deleting}>{tc("actions.cancel")}</Button>
            <Button variant="danger" onClick={confirmDelete} loading={deleting}>{t("thread.deleteConfirm")}</Button>
          </>
        }
      >
        <p className="t-small text-ink-3">{t("thread.deleteBody")}</p>
        {deleteError && <Alert tone="danger" className="mt-4">{t(`thread.${deleteError}`)}</Alert>}
      </Dialog>

      <Dialog
        open={blockDialog}
        onClose={() => !blockBusy && setBlockDialog(false)}
        size="sm"
        title={blockedByMe ? t("thread.unblockTitle", { name: inText }) : t("thread.blockTitle", { name: inText })}
        footer={
          <>
            <Button variant="ghost" onClick={() => setBlockDialog(false)} disabled={blockBusy}>{tc("actions.cancel")}</Button>
            <Button variant={blockedByMe ? "primary" : "danger"} onClick={toggleBlock} loading={blockBusy}>
              {blockedByMe ? t("thread.unblockConfirm") : t("thread.blockConfirm")}
            </Button>
          </>
        }
      >
        <p className="t-small text-ink-3">{blockedByMe ? t("thread.unblockBody") : t("thread.blockBody")}</p>
        {blockError && <Alert tone="danger" className="mt-4">{t("thread.blockError")}</Alert>}
      </Dialog>
    </section>
  );
}

function Footer({ mode, name, cannotSend, onSend, composerRef, disabled, respondBusy, onAccept, onIgnore, onUnblock }) {
  const t = useT("chat");
  if (mode === "incomingRequest") {
    return (
      <div className="border-t border-line/10 bg-surface p-3 sm:p-4">
        <div className="rounded-lg border border-line/15 bg-surface-2/60 p-4 text-center">
          <p className="font-medium text-ink">{t("thread.states.incomingRequest.title", { name })}</p>
          <p className="t-caption mx-auto mt-1 max-w-sm">{t("thread.states.incomingRequest.body")}</p>
          <div className="mt-3 flex justify-center gap-2">
            <Button size="sm" onClick={onAccept} loading={respondBusy === "accept"} disabled={Boolean(respondBusy)}>{t("requests.accept")}</Button>
            <Button size="sm" variant="secondary" onClick={onIgnore} loading={respondBusy === "ignore"} disabled={Boolean(respondBusy)}>{t("requests.ignore")}</Button>
          </div>
        </div>
      </div>
    );
  }
  if (mode === "declined" || mode === "blockedByMe") {
    return (
      <div className="border-t border-line/10 bg-surface px-4 py-3.5">
        <p className="flex items-center justify-center gap-2 text-center text-sm text-ink-3">
          <Ban size={15} className="shrink-0" aria-hidden="true" />
          {mode === "declined" ? t("thread.states.declined", { name }) : t("thread.states.blockedByMe")}
        </p>
        {mode === "blockedByMe" && (
          <div className="mt-2 flex justify-center">
            <Button size="sm" variant="secondary" onClick={onUnblock}>{t("thread.unblock")}</Button>
          </div>
        )}
      </div>
    );
  }
  return (
    <>
      {(mode === "requestSent" || cannotSend) && (
        <p className="flex items-start gap-2 border-t border-line/10 bg-info-soft/60 px-4 py-2.5 text-[0.8125rem] leading-relaxed text-ink-2">
          <Info size={15} className="mt-0.5 shrink-0 text-info" aria-hidden="true" />
          {cannotSend ? t("thread.states.cannotSend") : t("thread.states.requestSent", { name })}
        </p>
      )}
      <ThreadComposer ref={composerRef} name={name} onSend={onSend} disabled={disabled} />
    </>
  );
}

function ThreadSkeleton() {
  const rows = [["s", "w-2/3"], ["e", "w-1/2"], ["e", "w-1/3"], ["s", "w-3/5"], ["e", "w-2/5"], ["s", "w-1/2"]];
  return (
    <div aria-hidden="true" className="space-y-3 py-6">
      <div className="flex justify-center"><Skeleton rounded="full" className="h-6 w-20" /></div>
      {rows.map(([side, w], i) => (
        <Fragment key={i}>
          <div className={cn("flex", side === "e" ? "justify-end" : "justify-start")}>
            <Skeleton rounded="lg" className={cn("h-11", w)} />
          </div>
        </Fragment>
      ))}
    </div>
  );
}
