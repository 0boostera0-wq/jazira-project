import { ClipboardCheck, ListChecks, SlidersHorizontal, Timer } from "lucide-react";
import IconTile from "@/components/ui/IconTile";
import { SectionHeader } from "@/components/ui/Layout";

const STEPS = [
  ["choose", ClipboardCheck],
  ["configure", SlidersHorizontal],
  ["answer", Timer],
  ["review", ListChecks],
];

/** Four numbered steps (2 × 2 on tablet+, a vertical sequence on phones). */
export default function HowItWorks({ t, id = "how-title" }) {
  return (
    <section aria-labelledby={id}>
      <SectionHeader id={id} eyebrow={t("hub.how.eyebrow")} title={t("hub.how.title")} size="h3" />
      <ol className="mt-6 grid gap-3 sm:grid-cols-2 sm:gap-4">
        {STEPS.map(([key, Icon], i) => (
          <li key={key} className="relative flex gap-4 rounded-lg border border-line/12 bg-surface p-4 sm:p-5">
            <div className="flex flex-col items-center">
              <IconTile icon={Icon} tone={i === 3 ? "green" : "gold"} size="md" />
            </div>
            <div className="min-w-0">
              <p className="t-caption font-medium tabular" aria-hidden="true">{String(i + 1).padStart(2, "0")}</p>
              <h3 className="t-h4 mt-0.5">{t(`hub.how.steps.${key}.title`)}</h3>
              <p className="t-small mt-1 text-ink-3">{t(`hub.how.steps.${key}.body`)}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
