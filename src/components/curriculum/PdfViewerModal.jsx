"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, FileWarning, RotateCcw, X, ZoomIn, ZoomOut } from "lucide-react";
import { useLocale, useT } from "@/i18n/client";
import Button from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";
import Spinner from "@/components/ui/Spinner";
import { cn } from "@/components/ui/cn";

// Viewer for curriculum files Jazira is AUTHORISED to host (src/content/
// curriculum/hosted.js — empty today; official textbooks stay on Madrasati).
// Loaded with next/dynamic only when such a file is opened. The file comes
// from /api/content/fetch, which serves only keys the manifest marks "hosted"
// and answers 404 JSON for everything else — so a failed fetch shows an
// honest error, never a placeholder document.

const MIN = 1;
const MAX = 2;
const STEP = 0.25;

export default function PdfViewerModal({ resource, onClose }) {
  const t = useT("curriculum");
  const { locale } = useLocale();
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [url, setUrl] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const objectUrl = useRef(null);
  const rootRef = useRef(null);
  const title = resource?.label || (locale === "en" ? resource?.title_en : resource?.title) || resource?.title || "";

  useEffect(() => {
    if (!resource?.key) return undefined;
    const ctrl = new AbortController();
    setStatus("loading");
    setUrl(null);
    fetch(`/api/content/fetch?key=${encodeURIComponent(resource.key)}`, { signal: ctrl.signal })
      .then(async (res) => {
        const type = res.headers.get("content-type") || "";
        if (!res.ok || !type.includes("application/pdf")) throw new Error(String(res.status));
        const blob = await res.blob();
        const u = URL.createObjectURL(blob);
        objectUrl.current = u;
        setUrl(u);
        setStatus("ready");
      })
      .catch((e) => {
        if (e?.name !== "AbortError") setStatus("error");
      });
    return () => {
      ctrl.abort();
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = null;
    };
  }, [resource?.key, attempt]);

  // The shared <Dialog> has no header in `bare` mode, so name the native <dialog> here.
  useEffect(() => {
    const dlg = rootRef.current?.closest("dialog");
    if (!dlg || !title) return undefined;
    dlg.setAttribute("aria-label", title);
    return () => dlg.removeAttribute("aria-label");
  }, [title]);

  const zoomBy = useCallback((d) => setZoom((z) => Math.min(MAX, Math.max(MIN, +(z + d).toFixed(2)))), []);

  const download = () => {
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = (resource.key.split("/").pop() || "document.pdf").replace(/[^A-Za-z0-9_.-]/g, "");
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const tool = "grid h-10 w-10 place-items-center rounded-full text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink disabled:pointer-events-none disabled:opacity-40";

  return (
    <Dialog open onClose={onClose} bare size="xl" className="h-[92dvh] sm:h-[88dvh]">
      <div ref={rootRef} className="flex h-full flex-col">
        <div className="flex items-center gap-2 border-b border-line/10 px-3 py-2 sm:px-4">
          <div className="min-w-0 flex-1 px-1">
            <p className="t-caption">{t("viewer.label")}</p>
            <h2 className="truncate text-[0.9375rem] font-medium text-ink">{title}</h2>
          </div>
          <div className="flex items-center gap-0.5" role="toolbar" aria-label={t("viewer.label")}>
            <button type="button" className={cn(tool, "hidden sm:grid")} onClick={() => zoomBy(-STEP)} disabled={status !== "ready" || zoom <= MIN} aria-label={t("viewer.zoomOut")}>
              <ZoomOut size={18} aria-hidden="true" />
            </button>
            <span className="hidden w-12 text-center text-xs font-medium text-ink-3 tabular sm:block" dir="ltr">{Math.round(zoom * 100)}%</span>
            <button type="button" className={cn(tool, "hidden sm:grid")} onClick={() => zoomBy(STEP)} disabled={status !== "ready" || zoom >= MAX} aria-label={t("viewer.zoomIn")}>
              <ZoomIn size={18} aria-hidden="true" />
            </button>
            <button type="button" className={cn(tool, "hidden sm:grid")} onClick={() => setZoom(1)} disabled={status !== "ready" || zoom === 1} aria-label={t("viewer.reset")}>
              <RotateCcw size={17} aria-hidden="true" />
            </button>
            <button type="button" className={tool} onClick={download} disabled={status !== "ready"} aria-label={t("viewer.download")}>
              <Download size={18} aria-hidden="true" />
            </button>
            <button type="button" className={tool} onClick={onClose} aria-label={t("viewer.close")}>
              <X size={19} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="relative min-h-0 flex-1 overflow-auto bg-surface-2">
          {status === "loading" && (
            <div className="grid h-full place-items-center p-6 text-center" role="status">
              <div className="flex flex-col items-center gap-3 text-ink-3">
                <Spinner size={26} />
                <p className="t-small">{t("viewer.loading")}</p>
              </div>
            </div>
          )}
          {status === "error" && (
            <div className="grid h-full place-items-center p-6 text-center" role="alert">
              <div className="flex max-w-sm flex-col items-center">
                <span className="grid h-12 w-12 place-items-center rounded-lg bg-surface text-ink-3 ring-1 ring-inset ring-line/15">
                  <FileWarning size={22} aria-hidden="true" />
                </span>
                <p className="t-small mt-3 text-ink-2">{t("viewer.error")}</p>
                <Button size="sm" variant="secondary" className="mt-4" onClick={() => setAttempt((n) => n + 1)}>
                  {t("viewer.retry")}
                </Button>
              </div>
            </div>
          )}
          {status === "ready" && url && (
            <div className="mx-auto h-full" style={{ width: `${zoom * 100}%`, minWidth: "100%" }}>
              <iframe title={title} src={`${url}#toolbar=0&navpanes=0&view=FitH`} className="block h-full w-full border-0 bg-white" />
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
