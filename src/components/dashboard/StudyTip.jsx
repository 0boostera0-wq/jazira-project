"use client";

import { useEffect, useState } from "react";
import { Lightbulb } from "lucide-react";
import { useT } from "@/i18n/client";
import IconTile from "@/components/ui/IconTile";
import { riyadhToday } from "@/components/achievements/progress";
import { tipIndex } from "./model";

/**
 * Today's study tip — a static, localized list rotated by Saudi day. Clearly
 * labelled as a general tip (not derived from the member's data).
 * `initialIndex` comes from the server render; the client re-picks on mount
 * so a statically cached page still shows today's tip.
 */
export default function StudyTip({ initialIndex = 0 }) {
  const t = useT("dashboard");
  const tips = t.raw("tip.items");
  const list = Array.isArray(tips) ? tips : [];
  const [index, setIndex] = useState(initialIndex);

  useEffect(() => {
    if (list.length) setIndex(tipIndex(riyadhToday(), list.length));
  }, [list.length]);

  if (!list.length) return null;
  return (
    <section aria-labelledby="dash-tip" className="surface-tint p-5">
      <div className="flex items-center gap-3">
        <IconTile icon={Lightbulb} tone="gold" size="sm" />
        <h2 id="dash-tip" className="t-eyebrow">{t("tip.eyebrow")}</h2>
      </div>
      <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-2">{list[index % list.length]}</p>
      <p className="t-caption mt-3">{t("tip.note")}</p>
    </section>
  );
}
