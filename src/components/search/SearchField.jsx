"use client";

import { forwardRef } from "react";
import { Search, X } from "lucide-react";
import Spinner from "@/components/ui/Spinner";
import { cn } from "@/components/ui/cn";

/** The large search field: icon, input, busy indicator, clear button / "/" hint. */
const SearchField = forwardRef(function SearchField(
  { id, value, onChange, onKeyDown, busy, label, placeholder, clearLabel, busyLabel, shortcutLabel, onClear, describedBy },
  ref
) {
  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Search size={20} aria-hidden="true" className="pointer-events-none absolute start-5 top-1/2 -translate-y-1/2 text-ink-3" />
      <input
        ref={ref}
        id={id}
        type="search"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        maxLength={100}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-describedby={describedBy}
        className={cn("h-14 w-full rounded-full border border-line/20 bg-surface ps-[3.25rem]", value ? "pe-[5.5rem]" : "pe-5 lg:pe-14", "text-[1.0625rem] text-ink shadow-sm transition-[border-color,box-shadow] duration-fast placeholder:text-ink-4 hover:border-line/30 focus:border-gold-400 focus:shadow-[0_0_0_4px_rgb(var(--c-gold-400)/0.16)] focus:outline-none sm:h-[3.75rem] sm:text-lg [&::-webkit-search-cancel-button]:appearance-none")}
      />
      <div className="absolute end-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
        {busy && <Spinner size={18} label={busyLabel} className="px-1 text-gold-600" />}
        {value ? (
          <button
            type="button"
            onClick={onClear}
            aria-label={clearLabel}
            className="grid h-10 w-10 place-items-center rounded-full text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <X size={18} aria-hidden="true" />
          </button>
        ) : (
          <kbd
            title={shortcutLabel}
            className="me-2.5 hidden h-7 min-w-7 place-items-center rounded-xs border border-line/20 bg-surface-2 px-2 font-sans text-xs text-ink-3 lg:grid"
          >
            /
          </kbd>
        )}
      </div>
    </div>
  );
});

export default SearchField;
