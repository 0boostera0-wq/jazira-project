"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { X, ZoomIn, ZoomOut, Download, Loader2, FileWarning, RotateCw } from "lucide-react";

// Custom in-app PDF viewer. The book opens HERE — never a new tab / external
// redirect. It fetches the file as a Blob from our OWN API (/api/content/fetch),
// creates an object URL, and renders it in an iframe with a themed toolbar:
// Zoom In / Zoom Out / Reset / Download / Close. Because the bytes arrive as a
// Blob from our own origin, the browser Network tab only ever shows a request to
// our domain — a natural consequence of serving content through our API.
export default function PdfViewerModal({ open, resource, onClose }) {
  const [url, setUrl] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | loading | ready | error
  const [zoom, setZoom] = useState(1);
  const blobRef = useRef(null);

  const cleanup = useCallback(() => {
    if (blobRef.current) {
      URL.revokeObjectURL(blobRef.current);
      blobRef.current = null;
    }
    setUrl(null);
  }, []);

  useEffect(() => {
    if (!open || !resource) return;
    let cancelled = false;
    setStatus("loading");
    setZoom(1);
    (async () => {
      try {
        const res = await fetch(`/api/content/fetch?key=${encodeURIComponent(resource.key)}`);
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        if (cancelled) return;
        const objectUrl = URL.createObjectURL(blob);
        blobRef.current = objectUrl;
        setUrl(objectUrl);
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
      cleanup();
    };
  }, [open, resource, cleanup]);

  const close = useCallback(() => onClose?.(), [onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") close();
      if (e.key === "+" || e.key === "=") setZoom((z) => Math.min(3, +(z + 0.15).toFixed(2)));
      if (e.key === "-") setZoom((z) => Math.max(0.5, +(z - 0.15).toFixed(2)));
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, close]);

  if (!open) return null;

  const download = () => {
    if (!blobRef.current) return;
    const a = document.createElement("a");
    a.href = blobRef.current;
    a.download = `${resource?.title || "document"}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-ink/70 backdrop-blur-sm" onClick={close}>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <div className="min-w-0">
          <p className="truncate text-sm font-extrabold text-white">{resource?.title}</p>
          <p className="truncate text-[11px] text-white/60">منصة جزيرة — عارض المحتوى</p>
        </div>
        <div className="flex items-center gap-1.5">
          <ToolBtn onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.15).toFixed(2)))} title="تصغير">
            <ZoomOut size={18} />
          </ToolBtn>
          <span className="w-12 text-center text-xs font-bold text-white" dir="ltr">
            {Math.round(zoom * 100)}%
          </span>
          <ToolBtn onClick={() => setZoom((z) => Math.min(3, +(z + 0.15).toFixed(2)))} title="تكبير">
            <ZoomIn size={18} />
          </ToolBtn>
          <ToolBtn onClick={() => setZoom(1)} title="إعادة الضبط">
            <RotateCw size={16} />
          </ToolBtn>
          <ToolBtn onClick={download} disabled={status !== "ready"} title="تحميل">
            <Download size={18} />
          </ToolBtn>
          <ToolBtn onClick={close} title="إغلاق">
            <X size={18} />
          </ToolBtn>
        </div>
      </div>

      {/* Stage */}
      <div className="relative flex-1 overflow-auto px-2 pb-4" onClick={(e) => e.stopPropagation()}>
        {status === "loading" && (
          <Centered>
            <Loader2 className="animate-spin" size={34} />
            <p className="mt-3 text-sm">جارٍ تحميل المحتوى…</p>
          </Centered>
        )}
        {status === "error" && (
          <Centered>
            <FileWarning size={34} />
            <p className="mt-3 text-sm">تعذّر تحميل المحتوى. تأكد من توفر الملف في مخزن المحتوى الخاص بك.</p>
          </Centered>
        )}
        {status === "ready" && url && (
          <div className="mx-auto w-full max-w-4xl">
            <div
              style={{ transform: `scale(${zoom})`, transformOrigin: "top center", transition: "transform 0.15s ease" }}
            >
              <iframe
                title={resource?.title || "PDF"}
                src={`${url}#toolbar=0&navpanes=0&view=FitH`}
                className="h-[82vh] w-full rounded-2xl bg-white shadow-2xl"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ToolBtn({ children, ...p }) {
  return (
    <button
      {...p}
      className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 text-white transition hover:bg-white/20 disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function Centered({ children }) {
  return (
    <div className="grid h-full place-items-center text-center text-white/80">
      <div className="flex flex-col items-center px-6">{children}</div>
    </div>
  );
}
