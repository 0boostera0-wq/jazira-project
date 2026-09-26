"use client";

import { useId, useRef, useState } from "react";
import { Compass } from "lucide-react";
import Button from "@/components/ui/Button";
import Illustration from "@/components/ui/Illustration";
import IconTile from "@/components/ui/IconTile";
import { cn } from "@/components/ui/cn";
import { TRACK_ART as ART } from "@/components/curriculum/model";
import { useLocale, useT } from "@/i18n/client";
import { subjectIcon } from "./icons";
import { catalogLabel } from "./names";
import { SubjectChip } from "./parts";

/**
 * Explorer for the high-school tracks. `tracks` comes from the catalog
 * (serialisable): [{ id, icon, name, name_en, subjects, grade2Href, grade3Href }].
 * xl: vertical tab list beside the panel. Below xl (the content column is
 * narrow while the sidebar shows): a row of short-name chips above the panel —
 * 2 columns on phones, 3 from sm, all 5 from md.
 */
export default function TracksExplorer({ tracks }) {
  const t = useT("stages");
  const tc = useT("common");
  const { locale } = useLocale();
  const base = useId();
  const refs = useRef([]);
  const [active, setActive] = useState(tracks[0]?.id);

  if (!tracks.length) return null;
  const track = tracks.find((x) => x.id === active) || tracks[0];
  const k = (id, leaf) => `highSchool.tracks.items.${id}.${leaf}`;
  // Pathway copy lives in the message files; fall back to the catalog name.
  const nameOf = (tr) => (t.has(k(tr.id, "name")) ? { text: t(k(tr.id, "name")), lang: null } : catalogLabel(tr, locale));
  const shortOf = (tr) => (t.has(k(tr.id, "short")) ? t(k(tr.id, "short")) : nameOf(tr).text);

  const onKey = (e, i) => {
    const rtl = document.documentElement.dir === "rtl";
    const map = { ArrowDown: 1, ArrowUp: -1, [rtl ? "ArrowLeft" : "ArrowRight"]: 1, [rtl ? "ArrowRight" : "ArrowLeft"]: -1 };
    let next = null;
    if (e.key in map) next = (i + map[e.key] + tracks.length) % tracks.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = tracks.length - 1;
    if (next === null) return;
    e.preventDefault();
    refs.current[next]?.focus();
    setActive(tracks[next].id);
  };

  const name = nameOf(track);

  return (
    <div className="grid gap-4 xl:grid-cols-12 xl:gap-6">
      <div role="tablist" aria-label={t("highSchool.tracks.listLabel")} aria-orientation="vertical" className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5 xl:col-span-4 xl:flex xl:flex-col xl:[&>button]:flex-1">
        {tracks.map((tr, i) => {
          const on = tr.id === track.id;
          const Icon = subjectIcon(tr.icon);
          const full = nameOf(tr);
          return (
            <button
              key={tr.id}
              ref={(el) => (refs.current[i] = el)}
              id={`${base}-tab-${tr.id}`}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls={`${base}-panel`}
              tabIndex={on ? 0 : -1}
              onClick={() => setActive(tr.id)}
              onKeyDown={(e) => onKey(e, i)}
              className={cn(
                "group flex min-h-11 items-center gap-3 rounded-md border px-3 py-2 text-start transition-[background-color,border-color,box-shadow] duration-fast xl:rounded-lg xl:px-4 xl:py-3",
                i === tracks.length - 1 && tracks.length % 2 === 1 && "col-span-2 sm:col-span-1",
                on ? "border-gold-300/80 bg-surface shadow-sm" : "border-line/12 bg-surface-2/60 hover:border-line/20 hover:bg-surface"
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "hidden h-9 w-9 shrink-0 place-items-center rounded-sm ring-1 ring-inset transition-colors xl:grid",
                  on ? "bg-gold-50 text-gold-600 ring-gold-200/70" : "bg-surface text-ink-3 ring-line/10"
                )}
              >
                <Icon size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("block text-sm font-medium xl:hidden", on ? "text-ink" : "text-ink-2")}>{shortOf(tr)}</span>
                <span lang={full.lang || undefined} className={cn("hidden text-[0.9375rem] font-medium leading-snug xl:block", on ? "text-ink" : "text-ink-2")}>
                  {full.text}
                </span>
                <span className="t-caption hidden xl:block">{tc("units.subjects", { count: tr.subjects.length })}</span>
              </span>
              <span aria-hidden="true" className={cn("hidden h-2 w-2 shrink-0 rounded-full xl:block", on ? "bg-gold-500" : "bg-transparent")} />
            </button>
          );
        })}
      </div>

      <div
        id={`${base}-panel`}
        role="tabpanel"
        aria-labelledby={`${base}-tab-${track.id}`}
        className="overflow-hidden rounded-lg border border-line/12 bg-surface shadow-sm xl:col-span-8"
      >
        <div key={track.id} className="animate-fade grid h-full sm:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div aria-hidden="true" className="relative aspect-[16/9] sm:aspect-auto sm:min-h-[16rem]">
            <Illustration id={ART[track.id] || "high-school.hero"} fill sizes="(min-width: 1280px) 300px, (min-width: 640px) 38vw, 100vw" />
          </div>
          <div className="flex min-w-0 flex-col p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <IconTile icon={subjectIcon(track.icon)} tone="gold" size="sm" />
              <h3 className="t-h3" lang={name.lang || undefined}>{name.text}</h3>
            </div>
            {t.has(k(track.id, "body")) && <p className="t-small mt-3 text-ink-2">{t(k(track.id, "body"))}</p>}

            {t.has(k(track.id, "fits")) && (
              <div className="mt-4 flex items-start gap-2.5 rounded-md bg-green-50 p-3 text-green-700">
                <Compass size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
                <p className="text-sm">
                  <span className="font-medium">{t("highSchool.tracks.fitsTitle")}: </span>
                  {t(k(track.id, "fits"))}
                </p>
              </div>
            )}

            <h4 className="t-caption mt-5 font-medium">{t("highSchool.tracks.subjectsTitle")}</h4>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {track.subjects.map((s) => (
                <SubjectChip key={s.id} subject={s} locale={locale} />
              ))}
            </div>

            <div className="mt-auto flex flex-wrap gap-2 pt-5">
              <Button href={track.grade2Href} variant="secondary">
                {t("highSchool.tracks.grade2")}
              </Button>
              {track.grade3Href && (
                <Button href={track.grade3Href} variant="ghost">
                  {t("highSchool.tracks.grade3")}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
