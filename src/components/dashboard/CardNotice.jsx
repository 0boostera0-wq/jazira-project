"use client";

import { RotateCcw } from "lucide-react";
import { useT } from "@/i18n/client";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";

/**
 * A card's honest non-data state, drawn with the app-wide rule for such
 * states (ui/Alert, not bespoke markup):
 *   unavailable → the feature isn't configured / deployed yet: Alert tone="info", no retry
 *   error       → the request failed: Alert tone="danger" with a retry button
 * (A card with data but nothing in it shows its own empty copy instead.)
 * The danger text goes in the Alert title: ui/Alert dims children to 90 %
 * opacity, which is below AA for the danger tone.
 */
export default function CardNotice({ status, onRetry, message, className }) {
  const t = useT("dashboard");
  if (status === "unavailable") {
    return (
      <Alert tone="info" className={className}>
        {message || t("states.unavailable")}
      </Alert>
    );
  }
  return (
    <Alert
      tone="danger"
      className={className}
      title={t("states.error")}
      action={
        onRetry ? (
          <Button size="sm" variant="secondary" iconStart={RotateCcw} onClick={onRetry}>
            {t("states.retry")}
          </Button>
        ) : null
      }
    />
  );
}
