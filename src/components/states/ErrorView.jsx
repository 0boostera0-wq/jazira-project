"use client";

import { useEffect } from "react";
import { RotateCcw, LifeBuoy } from "lucide-react";
import { useT } from "@/i18n/client";
import Button from "@/components/ui/Button";
import Illustration from "@/components/ui/Illustration";

/** Shared body for error.js boundaries: honest message, retry, support link. */
export default function ErrorView({ error, reset, compact = false }) {
  const t = useT("common");
  useEffect(() => {
    // Surface the real error for developers / log drains; users see a calm message.
    console.error(error);
  }, [error]);
  return (
    <div role="alert" className={compact ? "py-10 text-center" : "mx-auto flex max-w-xl flex-col items-center py-12 text-center sm:py-16"}>
      {!compact && <Illustration id="system.offline" className="w-full max-w-[260px]" />}
      <h2 className="t-h3 mt-6">{t("errors.genericTitle")}</h2>
      <p className="t-body mt-2 text-ink-3">{t("errors.genericBody")}</p>
      {error?.digest && <p className="t-caption mt-2">{t("errors.code")}: <span className="num">{error.digest}</span></p>}
      <div className="mt-6 flex flex-wrap justify-center gap-2.5">
        <Button onClick={() => reset?.()} iconStart={RotateCcw}>{t("actions.retry")}</Button>
        <Button href="/support" variant="secondary" iconStart={LifeBuoy}>{t("actions.contactSupport")}</Button>
      </div>
    </div>
  );
}
