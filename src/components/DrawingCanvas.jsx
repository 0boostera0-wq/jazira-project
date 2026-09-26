"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Check, Download, Eraser, PencilLine, Trash2 } from "lucide-react";
import Button from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { useT } from "@/i18n/client";
import { withArabic } from "@/components/stages/withArabic";

// Handwriting practice for Arabic letters (elementary "learning games").
// The letters are educational content, so they stay Arabic in both locales —
// and every glyph shown or announced inside the UI copy is its own lang="ar"
// run (letter buttons, the prompt, the success line), never part of an
// English accessible name.
const LETTERS = ["أ", "ب", "ت", "ث", "ج", "ح", "خ", "د", "ذ", "ر", "ز", "س", "ش", "ص", "ض", "ط", "ظ", "ع", "غ", "ف", "ق", "ك", "ل", "م", "ن", "هـ", "و", "ي"];

// Pen inks. The pad is always cream paper (like the illustration plates), so
// these fixed colours — taken from the illustration palette — read in both themes.
const PAPER = "#FFFDF9";
const INKS = [
  { id: "ink", hex: "#3A3024" },
  { id: "gold", hex: "#A67F38" },
  { id: "green", hex: "#3F6B4E" },
  { id: "coral", hex: "#C9704F" },
  { id: "blue", hex: "#446A8A" },
];

export default function DrawingCanvas() {
  const t = useT("stages");
  const uid = useId();
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const drawingRef = useRef(false);
  const letterRefs = useRef([]);
  const pickerRef = useRef(null);
  const [index, setIndex] = useState(0);
  const [color, setColor] = useState(INKS[0].hex);
  const [size, setSize] = useState(8);
  const [erasing, setErasing] = useState(false);
  const [done, setDone] = useState(false);
  const style = useRef({ color, size, erasing });
  style.current = { color, size, erasing };

  const target = LETTERS[index];

  const applyStyle = useCallback((ctx) => {
    const s = style.current;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = s.erasing ? s.size * 2.2 : s.size;
    ctx.globalCompositeOperation = s.erasing ? "destination-out" : "source-over";
    ctx.strokeStyle = s.color;
  }, []);

  // Size the backing store to the element (crisp on HiDPI) and keep the
  // drawing when the pad is resized (rotation, window resize).
  const setup = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const ratio = window.devicePixelRatio || 1;
    const w = Math.round(rect.width * ratio);
    const h = Math.round(rect.height * ratio);
    if (canvas.width === w && canvas.height === h && ctxRef.current) return;

    let snapshot = null;
    if (canvas.width && canvas.height && ctxRef.current) {
      snapshot = document.createElement("canvas");
      snapshot.width = canvas.width;
      snapshot.height = canvas.height;
      snapshot.getContext("2d").drawImage(canvas, 0, 0);
    }
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    if (snapshot) {
      ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(snapshot, 0, 0, rect.width, rect.height);
    }
    applyStyle(ctx);
    ctxRef.current = ctx;
  }, [applyStyle]);

  useEffect(() => {
    setup();
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setup());
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [setup]);

  useEffect(() => {
    if (ctxRef.current) applyStyle(ctxRef.current);
  }, [color, size, erasing, applyStyle]);

  // Keep the chosen letter visible in the scrollable picker (horizontal only —
  // never scrolls the page).
  useEffect(() => {
    const box = pickerRef.current;
    const el = letterRefs.current[index];
    if (!box || !el) return;
    const b = box.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (r.left < b.left) box.scrollLeft -= b.left - r.left + 8;
    else if (r.right > b.right) box.scrollLeft += r.right - b.right + 8;
  }, [index]);

  const point = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onDown = (e) => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    e.preventDefault();
    canvasRef.current.setPointerCapture?.(e.pointerId);
    setDone(false);
    drawingRef.current = true;
    const { x, y } = point(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 0.01, y); // a tap leaves a dot
    ctx.stroke();
  };

  const onMove = (e) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const { x, y } = point(e);
    ctxRef.current.lineTo(x, y);
    ctxRef.current.stroke();
  };

  const onUp = () => {
    drawingRef.current = false;
  };

  const clear = () => {
    const c = canvasRef.current;
    const ctx = ctxRef.current;
    if (!c || !ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.restore();
    setDone(false);
  };

  const pick = (i) => {
    setIndex(i);
    clear();
  };

  const nextLetter = () => pick((index + 1) % LETTERS.length);

  const save = () => {
    const c = canvasRef.current;
    if (!c) return;
    // Flatten the strokes onto the paper colour so the image isn't transparent.
    const out = document.createElement("canvas");
    out.width = c.width;
    out.height = c.height;
    const o = out.getContext("2d");
    o.fillStyle = PAPER;
    o.fillRect(0, 0, out.width, out.height);
    o.drawImage(c, 0, 0);
    const a = document.createElement("a");
    a.href = out.toDataURL("image/png");
    a.download = `${t("games.writing.fileName", { n: index + 1 })}.png`;
    a.click();
  };

  return (
    <div className="surface-flat p-4 sm:p-5">
      {/* Prompt + letter picker */}
      <div className="flex items-center gap-4">
        <span
          aria-hidden="true"
          lang="ar"
          dir="rtl"
          className="grid h-16 w-16 shrink-0 place-items-center rounded-md bg-gold-50 font-ar text-4xl font-bold leading-none text-gold-700 ring-1 ring-inset ring-gold-200/70"
        >
          {target}
        </span>
        {/* The letter itself is shown in the tile; the text says where we are in
            the alphabet so no Arabic glyph is mixed into the (possibly English) heading. */}
        <div className="min-w-0" aria-live="polite">
          <p className="t-caption tabular">{t("games.writing.position", { current: index + 1, total: LETTERS.length })}</p>
          <p className="t-h4 mt-0.5">{t("games.writing.prompt")}</p>
          <p id={`${uid}-letter`} className="sr-only">{withArabic(t, "games.writing.letter", {}, "letter", target)}</p>
        </div>
      </div>

      <div
        ref={pickerRef}
        role="group"
        aria-label={t("games.writing.pickLetter")}
        dir="rtl"
        className="-mx-1 mt-4 flex snap-x gap-1.5 overflow-x-auto pb-1 pe-10 ps-1 [mask-image:linear-gradient(to_right,transparent,#000_2.5rem)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {LETTERS.map((l, i) => (
          <button
            key={l}
            ref={(el) => (letterRefs.current[i] = el)}
            type="button"
            lang="ar"
            onClick={() => pick(i)}
            aria-pressed={i === index}
            className={cn(
              "grid h-11 w-11 shrink-0 snap-start place-items-center rounded-md font-ar text-xl font-bold transition-colors duration-fast",
              i === index ? "bg-primary text-primary-fg shadow-sm" : "bg-surface-2 text-ink hover:bg-surface-3"
            )}
          >
            {l}
          </button>
        ))}
      </div>

      {/* Writing pad: cream paper with a faint guide letter */}
      <div className="relative mt-4 overflow-hidden rounded-lg border-2 border-dashed border-[#D9BE8C]/70 bg-[#FFFDF9]">
        <span
          aria-hidden="true"
          lang="ar"
          className="pointer-events-none absolute inset-0 grid select-none place-items-center font-ar text-[10rem] font-bold leading-none text-[#E3D3B5]/60 sm:text-[12rem]"
        >
          {target}
        </span>
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={t("games.writing.pad")}
          aria-describedby={`${uid}-letter`}
          className="relative block h-64 w-full cursor-crosshair touch-none sm:h-80"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onPointerLeave={onUp}
        />
      </div>

      {/* Toolbar */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {/* Native radios: one tab stop, arrow keys move between inks. */}
          <fieldset className="flex min-w-0 items-center">
            <legend className="sr-only">{t("games.writing.colorsLabel")}</legend>
            {INKS.map((ink) => {
              const active = !erasing && color === ink.hex;
              return (
                <label key={ink.id} className="relative grid h-11 w-9 cursor-pointer place-items-center rounded-full has-[:focus-visible]:shadow-[var(--ring)]">
                  <input
                    type="radio"
                    name={`${uid}-ink`}
                    value={ink.id}
                    checked={active}
                    onChange={() => {
                      setErasing(false);
                      setColor(ink.hex);
                    }}
                    className="sr-only"
                  />
                  <span className="sr-only">{t(`games.writing.colors.${ink.id}`)}</span>
                  <span
                    aria-hidden="true"
                    className={cn(
                      "block h-6 w-6 rounded-full ring-offset-2 ring-offset-surface transition-transform duration-fast",
                      active ? "scale-110 ring-2 ring-gold-400" : "ring-1 ring-line/15"
                    )}
                    style={{ backgroundColor: ink.hex }}
                  />
                </label>
              );
            })}
          </fieldset>
          <label className="flex h-11 items-center gap-2 text-ink-3">
            <PencilLine size={16} aria-hidden="true" />
            <span className="sr-only">{t("games.writing.size")}</span>
            <input
              type="range"
              min="3"
              max="22"
              value={size}
              onChange={(e) => setSize(Number(e.target.value))}
              className="h-1.5 w-24 cursor-pointer appearance-none rounded-full bg-surface-3 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-surface [&::-moz-range-thumb]:bg-gold-500 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-surface [&::-webkit-slider-thumb]:bg-gold-500 [&::-webkit-slider-thumb]:shadow-sm"
            />
          </label>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="icon"
            variant={erasing ? "soft" : "secondary"}
            aria-pressed={erasing}
            aria-label={t("games.writing.eraser")}
            title={t("games.writing.eraser")}
            onClick={() => setErasing((v) => !v)}
            className="h-11 w-11"
          >
            <Eraser size={18} aria-hidden="true" />
          </Button>
          <Button size="icon" variant="secondary" aria-label={t("games.writing.clear")} title={t("games.writing.clear")} onClick={clear} className="h-11 w-11">
            <Trash2 size={18} aria-hidden="true" />
          </Button>
          <Button size="icon" variant="secondary" aria-label={t("games.writing.save")} title={t("games.writing.save")} onClick={save} className="h-11 w-11">
            <Download size={18} aria-hidden="true" />
          </Button>
          <Button variant="primary" iconStart={Check} onClick={() => setDone(true)} className="ms-1">
            {t("games.writing.done")}
          </Button>
        </div>
      </div>

      <div aria-live="polite">
        {done && (
          <div className="animate-scale mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-green-100 bg-green-50 p-3.5 ps-4 text-green-700">
            <p className="font-medium">{withArabic(t, "games.writing.success", {}, "letter", target)}</p>
            <Button variant="secondary" size="sm" onClick={nextLetter}>
              {t("games.writing.next")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
