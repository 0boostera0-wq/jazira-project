"use client";

import { useT } from "@/i18n/client";

export default function SkipLink() {
  const t = useT("common");
  return (
    <a
      href="#main"
      // 44px tall; the focus ring is the global :focus-visible outline (shadow-md can't mask it)
      className="fixed start-3 top-3 z-[100] inline-flex h-11 -translate-y-20 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-fg shadow-md transition-transform focus:translate-y-0"
    >
      {t("a11y.skipToContent")}
    </a>
  );
}
