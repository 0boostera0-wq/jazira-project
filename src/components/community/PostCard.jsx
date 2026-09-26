"use client";

import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  Ban, Check, EyeOff, Flag, Heart, ImageOff, Link2, MessageCircle, MoreHorizontal, Pencil,
  RefreshCw, Repeat2, Share2, ThumbsDown, Trash2,
} from "lucide-react";
import { useLocale, useT } from "@/i18n/client";
import { Link, localizeHref } from "@/i18n/navigation";
import { formatDate, formatNumber, formatRelative } from "@/i18n/format";
import Alert from "@/components/ui/Alert";
import EliteBadge from "@/components/subscriptions/EliteBadge";
import { cn } from "@/components/ui/cn";
import AuthorAvatar from "./AuthorAvatar";
import FollowButton from "./FollowButton";
import MediaView from "./MediaView";
import RichText from "./RichText";
import { MenuButton } from "./MenuButton";
import { CommentsSkeleton } from "./Comments";
import { setFollowLocal } from "./followStore";
import { IMAGE_TYPES, VIDEO_TYPES, applyReaction } from "./model";
import { prepareMedia } from "./media";
import { textProps } from "./text";

const Comments = dynamic(() => import("./Comments"), { ssr: false, loading: () => <div className="mt-4 border-t border-line/10 pt-4"><CommentsSkeleton /></div> });

// Dialogs load on first use — they are not needed to read the feed.
const ConfirmDialog = dynamic(() => import("./dialogs").then((m) => m.ConfirmDialog), { ssr: false });
const EditPostDialog = dynamic(() => import("./dialogs").then((m) => m.EditPostDialog), { ssr: false });
const ReportDialog = dynamic(() => import("./dialogs").then((m) => m.ReportDialog), { ssr: false });

const ACCEPT_MEDIA = [...Object.keys(IMAGE_TYPES), ...Object.keys(VIDEO_TYPES)].join(",");
const isLong = (s) => s.length > 520 || s.split("\n").length > 9;

/**
 * One post. All mutations are optimistic where safe (reactions, comment
 * counts) and roll back with an inline message on failure. The parent owns
 * the post object: `onPatch(id, patch)` / `onRemove(id)` / `onBlocked(userId)`.
 */
export default function PostCard({ post, api, viewer, askSignIn, onPatch, onRemove, onBlocked, commentsOpen: startOpen = false, showFollow = true, level = 3 }) {
  const t = useT("community");
  const { locale } = useLocale();
  const [commentsOpen, setCommentsOpen] = useState(startOpen);
  const [expanded, setExpanded] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [mediaBusy, setMediaBusy] = useState(false);
  const pending = useRef(false);
  const fileRef = useRef(null);

  const { author, counts, viewer: mine } = post;
  const H = `h${Math.min(6, Math.max(2, level))}`;
  const nameId = `post-${post.id}-author`;
  const authorName = author.anonymous ? (post.mine ? t("post.anonymousYou") : t("post.anonymous")) : author.name || t("post.unknown");
  const canBlock = !post.mine && !author.anonymous && Boolean(author.id);
  const long = isLong(post.content);

  const fail = (e) => setError(e?.code && e.code !== "aborted" ? e.code : "unknown");

  // ── reactions (optimistic + rollback) ──
  const react = async (kind) => {
    if (!viewer.isSignedIn) return askSignIn();
    if (pending.current) return;
    const before = { ...mine, ...counts };
    const { next, ops } = applyReaction(before, kind);
    const patch = (s) => onPatch(post.id, {
      viewer: { liked: s.liked, disliked: s.disliked, reposted: s.reposted },
      counts: { ...counts, likes: s.likes, dislikes: s.dislikes, reposts: s.reposts },
    });
    patch(next);
    setError(null);
    pending.current = true;
    try {
      await api.runReactionOps(post.id, ops);
    } catch (e) {
      patch(before);
      fail(e);
    } finally {
      pending.current = false;
    }
  };

  // "Share" uses the system sheet on touch devices; "Copy link" always copies.
  const share = async (copyOnly = false) => {
    const url = `${window.location.origin}${localizeHref(`/community/post/${post.id}`, locale)}`;
    try {
      if (!copyOnly && navigator.share && window.matchMedia?.("(pointer: coarse)").matches) {
        await navigator.share({ url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const pickMedia = () => fileRef.current?.click();
  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const info = await prepareMedia(file);
    if (info.error) { setError(`media.${info.error}`); return; }
    setMediaBusy(true);
    setError(null);
    try {
      const media = await api.replacePostMedia(post, file, info.dims);
      onPatch(post.id, { media });
    } catch (err) {
      fail(err);
    } finally {
      setMediaBusy(false);
    }
  };

  const menu = post.mine
    ? [
        { key: "edit", icon: Pencil, label: t("post.menu.edit"), onSelect: () => setDialog("edit") },
        { key: "media", icon: RefreshCw, label: post.media ? t("post.menu.replaceMedia") : t("post.menu.addMedia"), onSelect: pickMedia },
        post.media && post.content.trim() && { key: "removeMedia", icon: ImageOff, label: t("post.menu.removeMedia"), onSelect: () => setDialog("removeMedia") },
        { key: "copy", icon: Link2, label: t("post.menu.copyLink"), onSelect: () => share(true) },
        { key: "d", divider: true },
        { key: "delete", icon: Trash2, tone: "danger", label: t("post.menu.delete"), onSelect: () => setDialog("delete") },
      ]
    : [
        { key: "copy", icon: Link2, label: t("post.menu.copyLink"), onSelect: () => share(true) },
        { key: "report", icon: Flag, label: t("post.menu.report"), onSelect: () => (viewer.isSignedIn ? setDialog("report") : askSignIn()) },
        canBlock && { key: "block", icon: Ban, tone: "danger", label: t("post.menu.block", { name: authorName }), onSelect: () => (viewer.isSignedIn ? setDialog("block") : askSignIn()) },
      ];

  return (
    <article id={`post-${post.id}`} aria-labelledby={nameId} className="surface animate-fade scroll-mt-24 p-4 sm:p-5">
      {/* ── header ── */}
      <header className="flex items-start gap-3">
        {author.username && !author.anonymous ? (
          <Link href={`/u/${encodeURIComponent(author.username)}`} tabIndex={-1} aria-hidden="true" className="shrink-0 rounded-full">
            <AuthorAvatar author={author} size={42} />
          </Link>
        ) : (
          <AuthorAvatar author={author} size={42} />
        )}
        <div className="min-w-0 flex-1">
          <H id={nameId} className="flex min-w-0 items-center gap-1.5 text-[0.9375rem] font-medium leading-snug text-ink">
            {author.username && !author.anonymous ? (
              <Link href={`/u/${encodeURIComponent(author.username)}`} {...textProps(authorName, "truncate hover:underline hover:underline-offset-4")}>{authorName}</Link>
            ) : (
              <span className={cn("truncate", author.anonymous && "text-ink-2")}>{authorName}</span>
            )}
            {author.anonymous && <EyeOff size={14} aria-hidden="true" className="shrink-0 text-ink-4" />}
            {author.elite && <EliteBadge size="xs" iconOnly />}
          </H>
          <p className="t-caption mt-0.5 flex min-w-0 items-center gap-1.5">
            {author.username && !author.anonymous && (
              <>
                <span dir="ltr" className="truncate">@{author.username}</span>
                <span aria-hidden="true">·</span>
              </>
            )}
            {post.mine && author.anonymous && (
              // Own anonymous post (feed, own profile): others never see who wrote it.
              <>
                <span className="inline-flex min-w-0 items-center gap-1 text-ink-3">
                  <EyeOff size={12} aria-hidden="true" className="shrink-0" />
                  <span className="truncate">{t("post.onlyYou")}</span>
                </span>
                <span aria-hidden="true">·</span>
              </>
            )}
            <Link href={`/community/post/${post.id}`} className="shrink-0 hover:text-ink hover:underline hover:underline-offset-4">
              <time dateTime={post.created_at} title={formatDate(post.created_at, locale, { dateStyle: "full", timeStyle: "short" })}>
                {formatRelative(post.created_at, locale)}
              </time>
            </Link>
          </p>
        </div>
        <div className="-me-1.5 -mt-1 flex shrink-0 items-center gap-1">
          {showFollow && !post.mine && !author.anonymous && author.id && (
            <FollowButton targetId={author.id} name={author.name} size="sm" source={api} viewer={viewer} className="hidden xs:inline-flex" />
          )}
          <MenuButton label={t("post.a11y.menu")} trigger={<MoreHorizontal size={18} aria-hidden="true" />} items={menu} />
        </div>
      </header>

      {/* ── body (skips render work while off-screen) ── */}
      <div className="[content-visibility:auto] [contain-intrinsic-size:auto_240px]">
        {post.content && (
          <div className="mt-3">
            <RichText text={post.content} className={cn("t-body text-ink", long && !expanded && "line-clamp-6")} />
            {long && (
              <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} className="mt-1 text-sm font-medium text-gold-600 hover:underline hover:underline-offset-4">
                {expanded ? t("post.readLess") : t("post.readMore")}
              </button>
            )}
          </div>
        )}

        {post.media && (
          <MediaView
            media={post.media}
            label={author.anonymous ? t("post.a11y.mediaAnonymous") : t("post.a11y.media", { name: authorName })}
            className={cn("mt-3", mediaBusy && "opacity-60")}
          />
        )}

        {/* ── actions ── */}
        <div className="mt-3 flex items-center gap-0.5 sm:gap-1">
          <Action
            icon={Heart}
            count={counts.likes}
            active={mine.liked}
            activeClass="text-danger"
            fill={mine.liked}
            pressed={mine.liked}
            label={t("post.a11y.like", { count: counts.likes })}
            onClick={() => react("like")}
            locale={locale}
          />
          <Action
            icon={ThumbsDown}
            count={counts.dislikes}
            active={mine.disliked}
            activeClass="text-ink"
            fill={mine.disliked}
            pressed={mine.disliked}
            label={t("post.a11y.dislike", { count: counts.dislikes })}
            onClick={() => react("dislike")}
            locale={locale}
          />
          <Action
            icon={MessageCircle}
            count={counts.comments}
            active={commentsOpen}
            activeClass="text-gold-600"
            expanded={commentsOpen}
            label={t("post.a11y.comments", { count: counts.comments })}
            onClick={() => setCommentsOpen((v) => !v)}
            locale={locale}
          />
          <Action
            icon={Repeat2}
            count={counts.reposts}
            active={mine.reposted}
            activeClass="text-green-600"
            pressed={mine.reposted}
            label={t("post.a11y.repost", { count: counts.reposts })}
            onClick={() => react("repost")}
            locale={locale}
          />
          <button
            type="button"
            onClick={() => share()}
            aria-label={copied ? t("post.copied") : t("post.a11y.share")}
            className="ms-auto inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-full px-3 text-sm text-ink-3 transition-colors duration-fast hover:bg-surface-2 hover:text-ink sm:h-9 sm:min-w-9"
          >
            {copied ? <Check size={17} aria-hidden="true" className="text-green-600" /> : <Share2 size={17} aria-hidden="true" />}
            <span className="hidden sm:inline">{copied ? t("post.copied") : t("post.share")}</span>
          </button>
        </div>
      </div>

      <p aria-live="polite" className="sr-only">{copied ? t("post.copied") : ""}</p>
      {error && (
        <Alert tone="danger" className="mt-3">
          {error.startsWith("media.") ? t(`composer.errors.${error.slice(6)}`) : t(`errors.${error}`)}
        </Alert>
      )}

      {commentsOpen && (
        <Comments
          post={post}
          api={api}
          viewer={viewer}
          askSignIn={askSignIn}
          autoFocus={!startOpen}
          onCountChange={(d) => onPatch(post.id, (p) => ({ counts: { ...p.counts, comments: Math.max(0, p.counts.comments + d) } }))}
        />
      )}

      {post.mine && <input ref={fileRef} type="file" accept={ACCEPT_MEDIA} onChange={onFile} hidden />}

      {dialog === "edit" && (
        <EditPostDialog
          post={post}
          onClose={() => setDialog(null)}
          onSave={async (text) => {
            const res = await api.updatePostContent(post, text);
            onPatch(post.id, { content: res.content });
          }}
        />
      )}
      {dialog === "delete" && (
        <ConfirmDialog
          title={t("dialogs.delete.title")}
          body={t("dialogs.delete.body")}
          confirmLabel={t("dialogs.delete.confirm")}
          onConfirm={async () => { await api.deletePost(post); onRemove(post.id); }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "removeMedia" && (
        <ConfirmDialog
          title={t("dialogs.removeMedia.title")}
          body={t("dialogs.removeMedia.body")}
          confirmLabel={t("dialogs.removeMedia.confirm")}
          onConfirm={async () => { await api.removePostMedia(post); onPatch(post.id, { media: null }); }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "block" && (
        <ConfirmDialog
          title={t("dialogs.block.title", { name: authorName })}
          body={t("dialogs.block.body")}
          confirmLabel={t("dialogs.block.confirm")}
          onConfirm={async () => { await api.blockUser(author.id); setFollowLocal(author.id, null); onBlocked?.(author.id); }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "report" && <ReportDialog api={api} targetType="post" targetId={post.id} onClose={() => setDialog(null)} />}
    </article>
  );
}

function Action({ icon: Icon, count, active, activeClass, fill = false, pressed, expanded, label, onClick, locale }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed === undefined ? undefined : pressed}
      aria-expanded={expanded === undefined ? undefined : expanded}
      className={cn(
        "inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-full px-2.5 text-sm transition-colors duration-fast hover:bg-surface-2 sm:h-9 sm:min-w-9 sm:px-3",
        active ? cn(activeClass, "font-medium") : "text-ink-3 hover:text-ink"
      )}
    >
      <Icon size={18} aria-hidden="true" fill={fill ? "currentColor" : "none"} className={cn(active && "animate-scale")} />
      {count > 0 && <span className="num tabular">{formatNumber(count, locale)}</span>}
    </button>
  );
}
