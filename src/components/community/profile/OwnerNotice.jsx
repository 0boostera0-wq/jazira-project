"use client";

import { Settings } from "lucide-react";
import { useT } from "@/i18n/client";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import { useViewer } from "../useViewer";

/** Shown only to the owner of a profile that is hidden because anonymous posting is on. */
export default function OwnerNotice({ userId, viewer: viewerOverride }) {
  const t = useT("profile");
  const viewer = useViewer(viewerOverride);
  if (!viewer.isLoaded || viewer.userId !== userId) return null;
  return (
    <Alert tone="info" title={t("private.ownerTitle")} className="mt-5 text-start">
      <p>{t("private.ownerBody")}</p>
      <Button href="/settings" size="sm" variant="secondary" iconStart={Settings} className="mt-3">{t("private.settings")}</Button>
    </Alert>
  );
}
