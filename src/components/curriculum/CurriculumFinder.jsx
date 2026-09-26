"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { CornerDownLeft, GraduationCap, Search, X } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { useLocale, useT } from "@/i18n/client";
import { cn } from "@/components/ui/cn";
import { buildIndex, searchIndex } from "./model";
import { SubjectTile } from "./SubjectIcon";

// Instant, local search across every grade, track and subject. The catalog is
// fetched as its own chunk the first time the visitor focuses or types (zero
// cost on first paint); matching is in-memory and debounced (200ms). Results
// float in a panel under the field, so the page never jumps while typing.

const STAGES = ["all", "elementary", "middle", "high-school"];
const PAGE = 8;

let indexPromise = null;
function loadIndex() {
  if (!indexPromise) {
    indexPromise = import("@/lib/curriculum")
      .then((m) => buildIndex(m.CURRICULUM))
      .catch((e) => {
        indexPromise = null;
        throw e;
      });
  }
  return indexPromise;
}

function Row({ e, label, trail, first }) {
  return (
    <li>
      <Link
        href={e.href}
        className="group flex min-h-[3.25rem] items-center gap-3 rounded-md px-2.5 py-2 transition-colors duration-fast hover:bg-surface-2 focus-visible:bg-surface-2"
      >
        {e.kind === "subject" ? (
          <SubjectTile subject={{ id: e.subjectId, icon: e.icon, color: e.color }} size="sm" />
        ) : (
          <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-sm bg-surface-2 text-ink-2 ring-1 ring-inset ring-line/10">
            <GraduationCap size={16} />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.9375rem] font-medium text-ink">{label}</span>
          {trail && <span className="t-caption block truncate">{trail}</span>}
        </span>
        {first && <CornerDownLeft size={15} aria-hidden="true" className="hidden shrink-0 text-ink-4 sm:block rtl:-scale-x-100" />}
      </Link>
    </li>
  );
}

export default function CurriculumFinder({ className }) {
  const t = useT("curriculum");
  const { locale } = useLocale();
  const router = useRouter();
  const uid = useId();
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const resultsRef = useRef(null);
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [stage, setStage] = useState("all");
  const [index, setIndex] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | loading | ready | error
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState(false);

  const ensureIndex = useCallback(() => {
    if (index || status === "loading") return;
    setStatus("loading");
    loadIndex()
      .then((ix) => {
        setIndex(ix);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, [index, status]);

  useEffect(() => {
    const h = setTimeout(() => setDq(q), 200);
    return () => clearTimeout(h);
  }, [q]);
  useEffect(() => setLimit(PAGE), [dq, stage]);
  useEffect(() => {
    if (q.trim().length >= 2) ensureIndex();
  }, [q, ensureIndex]);

  // The panel floats over the page; a pointer or focus outside the finder closes it.
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("focusin", away);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("focusin", away);
    };
  }, [open]);

  const active = dq.trim().length >= 2;
  const res = useMemo(() => (index && active ? searchIndex(index, dq, { stage }) : null), [index, dq, stage, active]);
  const all = useMemo(() => (res ? [...res.nodes, ...res.subjects] : []), [res]);
  const shown = all.slice(0, limit);
  const nodes = shown.filter((e) => e.kind === "node");
  const subjects = shown.filter((e) => e.kind === "subject");
  const label = (e) => (locale === "en" ? e.en : e.ar);
  const trail = (e) => (locale === "en" ? e.trailEn : e.trailAr).join(" · ");
  const panel = open && active;

  const search = (text) => {
    setQ(text);
    setOpen(true);
    ensureIndex();
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" && all[0]) {
      e.preventDefault();
      router.push(all[0].href);
    }
    if (e.key === "ArrowDown" && panel) {
      const first = resultsRef.current?.querySelector("a");
      if (first) {
        e.preventDefault();
        first.focus();
      }
    }
    if (e.key === "Escape") {
      e.preventDefault();
      if (panel) setOpen(false);
      else setQ("");
    }
  };

  // Arrow keys move between result links; Escape returns to the field.
  const onResultsKeyDown = (e) => {
    const links = [...(resultsRef.current?.querySelectorAll("a") || [])];
    const i = links.indexOf(document.activeElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = e.key === "ArrowDown" ? i + 1 : i - 1;
      if (next < 0) inputRef.current?.focus();
      else links[Math.min(next, links.length - 1)]?.focus();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      inputRef.current?.focus(); // focusing re-opens the panel (onFocus), so close it after
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} role="search" className={cn("relative w-full", className)}>
      <label htmlFor={`${uid}-q`} className="sr-only">
        {t("finder.label")}
      </label>
      <div className="relative">
        <div className="relative">
          <Search size={19} aria-hidden="true" className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-ink-3" />
          <input
            ref={inputRef}
            id={`${uid}-q`}
            type="search"
            value={q}
            autoComplete="off"
            enterKeyHint="search"
            placeholder={t("finder.placeholder")}
            onFocus={() => {
              ensureIndex();
              setOpen(true);
            }}
            onChange={(e) => search(e.target.value)}
            onKeyDown={onKeyDown}
            aria-describedby={`${uid}-hint`}
            aria-controls={`${uid}-results`}
            className="block h-12 w-full rounded-full border border-line/20 bg-surface pe-12 ps-11 text-[1rem] text-ink shadow-sm transition-[border-color,box-shadow] duration-fast placeholder:text-ink-4 hover:border-line/30 focus:border-gold-400 focus:shadow-[0_0_0_3px_rgb(var(--c-gold-400)/0.18)] focus:outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              aria-label={t("finder.clear")}
              className="absolute end-1.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <X size={17} aria-hidden="true" />
            </button>
          )}
        </div>

        <div role="group" aria-label={t("finder.filterLabel")} className="mt-3 flex flex-wrap gap-1.5">
          {STAGES.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={stage === s}
              onClick={() => {
                setStage(s);
                if (q.trim().length >= 2) setOpen(true);
              }}
              className={cn(
                "inline-flex h-11 items-center rounded-full border px-3.5 text-[0.8125rem] font-medium transition-colors duration-fast sm:h-9",
                stage === s ? "border-transparent bg-primary text-primary-fg" : "border-line/15 bg-surface text-ink-2 hover:border-line/30 hover:text-ink"
              )}
            >
              {t(`finder.filters.${s}`)}
            </button>
          ))}
        </div>
        <div
          ref={resultsRef}
          id={`${uid}-results`}
          aria-live="polite"
          onKeyDown={onResultsKeyDown}
          className={cn(
            "absolute inset-x-0 top-full z-30 mt-2 max-h-[min(30rem,62vh)] overflow-y-auto overscroll-contain rounded-lg border border-line/15 bg-surface p-1.5 shadow-lg",
            panel ? "animate-fade" : "hidden"
          )}
        >
          {panel &&
            (status === "error" ? (
              <p className="t-small flex flex-wrap items-center gap-2 px-2.5 py-3 text-ink-3">
                {t("finder.error")}
                <button type="button" onClick={ensureIndex} className="font-medium text-gold-600 underline-offset-4 hover:underline">
                  {t("finder.retry")}
                </button>
              </p>
            ) : !res ? (
              <p className="t-small px-2.5 py-3 text-ink-3">{t("finder.loading")}</p>
            ) : res.total === 0 ? (
              <div className="px-2.5 py-3">
                <p className="font-medium text-ink">{t("finder.noneTitle")}</p>
                <p className="t-small mt-1 text-ink-3">{t("finder.noneBody")}</p>
              </div>
            ) : (
              <>
                <p className="t-caption px-2.5 pb-1 pt-1.5">{t("count.results", { count: res.total })}</p>
                {nodes.length > 0 && (
                  <section aria-label={t("finder.groups.nodes")}>
                    <h3 className="px-2.5 pb-1 pt-2 text-[0.75rem] font-medium text-ink-3">{t("finder.groups.nodes")}</h3>
                    <ul>
                      {nodes.map((e) => (
                        <Row key={e.key} e={e} label={label(e)} trail={trail(e)} first={e === all[0]} />
                      ))}
                    </ul>
                  </section>
                )}
                {subjects.length > 0 && (
                  <section aria-label={t("finder.groups.subjects")}>
                    <h3 className="px-2.5 pb-1 pt-2 text-[0.75rem] font-medium text-ink-3">{t("finder.groups.subjects")}</h3>
                    <ul>
                      {subjects.map((e) => (
                        <Row key={e.key} e={e} label={label(e)} trail={trail(e)} first={e === all[0]} />
                      ))}
                    </ul>
                  </section>
                )}
                {all.length > limit && (
                  <div className="border-t border-line/10 px-1 pt-1.5">
                    <button
                      type="button"
                      onClick={() => setLimit((n) => n + PAGE)}
                      className="h-10 w-full rounded-md text-sm font-medium text-gold-600 transition-colors hover:bg-surface-2"
                    >
                      {t("finder.showMore")}
                    </button>
                  </div>
                )}
              </>
            ))}
        </div>
      </div>

      <div id={`${uid}-hint`} className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="t-caption">{t("finder.examplesLabel")}</span>
        {(t.raw("finder.examples") || []).map((ex) => (
          <button key={ex} type="button" onClick={() => search(ex)} className="rounded-xs py-1.5 text-[0.8125rem] font-medium text-gold-600 underline-offset-4 hover:underline">
            {ex}
          </button>
        ))}
        <span className="sr-only">{t("finder.hint")}</span>
      </div>
    </div>
  );
}
