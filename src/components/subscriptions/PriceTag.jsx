import { cn } from "@/components/ui/cn";
import { priceParts } from "./plan";

const SIZES = {
  lg: { num: "text-[2.75rem] leading-none sm:text-5xl", cur: "text-base", per: "text-sm" },
  md: { num: "text-3xl leading-none", cur: "text-sm", per: "text-sm" },
  sm: { num: "text-xl leading-none", cur: "text-xs", per: "text-xs" },
};

/**
 * Price with the amount emphasised and the currency set small, in each
 * locale's own order. Pure (no hooks) → usable in server and client trees.
 *   <PriceTag amount={19} locale="ar" per={t("plan.perMonth")} />
 */
export default function PriceTag({ amount, locale, per, size = "lg", className }) {
  const s = SIZES[size];
  const parts = priceParts(amount, locale);
  return (
    <p className={cn("flex flex-wrap items-baseline gap-x-1.5 gap-y-1", className)}>
      <span className="inline-flex items-baseline gap-1">
        {parts
          .filter((p) => p.type !== "literal")
          .map((p, i) =>
            p.type === "currency" ? (
              <span key={i} className={cn("font-medium text-ink-3", s.cur)}>{p.value}</span>
            ) : (
              <span key={i} className={cn("font-bold tabular tracking-tight text-ink", s.num)}>{p.value}</span>
            )
          )}
      </span>
      {per && <span className={cn("text-ink-3", s.per)}>{per}</span>}
    </p>
  );
}
