"use client";

import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { ArrowUp, Square } from "lucide-react";
import { useT, useLocale } from "@/i18n/client";
import { formatNumber } from "@/i18n/format";
import { cn } from "@/components/ui/cn";
import { CHAT_LIMITS } from "@/lib/chatStore";

const MAX = CHAT_LIMITS.maxMessageChars;

/**
 * Auto-growing message box. Enter sends and Shift+Enter adds a line on
 * devices with a keyboard; on touch screens Enter adds a line and the button
 * sends. While a reply streams the button becomes "stop".
 */
const Composer = forwardRef(function Composer({ value, onChange, onSubmit, onStop, busy, disabled, footer }, ref) {
  const t = useT("assistant");
  const { locale } = useLocale();
  const area = useRef(null);
  const [coarse, setCoarse] = useState(false);

  useImperativeHandle(ref, () => ({
    focus: () => {
      const el = area.current;
      if (!el) return;
      el.focus();
      const end = el.value.length;
      try { el.setSelectionRange(end, end); } catch {}
    },
  }));

  useEffect(() => {
    try { setCoarse(window.matchMedia("(pointer: coarse)").matches); } catch {}
  }, []);

  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 208)}px`;
  }, [value]);

  const tooLong = value.length > MAX;
  const canSend = !disabled && !busy && value.trim().length > 0 && !tooLong;
  const submit = () => { if (canSend) onSubmit(value); };

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); submit(); }}
      className="border-t border-line/10 bg-surface px-3 pb-3 pt-3 sm:px-5 sm:pb-4"
    >
      <div className="mx-auto w-full max-w-3xl">
        <div
          className={cn(
            "flex items-end gap-2 rounded-lg border bg-surface p-1.5 ps-3 shadow-xs transition-[border-color,box-shadow] duration-fast",
            tooLong ? "border-danger/50" : "border-line/20 focus-within:border-gold-400 focus-within:shadow-[0_0_0_3px_rgb(var(--c-gold-400)/0.16)]"
          )}
        >
          <label htmlFor="jz-assistant-input" className="sr-only">{t("composer.label")}</label>
          <textarea
            id="jz-assistant-input"
            ref={area}
            rows={1}
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !coarse && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={t("composer.placeholder")}
            enterKeyHint={coarse ? "enter" : "send"}
            dir="auto"
            aria-invalid={tooLong || undefined}
            aria-describedby="jz-assistant-note"
            className="max-h-52 min-h-[44px] flex-1 resize-none bg-transparent py-2.5 text-[1rem] leading-relaxed text-ink outline-none placeholder:text-ink-4 focus:shadow-none focus-visible:shadow-none disabled:cursor-not-allowed"
          />
          {busy ? (
            <button
              type="button"
              onClick={onStop}
              aria-label={t("composer.stop")}
              title={t("composer.stop")}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line/20 bg-surface-2 text-ink transition-colors hover:bg-surface-3"
            >
              <Square size={14} fill="currentColor" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!canSend}
              aria-label={t("composer.send")}
              title={t("composer.send")}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-primary-fg shadow-sm transition-[opacity,transform] duration-fast active:scale-95 disabled:opacity-35"
            >
              <ArrowUp size={19} strokeWidth={2.25} aria-hidden="true" />
            </button>
          )}
        </div>
        <div id="jz-assistant-note" className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-1">
          <p className={cn("t-caption", tooLong && "text-danger")}>
            {tooLong ? (
              t("composer.tooLong", { max: formatNumber(MAX, locale) })
            ) : (
              <>
                <span className="sm:hidden">{t("composer.disclaimerShort")}</span>
                <span className="hidden sm:inline">{t("composer.disclaimer")}</span>
              </>
            )}
          </p>
          <div className="flex items-center gap-3">
            {value.length > MAX * 0.8 && (
              <span className={cn("t-caption tabular", tooLong && "text-danger")}>
                <span className="num">{t("composer.counter", { count: value.length, max: MAX })}</span>
              </span>
            )}
            {footer}
          </div>
        </div>
      </div>
    </form>
  );
});

export default Composer;
