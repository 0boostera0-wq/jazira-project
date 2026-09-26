"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import { Maximize2, X } from "lucide-react";
import { useT } from "@/i18n/client";
import Dialog from "@/components/ui/Dialog";
import { cn } from "@/components/ui/cn";
import { mediaAspect } from "./model";

/**
 * Post media in a box sized from the dimensions encoded at upload time, so
 * nothing jumps while it loads. Images lazy-load and open full size; videos
 * only fetch metadata once they are near the viewport.
 */
export default function MediaView({ media, label, className }) {
  const t = useT("community");
  const [open, setOpen] = useState(false);
  if (!media?.url) return null;
  const ratio = mediaAspect(media.dims, media.type);
  const w = media.dims?.width || (media.type === "video" ? 1280 : 1200);
  const h = media.dims?.height || Math.round(w / ratio);

  if (media.type === "video") {
    return (
      <div className={cn("overflow-hidden rounded-md bg-surface-3", className)} style={{ aspectRatio: ratio }}>
        <LazyVideo src={media.url} width={w} height={h} label={t("post.a11y.video")} />
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("post.a11y.openImage")}
        className={cn("group relative block w-full overflow-hidden rounded-md bg-surface-2", className)}
        style={{ aspectRatio: ratio }}
      >
        <img
          src={media.url}
          alt={label || ""}
          width={w}
          height={h}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-contain"
        />
        <span aria-hidden="true" className="absolute bottom-2.5 end-2.5 grid h-8 w-8 place-items-center rounded-full bg-[rgb(20_15_8/0.55)] text-white opacity-0 transition-opacity duration-fast group-hover:opacity-100 group-focus-visible:opacity-100">
          <Maximize2 size={15} />
        </span>
      </button>
      {open && (
        <Dialog open bare size="xl" onClose={() => setOpen(false)}>
          <div className="relative flex items-center justify-center p-2 sm:p-4">
            <img src={media.url} alt={label || ""} width={w} height={h} className="max-h-[82dvh] w-auto rounded-md object-contain" />
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t("post.a11y.closeImage")}
              className="absolute end-3 top-3 grid h-10 w-10 place-items-center rounded-full bg-[rgb(20_15_8/0.6)] text-white hover:bg-[rgb(20_15_8/0.75)]"
            >
              <X size={18} />
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}

function LazyVideo({ src, width, height, label }) {
  const ref = useRef(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    if (typeof IntersectionObserver === "undefined") { setNear(true); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setNear(true); io.disconnect(); }
    }, { rootMargin: "400px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [near]);
  return (
    <video
      ref={ref}
      src={near ? src : undefined}
      width={width}
      height={height}
      controls
      playsInline
      preload={near ? "metadata" : "none"}
      aria-label={label}
      className="h-full w-full bg-surface-3 object-contain"
    />
  );
}
