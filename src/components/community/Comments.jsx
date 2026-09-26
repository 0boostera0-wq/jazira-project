"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Flag, MoreHorizontal, SendHorizontal, Trash2 } from "lucide-react";
import { useLocale, useT } from "@/i18n/client";
import { Link } from "@/i18n/navigation";
import { formatDate, formatRelative } from "@/i18n/format";
import Button from "@/components/ui/Button";
import Alert from "@/components/ui/Alert";
import Skeleton from "@/components/ui/Skeleton";
import EliteBadge from "@/components/subscriptions/EliteBadge";
import { cn } from "@/components/ui/cn";
import AuthorAvatar from "./AuthorAvatar";
import RichText from "./RichText";
import { MenuButton } from "./MenuButton";
import { COMMENT_MAX } from "./model";
import { textProps } from "./text";

const PAGE = 20;
const ConfirmDialog = dynamic(() => import("./dialogs").then((m) => m.ConfirmDialog), { ssr: false });
const ReportDialog = dynamic(() => import("./dialogs").then((m) => m.ReportDialog), { ssr: false });

/**
 * Comment thread under a post: newest page first, shown oldest → newest,
 * "show earlier" loads the previous page. Optimistic send with rollback.
 */
export default function Comments({ post, api, viewer, askSignIn, onCountChange, autoFocus = false }) {
  const t = useT("community");
  const { locale } = useLocale();
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | ready | unavailable | error
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [text, setText] = useState("");
  const [sendError, setSendError] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const input = useRef(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await api.listComments(post.id, { limit: PAGE });
        if (!alive) return;
        if (!res.available) { setStatus("unavailable"); return; }
        setItems([...res.items].reverse());
        setCursor(res.nextCursor);
        setStatus("ready");
      } catch {
        if (alive) setStatus("error");
      }
    })();
    return () => { alive = false; };
  }, [api, post.id, attempt]);

  const retry = () => { setStatus("loading"); setAttempt((n) => n + 1); };

  useEffect(() => {
    if (autoFocus && status === "ready" && viewer.isSignedIn) input.current?.focus({ preventScroll: true });
  }, [autoFocus, status, viewer.isSignedIn]);

  const loadEarlier = async () => {
    if (!cursor) return;
    setLoadingEarlier(true);
    try {
      const res = await api.listComments(post.id, { limit: PAGE, cursor });
      setItems((prev) => [...[...res.items].reverse().filter((c) => !prev.some((p) => p.id === c.id)), ...prev]);
      setCursor(res.nextCursor);
    } catch {
      setSendError({ code: "network" });
    } finally {
      setLoadingEarlier(false);
    }
  };

  const send = async (e) => {
    e?.preventDefault();
    if (!viewer.isSignedIn) return askSignIn();
    const body = text.trim();
    if (!body || body.length > COMMENT_MAX) return;
    const temp = {
      id: `temp-${Date.now()}`,
      content: body,
      created_at: new Date().toISOString(),
      mine: true,
      pending: true,
      author: viewer.anonymous
        ? { anonymous: true }
        : { anonymous: false, id: viewer.userId, username: viewer.username, name: viewer.name, avatar: viewer.avatar, elite: viewer.elite },
    };
    setItems((prev) => [...prev, temp]);
    setText("");
    setSendError(null);
    onCountChange(1);
    try {
      const saved = await api.addComment(post.id, body);
      setItems((prev) => prev.map((c) => (c.id === temp.id ? saved : c)));
    } catch (err) {
      setItems((prev) => prev.filter((c) => c.id !== temp.id));
      setText(body);
      onCountChange(-1);
      setSendError(err);
    }
  };

  const remove = async (c) => {
    await api.deleteComment(c.id);
    setItems((prev) => prev.filter((x) => x.id !== c.id));
    onCountChange(-1);
  };

  const over = text.length > COMMENT_MAX;

  return (
    <section aria-label={t("comments.title")} className="mt-4 border-t border-line/10 pt-4">
      {status === "loading" && <CommentsSkeleton />}
      {status === "unavailable" && <p className="t-small text-ink-3">{t("comments.unavailable")}</p>}
      {status === "error" && (
        <p role="alert" className="t-small flex flex-wrap items-center gap-x-3 gap-y-1 text-danger">
          {t("errors.network")}
          <button type="button" onClick={retry} className="font-medium text-gold-600 hover:underline hover:underline-offset-4">{t("feed.retry")}</button>
        </p>
      )}

      {status === "ready" && (
        <>
          {cursor && (
            <button type="button" onClick={loadEarlier} disabled={loadingEarlier} className="mb-3 text-sm font-medium text-gold-600 hover:underline hover:underline-offset-4 disabled:opacity-60">
              {loadingEarlier ? t("comments.loading") : t("comments.loadEarlier")}
            </button>
          )}
          {items.length === 0 ? (
            <p className="t-small text-ink-3">{t("comments.empty")}</p>
          ) : (
            <ol className="space-y-3.5">
              {items.map((c) => (
                <li key={c.id} className={cn("flex items-start gap-2.5", c.pending && "opacity-60")}>
                  <AuthorAvatar author={c.author} size={32} className="mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="rounded-md bg-surface-2 px-3.5 py-2.5">
                      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                        <CommentAuthor author={c.author} mine={c.mine} t={t} />
                        <time dateTime={c.created_at} title={formatDate(c.created_at, locale, { dateStyle: "medium", timeStyle: "short" })} className="t-caption">
                          {c.pending ? t("comments.sending") : formatRelative(c.created_at, locale)}
                        </time>
                      </div>
                      <RichText text={c.content} className="t-small mt-0.5 text-ink-2" />
                    </div>
                  </div>
                  {!c.pending && (
                    <MenuButton
                      label={t("comments.menu")}
                      trigger={<MoreHorizontal size={16} aria-hidden="true" />}
                      triggerClassName="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-ink"
                      items={[
                        c.mine && { key: "delete", icon: Trash2, tone: "danger", label: t("comments.delete"), onSelect: () => setDialog({ type: "delete", comment: c }) },
                        !c.mine && { key: "report", icon: Flag, label: t("comments.report"), onSelect: () => (viewer.isSignedIn ? setDialog({ type: "report", comment: c }) : askSignIn()) },
                      ]}
                    />
                  )}
                </li>
              ))}
            </ol>
          )}
        </>
      )}

      {status !== "unavailable" && (
        viewer.isSignedIn ? (
          <form onSubmit={send} className="mt-4 flex items-end gap-2">
            <label htmlFor={`c-${post.id}`} className="sr-only">{t("comments.placeholder")}</label>
            <textarea
              ref={input}
              id={`c-${post.id}`}
              dir="auto"
              rows={1}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onInput={(e) => { e.currentTarget.style.height = "auto"; e.currentTarget.style.height = `${Math.min(e.currentTarget.scrollHeight, 160)}px`; }}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) send(e); }}
              placeholder={t("comments.placeholder")}
              aria-invalid={over || undefined}
              className="min-h-11 flex-1 resize-none rounded-md border border-line/20 bg-surface px-3.5 py-2.5 text-[1rem] leading-relaxed text-ink shadow-xs placeholder:text-ink-4 focus:border-gold-400 focus:shadow-[0_0_0_3px_rgb(var(--c-gold-400)/0.18)] focus:outline-none"
            />
            <Button type="submit" size="icon" disabled={!text.trim() || over} aria-label={t("comments.send")}>
              <SendHorizontal size={18} aria-hidden="true" className="flip-rtl" />
            </Button>
          </form>
        ) : (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed border-line/20 px-4 py-3">
            <p className="t-small text-ink-3">{t("comments.signInBody")}</p>
            <Button size="sm" variant="secondary" onClick={askSignIn}>{t("comments.signIn")}</Button>
          </div>
        )
      )}
      {over && <p className="mt-1.5 text-[0.8125rem] text-danger">{t("composer.errors.tooLong", { max: COMMENT_MAX })}</p>}
      {sendError && <Alert tone="danger" className="mt-3">{t(`errors.${sendError.code || "unknown"}`)}</Alert>}

      {dialog?.type === "delete" && (
        <ConfirmDialog
          title={t("dialogs.deleteComment.title")}
          body={t("dialogs.deleteComment.body")}
          confirmLabel={t("dialogs.deleteComment.confirm")}
          onConfirm={() => remove(dialog.comment)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === "report" && (
        <ReportDialog api={api} targetType="comment" targetId={dialog.comment.id} onClose={() => setDialog(null)} />
      )}
    </section>
  );
}

function CommentAuthor({ author, mine, t }) {
  if (author.anonymous) {
    return <span className="text-sm font-medium text-ink">{mine ? t("post.anonymousYou") : t("post.anonymous")}</span>;
  }
  const name = author.name || t("post.unknown");
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {author.username ? (
        <Link href={`/u/${encodeURIComponent(author.username)}`} {...textProps(name, "truncate text-sm font-medium text-ink hover:underline hover:underline-offset-4")}>{name}</Link>
      ) : (
        <span className="truncate text-sm font-medium text-ink">{name}</span>
      )}
      {author.elite && <EliteBadge size="xs" iconOnly />}
    </span>
  );
}

export function CommentsSkeleton() {
  return (
    <div className="space-y-3.5" aria-hidden="true">
      {[0, 1].map((i) => (
        <div key={i} className="flex items-start gap-2.5">
          <Skeleton rounded="full" className="h-8 w-8 shrink-0" />
          <Skeleton rounded="md" className={cn("h-14 flex-1", i && "max-w-[70%]")} />
        </div>
      ))}
    </div>
  );
}
