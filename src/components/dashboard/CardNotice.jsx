"use client";

import { CircleSlash, RotateCcw } from "lucide-react";
import { useT } from "@/i18n/client";
import Button from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";

/**
 * A card's honest non-data state:
 *   unavailable → the feature isn't configured / deployed yet (no retry)
 *   error       → the request failed (retry)
 */
export default function CardNotice({ status, onRetry, message, className }) {
  const t = useT("dashboard");
  if (status === "unavailable") {
    return (
      <p role="status" className={cn("flex items-start gap-2.5 rounded-md bg-surface-2 px-3.5 py-3 text-sm text-ink-3", className)}>
        <CircleSlash size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
        <span>{message || t("states.unavailable")}</span>
      </p>
    );
  }
  return (
    <div role="alert" className={cn("flex flex-wrap items-center justify-between gap-3 rounded-md bg-surface-2 px-3.5 py-3", className)}>
      <p className="text-sm text-ink-2">{t("states.error")}</p>
      {onRetry && (
        <Button size="sm" variant="secondary" iconStart={RotateCcw} onClick={onRetry}>
          {t("states.retry")}
        </Button>
      )}
    </div>
  );
}
