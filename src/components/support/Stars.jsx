import { Star } from "lucide-react";
import { cn } from "@/components/ui/cn";

const FILLED = "fill-gold-400 text-gold-400";
const EMPTY = "fill-surface-3 text-surface-3";

/**
 * Read-only star rating (server-safe). Supports fractions for averages: the
 * last star is partially filled from the reading-start side.
 * `label` is the accessible text, e.g. "Rated 4 out of 5".
 */
export default function Stars({ value = 0, size = 16, label, className }) {
  const v = Math.max(0, Math.min(5, Number(value) || 0));
  return (
    <span role="img" aria-label={label} className={cn("inline-flex items-center gap-0.5", className)}>
      {[1, 2, 3, 4, 5].map((n) => {
        const fill = Math.max(0, Math.min(1, v - (n - 1)));
        return (
          <span key={n} className="relative inline-block shrink-0" style={{ width: size, height: size }} aria-hidden="true">
            <Star size={size} className={cn("absolute inset-0", EMPTY)} />
            {fill > 0 && (
              <span className="absolute inset-y-0 start-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
                <Star size={size} className={cn("absolute inset-y-0 start-0 max-w-none", FILLED)} />
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}
