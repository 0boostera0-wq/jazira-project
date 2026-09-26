"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { EyeOff, Hash, ImagePlus, Info, Video, X } from "lucide-react";
import { useT } from "@/i18n/client";
import { Link } from "@/i18n/navigation";
import Button from "@/components/ui/Button";
import Alert from "@/components/ui/Alert";
import { cn } from "@/components/ui/cn";
import AuthorAvatar from "./AuthorAvatar";
import { POST_KINDS, STARTER_TOPICS } from "./topics";
import { IMAGE_TYPES, POST_MAX, VIDEO_TYPES, composeContent, mediaAspect } from "./model";
import { prepareMedia } from "./media";
import { textProps } from "./text";

const DRAFT_KEY = "jz-community-draft";
const MAX_TOPICS = 3;

function readDraft() {
  try { return sessionStorage.getItem(DRAFT_KEY) || ""; } catch { return ""; }
}
function writeDraft(v) {
  try { if (v) sessionStorage.setItem(DRAFT_KEY, v); else sessionStorage.removeItem(DRAFT_KEY); } catch {}
}

export default function ComposerForm({ api, viewer, initialKind = null, lockedTag = null, onCancel, onPublished }) {
  const t = useT("community");
  const tc = useT("common");
  const ids = useId();
  const [kind, setKind] = useState(initialKind);
  const [topics, setTopics] = useState([]);
  const [text, setText] = useState(readDraft);
  const [media, setMedia] = useState(null); // { file, kind, dims, url, duration }
  const [status, setStatus] = useState("idle"); // idle | uploading | publishing
  const [error, setError] = useState(null);
  const area = useRef(null);
  const imgInput = useRef(null);
  const vidInput = useRef(null);

  useEffect(() => { area.current?.focus(); }, [kind]);
  useEffect(() => {
    const id = setTimeout(() => writeDraft(text), 400);
    return () => clearTimeout(id);
  }, [text]);
  useEffect(() => () => { if (media?.url) URL.revokeObjectURL(media.url); }, [media]);

  const kindDef = POST_KINDS.find((k) => k.id === kind) || null;
  const tags = useMemo(
    () => [lockedTag, kindDef?.tag, ...topics].filter(Boolean),
    [lockedTag, kindDef, topics]
  );
  const content = composeContent(text, tags);
  const tooLong = content.length > POST_MAX;
  const empty = !text.trim() && !media;
  const busy = status !== "idle";

  const pick = async (e, want) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    const info = await prepareMedia(file, want);
    if (info.error) { setError({ media: info.error }); return; }
    setMedia({ file, kind: info.kind, dims: info.dims, duration: info.duration, url: URL.createObjectURL(file) });
  };

  const toggleTopic = (tag) => {
    setTopics((prev) => (prev.includes(tag) ? prev.filter((x) => x !== tag) : prev.length >= MAX_TOPICS ? prev : [...prev, tag]));
  };

  const submit = async (e) => {
    e?.preventDefault();
    if (busy) return;
    if (empty) { setError({ code: "empty" }); return; }
    if (tooLong) return;
    setError(null);
    setStatus(media ? "uploading" : "publishing");
    try {
      const post = await api.publishPost({ content, file: media?.file || null, dims: media?.dims || null });
      writeDraft("");
      onPublished(post);
    } catch (err) {
      setError(err);
      setStatus("idle");
    }
  };

  const errorText = !error
    ? null
    : error.media
      ? t(`composer.errors.${error.media}`, { max: POST_MAX })
      : error.code === "empty" || error.code === "empty_post"
        ? t("composer.errors.empty")
        : t(`errors.${error.code && error.code !== "aborted" ? error.code : "unknown"}`);

  const self = viewer.anonymous ? { anonymous: true } : { anonymous: false, name: viewer.name, avatar: viewer.avatar };

  return (
    <form onSubmit={submit} aria-labelledby={`${ids}-title`} className="surface animate-fade p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <AuthorAvatar author={self} size={42} />
        <div className="min-w-0 flex-1">
          <h2 id={`${ids}-title`} className="flex items-center gap-1.5 text-[0.9375rem] font-medium text-ink">
            {viewer.anonymous && <EyeOff size={15} aria-hidden="true" className="text-ink-3" />}
            <span className="truncate">{viewer.anonymous ? t("composer.anonymous.badge") : viewer.name || t("composer.label")}</span>
          </h2>
          <p className="t-caption truncate">
            {viewer.anonymous ? t("composer.anonymous.hint") : t("composer.audience")}
          </p>
        </div>
      </div>

      {/* kind prompts */}
      <div role="group" aria-label={t("composer.kindsLabel")} className="mt-4 flex flex-wrap gap-2">
        {POST_KINDS.map((k) => {
          const Icon = k.icon;
          const on = kind === k.id;
          return (
            <button
              key={k.id}
              type="button"
              aria-pressed={on}
              onClick={() => setKind(on ? null : k.id)}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors duration-fast",
                on ? "border-gold-400 bg-gold-50 font-medium text-gold-800" : "border-line/12 text-ink-2 hover:border-line/25 hover:text-ink"
              )}
            >
              <Icon size={15} aria-hidden="true" className={on ? "text-gold-700" : "text-gold-600"} />
              {t(`composer.kinds.${k.id}.label`)}
            </button>
          );
        })}
      </div>

      <label htmlFor={`${ids}-text`} className="sr-only">{t("composer.label")}</label>
      <textarea
        ref={area}
        id={`${ids}-text`}
        dir="auto"
        rows={4}
        value={text}
        disabled={busy}
        onChange={(e) => setText(e.target.value)}
        onInput={(e) => { e.currentTarget.style.height = "auto"; e.currentTarget.style.height = `${Math.min(e.currentTarget.scrollHeight, 420)}px`; }}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submit(e); }}
        placeholder={kindDef ? t(`composer.kinds.${kindDef.id}.placeholder`) : t("composer.placeholder")}
        aria-describedby={`${ids}-hint`}
        aria-invalid={tooLong || undefined}
        className="mt-3 block min-h-[7.5rem] w-full resize-none rounded-md border border-line/20 bg-surface px-3.5 py-3 text-[1rem] leading-relaxed text-ink shadow-xs placeholder:text-ink-4 focus:border-gold-400 focus:shadow-[0_0_0_3px_rgb(var(--c-gold-400)/0.18)] focus:outline-none disabled:bg-surface-2"
      />
      <p id={`${ids}-hint`} className="t-caption mt-1.5 flex items-start gap-1.5">
        <Info size={14} aria-hidden="true" className="mt-[3px] shrink-0 text-ink-4" />
        <span>{kindDef ? t(`composer.kinds.${kindDef.id}.hint`) : t("composer.hint")}</span>
      </p>

      {/* subject topics */}
      <div role="group" aria-label={t("composer.topicsLabel")} className="mt-4">
        <p className="mb-2 text-xs font-medium text-ink-3">{t("composer.topicsLabel")}</p>
        <div className="flex flex-wrap gap-1.5">
          {STARTER_TOPICS.filter((s) => s.tag !== lockedTag).map((s) => {
            const on = topics.includes(s.tag);
            const disabled = !on && topics.length >= MAX_TOPICS;
            return (
              <button
                key={s.id}
                type="button"
                aria-pressed={on}
                disabled={disabled}
                onClick={() => toggleTopic(s.tag)}
                className={cn(
                  "inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-[0.8125rem] transition-colors duration-fast disabled:opacity-40",
                  on ? "bg-primary text-primary-fg" : "bg-surface-2 text-ink-2 hover:bg-surface-3 hover:text-ink"
                )}
              >
                <Hash size={12} aria-hidden="true" className="opacity-60" />
                {t(`topics.${s.id}`)}
              </button>
            );
          })}
        </div>
      </div>

      {/* media preview */}
      {media && (
        <div className="relative mt-4 overflow-hidden rounded-md bg-surface-2" style={{ aspectRatio: mediaAspect(media.dims, media.kind) }}>
          {media.kind === "image" ? (
            <img src={media.url} alt={t("composer.previewAlt")} className="h-full w-full object-contain" />
          ) : (
            <video src={media.url} controls playsInline className="h-full w-full object-contain" aria-label={t("composer.previewAlt")} />
          )}
          <button
            type="button"
            onClick={() => setMedia(null)}
            disabled={busy}
            aria-label={t("composer.removeMedia")}
            className="absolute end-2.5 top-2.5 grid h-9 w-9 place-items-center rounded-full bg-[rgb(20_15_8/0.6)] text-white hover:bg-[rgb(20_15_8/0.75)]"
          >
            <X size={17} aria-hidden="true" />
          </button>
        </div>
      )}
      {media && viewer.anonymous && (
        <p className="t-caption mt-2 flex items-start gap-1.5 text-warning">
          <Info size={14} aria-hidden="true" className="mt-[3px] shrink-0" />
          {t("composer.anonymous.mediaWarning")}
        </p>
      )}

      {tags.length > 0 && (
        <div className="t-caption mt-3 flex flex-wrap items-center gap-1.5">
          <span className="me-0.5">{t("composer.tagsPreview")}</span>
          {tags.map((x) => (
            <bdi key={x} {...textProps(x, "rounded-full bg-gold-50 px-2 py-0.5 font-medium text-gold-700 ring-1 ring-inset ring-gold-200/70")}>#{x}</bdi>
          ))}
        </div>
      )}

      {errorText && <Alert tone="danger" className="mt-4">{errorText}</Alert>}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line/10 pt-4">
        <Button type="button" variant="ghost" size="sm" iconStart={ImagePlus} disabled={busy} onClick={() => imgInput.current?.click()} aria-label={t("composer.addImageLong")}>
          <span className="hidden xs:inline">{t("composer.image")}</span>
        </Button>
        <Button type="button" variant="ghost" size="sm" iconStart={Video} disabled={busy} onClick={() => vidInput.current?.click()} aria-label={t("composer.addVideoLong")}>
          <span className="hidden xs:inline">{t("composer.video")}</span>
        </Button>
        <input ref={imgInput} type="file" accept={Object.keys(IMAGE_TYPES).join(",")} onChange={(e) => pick(e, "image")} hidden />
        <input ref={vidInput} type="file" accept={Object.keys(VIDEO_TYPES).join(",")} onChange={(e) => pick(e, "video")} hidden />
        <span className={cn("num tabular ms-auto text-xs", tooLong ? "font-medium text-danger" : content.length > POST_MAX * 0.8 ? "text-ink-3" : "sr-only")} aria-live="polite">
          {t("composer.counter", { count: content.length, max: POST_MAX })}
        </span>
        <div className={cn("flex gap-2", !(tooLong || content.length > POST_MAX * 0.8) && "ms-auto")}>
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={busy}>{tc("actions.cancel")}</Button>
          <Button type="submit" size="sm" loading={busy} disabled={tooLong}>
            {status === "uploading" ? t("composer.uploading") : status === "publishing" ? t("composer.publishing") : t("composer.publish")}
          </Button>
        </div>
      </div>
      <p className="t-caption mt-2 hidden sm:block">
        {t("composer.rules")}{" "}
        <Link href="/community-guidelines" className="text-gold-600 hover:underline hover:underline-offset-4">{t("composer.rulesLink")}</Link>
      </p>
    </form>
  );
}
