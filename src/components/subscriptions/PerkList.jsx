import { Check } from "lucide-react";
import { cn } from "@/components/ui/cn";

/** Check-marked perk list. Pure (no hooks) → server and client. `perks` from elitePerks(). */
export default function PerkList({ perks, className }) {
  return (
    <ul className={cn("space-y-2.5", className)}>
      {perks.map((p) => (
        <li key={p.key} className="t-small flex items-start gap-2.5 text-ink-2">
          <span className="mt-[3px] grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-green-50 text-green-600 ring-1 ring-inset ring-green-100">
            <Check size={12} strokeWidth={2.5} aria-hidden="true" />
          </span>
          {p.label}
        </li>
      ))}
    </ul>
  );
}
