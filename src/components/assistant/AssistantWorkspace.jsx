"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { History, LogIn, RotateCcw, SquarePen, AlertCircle } from "lucide-react";
import { useT, useLocale } from "@/i18n/client";
import { useRouter } from "@/i18n/navigation";
import { useAuthUser } from "@/context/AuthProvider";
import { usePreferences } from "@/context/PreferencesProvider";
import { deleteSession, deriveTitle, getSession } from "@/lib/chatStore";
import AssistantAvatar from "@/components/brand/AssistantAvatar";
import Button from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";
import Alert from "@/components/ui/Alert";
import { cn } from "@/components/ui/cn";
import { textProps } from "@/components/community/text";
import { useAssistantChat } from "./useAssistantChat";
import { useQuota, useSessions } from "./hooks";
import Conversation from "./Conversation";
import Composer from "./Composer";
import Welcome from "./Welcome";
import HistoryPanel from "./HistoryPanel";
import QuotaCard, { QuotaInline, TipsCard, useAllowance } from "./QuotaCard";
import { QuotaReached } from "./MessageItem";

// Pane heights: the conversation fills the viewport under the top bar (and
// above the bottom tab bar on phones/tablets) so the composer stays in reach.
const PANE_H =
  "h-[calc(100dvh-var(--topbar-h)-var(--bottomnav-h)-env(safe-area-inset-bottom)-3.5rem)] " +
  "sm:h-[calc(100dvh-var(--topbar-h)-var(--bottomnav-h)-env(safe-area-inset-bottom)-4rem)] " +
  "lg:h-[calc(100dvh-var(--topbar-h)-3.5rem)]";

/**
 * /assistant — conversation (main) + rail (balance, past chats) on desktop;
 * on phones the rail lives in a bottom sheet. Guests see everything, with a
 * sign-in prompt where the composer would be.
 */
export default function AssistantWorkspace() {
  const t = useT("assistant");
  const tc = useT("common");
  const { locale } = useLocale();
  const router = useRouter();
  const { isLoaded, isSignedIn, name } = useAuthUser();
  const { aiSuggestions } = usePreferences();
  const enabled = isLoaded && isSignedIn;

  const quota = useQuota(enabled);
  const sessions = useSessions(enabled);
  const { refresh: refreshQuota, markExhausted } = quota;
  const { upsert: upsertSession, remove: removeSession, restore: restoreSession } = sessions;

  const [draft, setDraft] = useState("");
  const [sheet, setSheet] = useState(false);
  const [opening, setOpening] = useState(null); // session being loaded
  const [openError, setOpenError] = useState(null); // session that failed to load
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(false);
  const [announce, setAnnounce] = useState("");
  const composerRef = useRef(null);
  const openCtrl = useRef(null);

  const onReplyDone = useCallback(({ sessionId, firstUser }) => {
    upsertSession({ id: sessionId, title: deriveTitle(firstUser), lastAt: new Date().toISOString() });
    refreshQuota();
    setAnnounce(t("page.announceDone"));
  }, [upsertSession, refreshQuota, t]);

  const chat = useAssistantChat({ locale, onReplyDone, onQuotaExhausted: markExhausted });
  const { send, reset, load, stop, retry } = chat;

  // ?topic=<lesson> (curriculum links) or ?q=<prompt> prefill the composer —
  // never sent automatically. The query is then removed from the address bar.
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const topic = (sp.get("topic") || "").trim().slice(0, 120);
      const q = (sp.get("q") || "").trim().slice(0, 1000);
      if (topic) setDraft(t("prefill.topic", { topic }));
      else if (q) setDraft(q);
      if (sp.has("topic") || sp.has("q")) window.history.replaceState(window.history.state, "", window.location.pathname);
    } catch {}
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => openCtrl.current?.abort(), []);

  const toSignIn = useCallback((prompt) => {
    const next = prompt ? `/assistant?q=${encodeURIComponent(prompt)}` : "/assistant";
    router.push(`/sign-in?next=${encodeURIComponent(next)}`);
  }, [router]);

  const submit = (text) => {
    if (!isSignedIn) return toSignIn(text);
    if (send(text)) {
      setDraft("");
      setAnnounce("");
    }
  };

  const onTemplate = (template) => {
    if (isLoaded && !isSignedIn) return toSignIn(template);
    setDraft(template);
    requestAnimationFrame(() => composerRef.current?.focus());
  };

  const onAsk = (prompt) => {
    if (isLoaded && !isSignedIn) return toSignIn(prompt);
    if (!isLoaded || quota.exhausted || chat.busy || opening) {
      setDraft(prompt);
      return;
    }
    send(prompt);
  };

  const newChat = useCallback(() => {
    openCtrl.current?.abort();
    reset();
    setOpening(null);
    setOpenError(null);
    setDraft("");
    setSheet(false);
  }, [reset]);

  const openSession = useCallback(async (session) => {
    setSheet(false);
    if (session.id === chat.sessionId && !openError) return;
    openCtrl.current?.abort();
    const ctrl = new AbortController();
    openCtrl.current = ctrl;
    stop();
    setOpenError(null);
    setOpening(session.id);
    try {
      const res = await getSession(session.id, { signal: ctrl.signal });
      if (ctrl.signal.aborted) return;
      load(session.id, res.messages, { truncated: res.truncated });
      setDraft("");
      setOpening(null);
    } catch (err) {
      if (ctrl.signal.aborted || err?.code === "aborted") return;
      setOpening(null);
      setOpenError(session);
    }
  }, [chat.sessionId, openError, stop, load]);

  const confirmDelete = async () => {
    const s = toDelete;
    if (!s) return;
    setDeleting(true);
    setDeleteError(false);
    try {
      await deleteSession(s.id);
      removeSession(s.id);
      if (s.id === chat.sessionId || s.id === openError?.id) newChat();
      setToDelete(null);
    } catch {
      restoreSession(s);
      setDeleteError(true);
    } finally {
      setDeleting(false);
    }
  };

  const hasConversation = chat.messages.length > 0 || Boolean(opening) || Boolean(openError);
  const status = opening ? t("page.status.loading") : chat.busy ? t("page.status.writing") : t("page.status.ready");

  // Visitors keep their (prefilled) question through sign-in / sign-up.
  const back = encodeURIComponent(draft.trim() ? `/assistant?q=${encodeURIComponent(draft.trim().slice(0, 1000))}` : "/assistant");
  const railProps = { isLoaded, isSignedIn, next: back };
  const historyProps = {
    sessions,
    activeId: opening || chat.sessionId,
    onOpen: openSession,
    onNew: newChat,
    onDelete: (s) => { setDeleteError(false); setToDelete(s); },
    ...railProps,
  };

  return (
    <>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:-mb-10 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_320px]">
        <section aria-labelledby="jz-assistant-title" className={cn("surface flex min-h-[440px] flex-col overflow-hidden", PANE_H)}>
          <header className="flex items-center gap-3 border-b border-line/10 px-4 py-3 sm:px-5">
            <AssistantAvatar size={40} loading="eager" status={chat.busy ? "thinking" : undefined} />
            <div className="min-w-0 flex-1">
              <h1 id="jz-assistant-title" className="truncate text-[1.0625rem] font-bold leading-snug text-ink">{t("page.title")}</h1>
              <p className="t-caption flex items-center gap-1.5">
                <span aria-hidden="true" className={cn("h-1.5 w-1.5 shrink-0 rounded-full", chat.busy || opening ? "bg-gold-500" : "bg-green-500")} />
                <span className="truncate">{status}</span>
              </p>
            </div>
            {isSignedIn && (
              <Button
                variant="ghost"
                size="sm"
                iconStart={SquarePen}
                onClick={newChat}
                disabled={!hasConversation}
                aria-label={t("page.newChat")}
                className="px-2.5 sm:px-3.5 lg:hidden"
              >
                <span className="hidden sm:inline">{t("page.newChat")}</span>
              </Button>
            )}
            <Button variant="secondary" size="icon" onClick={() => setSheet(true)} aria-label={t("page.historyLabel")} title={t("page.history")} className="lg:hidden">
              <History size={18} aria-hidden="true" />
            </Button>
          </header>

          {openError ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-md bg-danger-soft text-danger"><AlertCircle size={22} aria-hidden="true" /></span>
              <p role="alert" className="mt-3 font-medium text-ink">{t("history.openError")}</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Button size="sm" iconStart={RotateCcw} onClick={() => openSession(openError)}>{t("history.retry")}</Button>
                <Button size="sm" variant="secondary" iconStart={SquarePen} onClick={newChat}>{t("page.newChat")}</Button>
              </div>
            </div>
          ) : (
            <Conversation
              messages={chat.messages}
              busy={chat.busy}
              exhausted={quota.exhausted}
              onRetry={retry}
              loading={Boolean(opening)}
              truncated={chat.truncated}
              welcome={<Welcome name={isSignedIn ? name : ""} showSuggestions={aiSuggestions !== false} disabled={isSignedIn && quota.exhausted} onTemplate={onTemplate} onAsk={onAsk} />}
            />
          )}

          {isLoaded && !isSignedIn ? (
            <GuestBar next={back} />
          ) : quota.exhausted && !chat.busy ? (
            <div className="border-t border-line/10 bg-surface px-3 py-3 sm:px-5 sm:py-4">
              <QuotaReached quota={{ resetsAt: quota.resetsAt }} className="mx-auto max-w-3xl" />
            </div>
          ) : (
            <Composer
              ref={composerRef}
              value={draft}
              onChange={setDraft}
              onSubmit={submit}
              onStop={stop}
              busy={chat.busy}
              disabled={!isLoaded || Boolean(opening)}
              footer={<span className="lg:hidden"><QuotaInline quota={quota} /></span>}
            />
          )}
        </section>

        <aside className={cn("hidden min-h-0 flex-col gap-4 lg:flex", PANE_H)}>
          {/* when exhausted, the upgrade action lives in the composer spot */}
          <QuotaCard quota={quota} {...railProps} upgrade={false} className="shrink-0" />
          {isLoaded && !isSignedIn ? <TipsCard className="shrink-0" /> : <HistoryPanel {...historyProps} className="min-h-[200px] flex-1" />}
        </aside>
      </div>

      <Dialog open={sheet} onClose={() => setSheet(false)} variant="sheet" title={t("page.history")}>
        <div className="space-y-5">
          <QuotaCard quota={quota} {...railProps} guestActions />
          {isLoaded && !isSignedIn ? <TipsCard /> : <HistoryPanel {...historyProps} variant="sheet" />}
        </div>
      </Dialog>

      <Dialog
        open={Boolean(toDelete)}
        onClose={() => !deleting && setToDelete(null)}
        size="sm"
        title={t("history.deleteTitle")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setToDelete(null)} disabled={deleting}>{tc("actions.cancel")}</Button>
            <Button variant="danger" onClick={confirmDelete} loading={deleting}>{t("history.deleteConfirm")}</Button>
          </>
        }
      >
        {toDelete && <p {...textProps(toDelete.title || t("history.untitled"), "mb-3 truncate font-medium text-ink")}>{toDelete.title || t("history.untitled")}</p>}
        <p className="t-small text-ink-3">{t("history.deleteBody")}</p>
        {deleteError && <Alert tone="danger" className="mt-4">{t("history.deleteError")}</Alert>}
      </Dialog>

      <p aria-live="polite" className="sr-only">{announce}</p>
    </>
  );
}

/** Where the composer would be, for signed-out visitors. */
function GuestBar({ next }) {
  const t = useT("assistant");
  const allowance = useAllowance();
  return (
    <div className="border-t border-line/10 bg-surface px-3 py-3 sm:px-5 sm:py-4">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-4 gap-y-2.5 rounded-lg border border-gold-200/70 bg-gold-50 px-4 py-3">
        <div className="min-w-0 flex-1 basis-60">
          <p className="text-[0.9375rem] font-medium text-ink">{t("guest.title")}</p>
          <p className="t-caption mt-0.5">{t("guest.body", allowance)}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button href={`/sign-in?next=${next}`} size="sm" iconStart={LogIn}>{t("guest.signIn")}</Button>
          <Button href={`/sign-up?next=${next}`} size="sm" variant="secondary">{t("guest.signUp")}</Button>
        </div>
      </div>
    </div>
  );
}
