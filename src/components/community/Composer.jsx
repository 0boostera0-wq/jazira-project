"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { LogIn, PenLine, UserPlus } from "lucide-react";
import { useLocale, useT } from "@/i18n/client";
import { usePathname } from "@/i18n/navigation";
import Button from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";
import { cn } from "@/components/ui/cn";
import AuthorAvatar from "./AuthorAvatar";
import { POST_KINDS, tagInline } from "./topics";

const ComposerForm = dynamic(() => import("./ComposerForm"), { ssr: false, loading: () => <ComposerSkeleton expanded /> });

/**
 * Entry point for posting. Collapsed it is one line plus four prompts
 * (ask a question · share a win · share a resource · study tip); the full
 * form loads on demand. Guests see what they could do and a sign-in path.
 * `openSignal` (a changing number) opens it from elsewhere (empty states).
 */
export default function Composer({ api, viewer, askSignIn, lockedTag = null, onPublished, openSignal = 0 }) {
  const t = useT("community");
  const { locale } = useLocale();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!openSignal) return;
    if (viewer.isSignedIn) setOpen(true);
    else askSignIn();
  }, [openSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(id);
  }, [notice]);

  if (!viewer.isLoaded) return <ComposerSkeleton />;

  const start = (k = null) => {
    if (!viewer.isSignedIn) return askSignIn();
    setKind(k);
    setOpen(true);
  };

  const self = viewer.anonymous
    ? { anonymous: true }
    : { anonymous: false, name: viewer.name, avatar: viewer.avatar };

  if (open) {
    return (
      <ComposerForm
        api={api}
        viewer={viewer}
        initialKind={kind}
        lockedTag={lockedTag}
        onCancel={() => setOpen(false)}
        onPublished={(post) => {
          setOpen(false);
          setNotice(t("composer.published"));
          onPublished?.(post);
        }}
      />
    );
  }

  const next = encodeURIComponent(path || "/community");

  return (
    <section aria-label={t("composer.label")} className="surface p-4 sm:p-5">
      {viewer.isSignedIn ? (
        <div className="flex items-center gap-3">
          <AuthorAvatar author={self} size={42} />
          <button
            type="button"
            onClick={() => start()}
            className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-full border border-line/15 bg-surface-2/70 px-4 text-start text-[0.9375rem] text-ink-3 transition-colors duration-fast hover:border-line/30 hover:bg-surface-2"
          >
            <PenLine size={17} aria-hidden="true" className="shrink-0 text-ink-4" />
            <span className="truncate">{lockedTag ? t("composer.startTag", { tag: tagInline(t, lockedTag, locale) }) : t("composer.start")}</span>
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="t-h4">{t("composer.guest.title")}</h2>
            <p className="t-small mt-1 text-ink-3">{t("composer.guest.body")}</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button href={`/sign-up?next=${next}`} variant="secondary" size="sm" iconStart={UserPlus}>{t("signIn.signUp")}</Button>
            <Button href={`/sign-in?next=${next}`} size="sm" iconStart={LogIn}>{t("signIn.signIn")}</Button>
          </div>
        </div>
      )}

      <div role="group" aria-label={t("composer.kindsLabel")} className="mt-3.5 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        {POST_KINDS.map((k) => {
          const Icon = k.icon;
          return (
            <button
              key={k.id}
              type="button"
              onClick={() => start(k.id)}
              className={cn(
                "inline-flex h-11 min-w-0 items-center gap-1.5 rounded-full border border-line/12 bg-surface px-3 text-[0.8125rem] text-ink-2 sm:gap-2 sm:px-3.5 sm:text-sm transition-colors duration-fast hover:border-gold-300 hover:bg-gold-50 hover:text-ink sm:h-9"
              )}
            >
              <Icon size={16} aria-hidden="true" className="shrink-0 text-gold-600" />
              <span className="truncate">{t(`composer.kinds.${k.id}.label`)}</span>
            </button>
          );
        })}
      </div>
      <p aria-live="polite" className={cn("t-small", notice ? "mt-3 font-medium text-green-700" : "sr-only")}>{notice}</p>
    </section>
  );
}

export function ComposerSkeleton({ expanded = false }) {
  return (
    <div className="surface p-4 sm:p-5" aria-hidden="true">
      <div className="flex items-center gap-3">
        <Skeleton rounded="full" className="h-[42px] w-[42px] shrink-0" />
        <Skeleton rounded="full" className="h-12 flex-1" />
      </div>
      {expanded ? (
        <Skeleton rounded="md" className="mt-4 h-36" />
      ) : (
        <div className="mt-3.5 grid grid-cols-2 gap-2 sm:flex">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} rounded="full" className="h-11 sm:h-9 sm:w-32" />)}
        </div>
      )}
    </div>
  );
}
