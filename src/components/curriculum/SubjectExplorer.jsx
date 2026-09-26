"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { ChevronRight, Info } from "lucide-react";
import { useLocale, useT } from "@/i18n/client";
import Dialog from "@/components/ui/Dialog";
import EmptyState from "@/components/ui/EmptyState";
import Button from "@/components/ui/Button";
import Tabs from "@/components/ui/Tabs";
import SubjectDetail from "./SubjectDetail";
import { SubjectTile } from "./SubjectIcon";

// The resource viewer only exists for files Jazira is authorised to host
// (none today) — it is never part of the page bundle until one is opened.
const PdfViewerModal = dynamic(() => import("./PdfViewerModal"), { ssr: false });

const TERMS = ["all", "t1", "t2"];

/**
 * Leaf page island: term filter → subject grid → subject drawer (native
 * <dialog> sheet). `?subject=<id>` (search results, command palette) opens the
 * drawer on arrival and is kept in the URL while it is open, so it can be shared.
 *   subjects: toClientSubject() shapes · context: { title, electiveOptions } · links: official URLs
 */
export default function SubjectExplorer({ subjects = [], context, links, emptyHref = "/curriculum" }) {
  const t = useT("curriculum");
  const { locale } = useLocale();
  const en = locale === "en";
  const [term, setTerm] = useState("all");
  const [openId, setOpenId] = useState(null);
  const [viewer, setViewer] = useState(null);

  const byId = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);
  const list = useMemo(() => (term === "all" ? subjects : subjects.filter((s) => s.terms?.includes(term))), [subjects, term]);
  const open = openId ? byId.get(openId) : null;

  const syncUrl = useCallback((id) => {
    try {
      const url = new URL(window.location.href);
      if (id) url.searchParams.set("subject", id);
      else url.searchParams.delete("subject");
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    } catch {
      /* URL sync is a convenience only */
    }
  }, []);

  // Deep link on arrival (read after mount so the page stays statically rendered).
  useEffect(() => {
    try {
      const id = new URLSearchParams(window.location.search).get("subject");
      if (id && byId.has(id)) setOpenId(id);
      else if (id) syncUrl(null);
    } catch {
      /* ignore */
    }
  }, [byId, syncUrl]);

  const show = (id) => {
    setOpenId(id);
    syncUrl(id);
  };
  const close = useCallback(() => {
    setOpenId(null);
    syncUrl(null);
  }, [syncUrl]);

  if (!subjects.length) {
    return (
      <EmptyState
        image="support.empty"
        title={t("empty.title")}
        description={t("empty.body")}
        action={<Button href={emptyHref} variant="secondary">{t("empty.cta")}</Button>}
        className="rounded-lg border border-dashed border-line/20"
      />
    );
  }

  const termLabel = t(`terms.${term}`);
  const countText = term === "all" ? t("count.subjects", { count: list.length }) : t("terms.count", { subjects: t("count.subjects", { count: list.length }), term: termLabel });

  return (
    <section aria-labelledby="subjects-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="subjects-title" className="t-h3">{t("leaf.subjectsLabel")}</h2>
          <p className="t-caption mt-0.5" aria-live="polite">{countText}</p>
        </div>
        <Tabs
          label={t("terms.label")}
          value={term}
          onChange={setTerm}
          items={TERMS.map((v) => ({ value: v, label: t(`terms.${v}`) }))}
          className="self-start sm:self-auto"
        />
      </div>

      <p className="t-caption mt-3 flex items-start gap-2 rounded-md border border-line/10 bg-surface-2/60 px-3 py-2.5">
        <Info size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-ink-3" />
        <span>{t("terms.note")}</span>
      </p>

      <ul className="mt-4 grid gap-2.5 sm:grid-cols-2 sm:gap-3 2xl:grid-cols-3">
        {list.map((s, i) => {
          const name = en ? s.name_en || s.name : s.name;
          const labels = (en ? s.labels_en : s.labels) || [];
          return (
            <li key={s.id} className="animate-in" style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}>
              <button
                type="button"
                onClick={() => show(s.id)}
                aria-haspopup="dialog"
                aria-label={t("subject.open", { name })}
                className="group flex h-full w-full items-center gap-3.5 rounded-lg border border-line/15 bg-surface p-3.5 text-start shadow-xs transition-[transform,box-shadow,border-color] duration ease-out hover:-translate-y-0.5 hover:border-line/20 hover:shadow-md sm:p-4"
              >
                <SubjectTile subject={s} />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium leading-snug text-ink">{name}</span>
                  {en && (
                    <span className="t-caption block truncate">
                      <span lang="ar" dir="rtl" className="font-ar">{s.name}</span>
                    </span>
                  )}
                  <span className="t-caption mt-0.5 block">
                    {labels.length > 0 && <span className="text-ink-2">{labels.join(en ? ", " : "، ")} · </span>}
                    <span className="tabular">{t("subject.periods", { count: s.periods })}</span>
                  </span>
                </span>
                <ChevronRight size={18} aria-hidden="true" className="shrink-0 text-ink-4 transition-colors group-hover:text-ink-2 flip-rtl" />
              </button>
            </li>
          );
        })}
      </ul>

      <Dialog
        open={Boolean(open)}
        onClose={close}
        variant="sheet"
        size="lg"
        title={open ? (en ? open.name_en || open.name : open.name) : ""}
        description={open ? `${context.title} · ${t(`resources.scope.${term}`)}` : ""}
      >
        {open && <SubjectDetail subject={open} term={term} context={context} links={links} onView={setViewer} />}
      </Dialog>

      {viewer && <PdfViewerModal resource={viewer} onClose={() => setViewer(null)} />}
    </section>
  );
}
