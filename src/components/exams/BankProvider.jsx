"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getBankStats } from "@/lib/data/exams";
import { useLocale, useT } from "@/i18n/client";
import { formatNumber } from "@/i18n/format";
import Skeleton from "@/components/ui/Skeleton";
import { normalizeBankStats, totalOf } from "./bank";

// ============================================================================
// Question-bank counts for every number on the exam pages, loaded ONCE per
// page (and cached for 5 minutes across client navigations).
//
//   db    — get_question_bank_stats() (the platform bank), null when unavailable
//   local — bundled practice bank counted on the server (props), what guests
//           and local practice mode actually draw from
//
// Leaves (<BankNumber/>) render a small skeleton until the bank resolves, so
// the server-rendered page never waits on this request.
// ============================================================================

const BankContext = createContext({ status: "loading", db: null, local: null });

let cache = null;
function loadDbBank() {
  if (!cache || Date.now() - cache.at > 5 * 60_000) {
    const entry = { at: Date.now(), promise: null };
    entry.promise = getBankStats()
      .then(normalizeBankStats)
      .catch(() => null)
      .then((bank) => {
        // don't pin a failed / unavailable lookup for 5 minutes: retry on the next page
        if (!bank && cache === entry) cache = null;
        return bank;
      });
    cache = entry;
  }
  return cache.promise;
}

export function BankProvider({ local = null, children }) {
  const [db, setDb] = useState(undefined);
  useEffect(() => {
    let alive = true;
    loadDbBank().then((b) => alive && setDb(b));
    return () => {
      alive = false;
    };
  }, []);
  const value = useMemo(() => ({ status: db === undefined ? "loading" : "ready", db: db || null, local }), [db, local]);
  return <BankContext.Provider value={value}>{children}</BankContext.Provider>;
}

export const useBank = () => useContext(BankContext);

/** The bank to describe publicly: the platform bank, or the practice bank when it's unreachable. */
export const shownBank = ({ db, local }) => db || local;

function nodeFor(bank, { exam, section, topic }) {
  if (!bank) return null;
  if (!exam) return bank;
  const e = bank.exams?.[exam];
  if (!section) return e;
  const s = e?.sections?.[section];
  return topic ? s?.topics?.[topic] : s;
}

/**
 * A count from the bank (all questions, premium included), formatted.
 * Server components can render it (props are plain values):
 *   <BankNumber exam="aptitude" section="verbal" />            → "60"
 *   <BankNumber exam="aptitude" unit="questions" />            → "140 سؤالًا"
 */
export function BankNumber({ exam, section, topic, unit, className, skeletonClass = "h-4 w-10" }) {
  const state = useBank();
  const { locale } = useLocale();
  const tc = useT("common");
  // a <span> skeleton: this leaf is often rendered inside <p>/<li> text
  if (state.status === "loading") return <span aria-hidden="true" className={`skeleton inline-block rounded-sm align-middle ${skeletonClass}`} />;
  const bank = shownBank(state);
  if (!bank) return null;
  const n = totalOf(nodeFor(bank, { exam, section, topic }));
  return <span className={className}>{unit === "questions" ? tc("units.questions", { count: n }) : formatNumber(n, locale)}</span>;
}

/**
 * Big number + plural caption for a hero facts row (a <div> inside a <dl>).
 * captionKey is an exams-namespace plural key (e.g. "factLabels.questions").
 */
export function BankFact({ exam, captionKey, className }) {
  const state = useBank();
  const { locale } = useLocale();
  const t = useT("exams");
  const bank = state.status === "ready" ? shownBank(state) : null;
  const n = bank ? totalOf(nodeFor(bank, { exam })) : null;
  return (
    <div className={className}>
      <dt className="sr-only">{n === null ? t(captionKey, { count: 0 }) : t(captionKey, { count: n })}</dt>
      <dd>
        {state.status === "loading" ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <span className="block text-2xl font-bold leading-tight text-ink tabular sm:text-[1.75rem]">{n === null ? "—" : formatNumber(n, locale)}</span>
        )}
        <span aria-hidden="true" className="t-caption mt-1 block">{t(captionKey, { count: n ?? 0 })}</span>
      </dd>
    </div>
  );
}

/** "{count} of them for Elite members" — renders nothing when the bank has no premium items. */
export function BankPremiumNote({ messageKey = "hub.premiumNote", className }) {
  const state = useBank();
  const t = useT("exams");
  const bank = state.status === "ready" ? shownBank(state) : null;
  if (!bank?.premium) return null;
  return <p className={className}>{t(messageKey, { count: bank.premium })}</p>;
}
