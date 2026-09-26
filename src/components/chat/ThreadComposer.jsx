"use client";

import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import { useT, useLocale } from "@/i18n/client";
import { formatNumber } from "@/i18n/format";
import { cn } from "@/components/ui/cn";
import { MESSAGE_MAX } from "./messaging";

/** DM composer: auto-grow; Enter sends with a keyboard (Shift+Enter = new line), the button on touch. */
const ThreadComposer = forwardRef(function ThreadComposer({ name, onSend, disabled }, ref) {
  const t = useT("chat");
  const { locale } = useLocale();
  const [value, setValue] = useState("");
  const [coarse, setCoarse] = useState(false);
  const area = useRef(null);

  useImperativeHandle(ref, () => ({ focus: () => area.current?.focus() }));
  useEffect(() => {
    try { setCoarse(window.matchMedia("(pointer: coarse)").matches); } catch {}
  }, []);
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);

  const tooLong = value.length > MESSAGE_MAX;
  const canSend = !disabled && value.trim().length > 0 && !tooLong;
  const submit = () => {
    if (!canSend) return;
    onSend(value);
    setValue("");
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="border-t border-line/10 bg-surface px-3 py-3 sm:px-4">
      <div className={cn(
        "flex items-end gap-2 rounded-lg border bg-surface-2/50 p-1.5 ps-3 transition-[border-color,box-shadow] duration-fast",
        tooLong ? "border-danger/50" : "border-line/15 focus-within:border-gold-400 focus-within:bg-surface focus-within:shadow-[0_0_0_3px_rgb(var(--c-gold-400)/0.16)]"
      )}>
        <label htmlFor="jz-dm-input" className="sr-only">{t("composer.label", { name })}</label>
        <textarea
          id="jz-dm-input"
          ref={area}
          rows={1}
          value={value}
          disabled={disabled}
          onChange={(e) => setValue(e.target.value)}
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
          className="max-h-40 min-h-[42px] flex-1 resize-none bg-transparent py-2.5 text-[1rem] leading-relaxed text-ink outline-none placeholder:text-ink-4 focus-visible:shadow-none disabled:cursor-not-allowed"
        />
        <button
          type="submit"
          disabled={!canSend}
          aria-label={t("composer.send")}
          title={t("composer.send")}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-primary-fg shadow-sm transition-[opacity,transform] duration-fast active:scale-95 disabled:opacity-35"
        >
          <ArrowUp size={19} strokeWidth={2.25} aria-hidden="true" />
        </button>
      </div>
      {value.length > MESSAGE_MAX * 0.8 && (
        <p className={cn("t-caption mt-1.5 px-1", tooLong && "text-danger")} role={tooLong ? "alert" : undefined}>
          {tooLong ? t("composer.tooLong", { max: formatNumber(MESSAGE_MAX, locale) }) : <span className="num">{t("composer.counter", { count: value.length, max: MESSAGE_MAX })}</span>}
        </p>
      )}
    </form>
  );
});

export default ThreadComposer;
