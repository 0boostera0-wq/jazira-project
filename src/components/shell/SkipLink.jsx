"use client";

import { useT } from "@/i18n/client";

export default function SkipLink() {
  const t = useT("common");
  return (
    <a
      href="#main"
      className="fixed start-3 top-3 z-[100] -translate-y-20 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-fg shadow-md transition-transform focus:translate-y-0"
    >
      {t("a11y.skipToContent")}
    </a>
  );
}
