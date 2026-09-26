"use client";

import { useId, useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/components/ui/cn";

/**
 * Accessible 1–5 star picker: a native radio group (arrow keys, form semantics,
 * screen-reader labels) drawn as stars, with hover preview.
 *   <StarInput legend="…" value={n} onChange={setN} optionLabel={(n) => "…"} caption={(n) => "…"} />
 */
export default function StarInput({ legend, value, onChange, optionLabel, caption, error, size = 32, className }) {
  const name = useId();
  const [hover, setHover] = useState(0);
  const shown = hover || value || 0;
  const errId = error ? `${name}-err` : undefined;

  return (
    <fieldset className={className} aria-describedby={errId}>
      {legend && <legend className="mb-2 text-sm font-medium text-ink">{legend}</legend>}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="-ms-1.5 flex" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <label
              key={n}
              onMouseEnter={() => setHover(n)}
              className="grid cursor-pointer place-items-center rounded-sm p-1.5 transition-transform duration-fast hover:scale-110 has-[:focus-visible]:shadow-[var(--ring)]"
            >
              <input
                type="radio"
                name={name}
                value={n}
                checked={value === n}
                onChange={() => onChange(n)}
                className="sr-only"
              />
              <Star
                size={size}
                aria-hidden="true"
                className={cn(
                  "transition-colors duration-fast",
                  shown >= n ? "fill-gold-400 text-gold-400" : "fill-transparent text-line/35"
                )}
              />
              <span className="sr-only">{optionLabel?.(n)}</span>
            </label>
          ))}
        </div>
        {caption && shown > 0 && <span className="text-sm font-medium text-gold-700" aria-hidden="true">{caption(shown)}</span>}
      </div>
      {error && <p id={errId} role="alert" className="mt-1.5 text-[0.8125rem] text-danger">{error}</p>}
    </fieldset>
  );
}
