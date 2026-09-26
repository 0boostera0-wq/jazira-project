import Illustration from "@/components/ui/Illustration";

/** Tips card for the builder rail: the painting on top (beside the tips from sm to xl), numbered advice below. */
export default function StrategyTips({ title, items = [], illustration }) {
  return (
    <section aria-label={title} className="surface-tint overflow-hidden sm:grid sm:grid-cols-5 xl:block">
      {illustration && (
        // decorative: dropped on phones (the tips are what matter there)
        <div aria-hidden="true" className="relative hidden sm:col-span-2 sm:block xl:aspect-[16/9]">
          <Illustration id={illustration} fill sizes="(min-width: 1280px) 30vw, 40vw" />
        </div>
      )}
      <div className="p-5 sm:col-span-3 sm:p-6">
        <h2 className="t-h4">{title}</h2>
        <ol className="mt-4 space-y-3.5">
          {items.map((tip, i) => (
            <li key={i} className="flex gap-3">
              <span
                aria-hidden="true"
                className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-surface text-xs font-bold text-gold-700 ring-1 ring-inset ring-gold-200/70 tabular"
              >
                {i + 1}
              </span>
              <p className="t-small text-ink-2">{tip}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
