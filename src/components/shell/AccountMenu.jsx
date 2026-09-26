"use client";

import { useCallback, useId, useRef, useState } from "react";
import { ChevronDown, Crown, LayoutDashboard, LogOut, Settings, UserRound } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { useAuthUser } from "@/context/AuthProvider";
import { useT } from "@/i18n/client";
import Avatar from "@/components/Avatar";
import Button from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";
import { useDismiss } from "@/components/ui/useDismiss";
import { cn } from "@/components/ui/cn";

/**
 * Top-bar account control: sign-in CTAs for guests, an account popover when
 * signed in. The popover is a disclosure (button + aria-expanded/aria-controls
 * + plain links), not an ARIA menu: it holds a profile summary as well as
 * links, and Tab moves through it naturally. Escape closes it and returns
 * focus to the trigger.
 */
export default function AccountMenu({ compact = false }) {
  const { isLoaded, isSignedIn, name, email, username, imageUrl, isElite, signOut } = useAuthUser();
  const t = useT("nav");
  const tc = useT("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const triggerRef = useRef(null);
  const panelId = `jz-account-${useId().replace(/:/g, "")}`;
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close, triggerRef);

  if (!isLoaded) return <Skeleton rounded="full" className="h-9 w-9" />;

  if (!isSignedIn) {
    return (
      <div className="flex items-center gap-1.5">
        {!compact && (
          <Button href="/sign-in" variant="ghost" size="sm" prefetch="intent" className="hidden sm:inline-flex">
            {tc("actions.signIn")}
          </Button>
        )}
        <Button href={compact ? "/sign-in" : "/sign-up"} variant="primary" size="sm" prefetch="intent" className="max-sm:h-11">
          {compact ? tc("actions.signIn") : tc("actions.signUp")}
        </Button>
      </div>
    );
  }

  const profileHref = username ? `/u/${encodeURIComponent(username)}` : "/profile";
  const item = "flex w-full items-center gap-3 rounded-sm px-3 py-2.5 text-sm text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink";

  const onSignOut = async () => {
    close();
    await signOut();
    router.replace("/");
    router.refresh();
  };

  return (
    <div ref={ref} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={tc("a11y.userMenu")}
        className="flex min-h-11 items-center gap-1.5 rounded-full p-0.5 pe-1.5 transition-colors hover:bg-surface-2 lg:min-h-0"
      >
        <Avatar src={imageUrl} name={name} size={34} alt="" />
        <ChevronDown size={15} className={cn("hidden text-ink-3 transition-transform sm:block", open && "rotate-180")} aria-hidden="true" />
      </button>

      {open && (
        <div id={panelId} className="animate-scale absolute end-0 top-[calc(100%+8px)] z-50 w-72 rounded-lg border border-line/12 bg-surface p-2 shadow-lg">
          <div className="flex items-center gap-3 px-3 pb-3 pt-2">
            <Avatar src={imageUrl} name={name} size={42} alt="" />
            <div className="min-w-0">
              <p className="truncate font-medium text-ink">{name || t("account.guestName")}</p>
              {email && <p className="truncate text-xs text-ink-3" dir="ltr">{email}</p>}
              <p className={cn("mt-1 inline-flex items-center gap-1 text-xs font-medium", isElite ? "text-gold-600" : "text-ink-3")}>
                {isElite && <Crown size={12} aria-hidden="true" />}
                {isElite ? t("account.eliteMember") : t("account.freeMember")}
              </p>
            </div>
          </div>
          <div className="divider my-1" />
          <Link href="/dashboard" className={item} onClick={close}><LayoutDashboard size={17} aria-hidden="true" />{t("items.dashboard")}</Link>
          <Link href={profileHref} className={item} onClick={close}><UserRound size={17} aria-hidden="true" />{t("account.viewProfile")}</Link>
          <Link href="/settings" className={item} onClick={close}><Settings size={17} aria-hidden="true" />{t("items.settings")}</Link>
          {!isElite && (
            <Link href="/subscriptions" className={cn(item, "text-gold-700")} onClick={close}><Crown size={17} aria-hidden="true" />{tc("actions.upgrade")}</Link>
          )}
          <div className="divider my-1" />
          <button type="button" onClick={onSignOut} className={cn(item, "text-danger hover:text-danger")}>
            <LogOut size={17} className="flip-rtl" aria-hidden="true" />
            {tc("actions.signOut")}
          </button>
        </div>
      )}
    </div>
  );
}
