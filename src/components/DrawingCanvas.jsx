"use client";

import { useEffect, useRef, useState } from "react";
import { Eraser, Trash2, Download, Palette, Check } from "lucide-react";

const LETTERS = ["أ", "ب", "ت", "ث", "ج", "ح", "خ", "د", "ر", "س", "ص", "ع", "م", "ن", "هـ", "ي"];
const COLORS = ["#4A3F2F", "#C9A227", "#3B7A57", "#B23A48", "#3A6EA5"];

export default function DrawingCanvas() {
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const [drawing, setDrawing] = useState(false);
  const [color, setColor] = useState("#4A3F2F");
  const [erasing, setErasing] = useState(false);
  const [size, setSize] = useState(8);
  const [target, setTarget] = useState(LETTERS[0]);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const ctx = canvas.getContext("2d");
    ctx.scale(ratio, ratio);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctxRef.current = ctx;
  }, []);

  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    ctx.lineWidth = erasing ? size * 2.2 : size;
    ctx.globalCompositeOperation = erasing ? "destination-out" : "source-over";
    ctx.strokeStyle = color;
  }, [color, size, erasing]);

  const pos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const point = e.touches ? e.touches[0] : e;
    return { x: point.clientX - rect.left, y: point.clientY - rect.top };
  };

  const start = (e) => {
    e.preventDefault();
    setDone(false);
    const { x, y } = pos(e);
    ctxRef.current.beginPath();
    ctxRef.current.moveTo(x, y);
    setDrawing(true);
  };

  const move = (e) => {
    if (!drawing) return;
    e.preventDefault();
    const { x, y } = pos(e);
    ctxRef.current.lineTo(x, y);
    ctxRef.current.stroke();
  };

  const end = () => setDrawing(false);

  const clear = () => {
    const c = canvasRef.current;
    ctxRef.current.clearRect(0, 0, c.width, c.height);
    setDone(false);
  };

  const nextLetter = () => {
    const idx = LETTERS.indexOf(target);
    setTarget(LETTERS[(idx + 1) % LETTERS.length]);
    clear();
  };

  const save = () => {
    const url = canvasRef.current.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `جزيرة-${target}.png`;
    a.click();
  };

  return (
    <div className="glass-strong rounded-3xl p-5">
      {/* Letter selector */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-ink-soft">تدرّب على كتابة الحرف:</p>
          <p className="text-5xl font-extrabold gold-text">{target}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {LETTERS.map((l) => (
            <button
              key={l}
              onClick={() => {
                setTarget(l);
                clear();
              }}
              className={`h-9 w-9 rounded-xl text-lg font-bold transition-colors ${
                target === l ? "bg-gold-gradient text-white shadow-gold" : "bg-white/60 text-ink hover:bg-champagne-100"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Canvas with faint guide letter */}
      <div className="relative">
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="select-none text-[180px] font-extrabold text-champagne-200/50">{target}</span>
        </div>
        <canvas
          ref={canvasRef}
          className="relative h-72 w-full touch-none rounded-2xl bg-white/70"
          style={{ border: "2px dashed rgba(201,168,106,0.5)" }}
          onMouseDown={start}
          onMouseMove={move}
          onMouseUp={end}
          onMouseLeave={end}
          onTouchStart={start}
          onTouchMove={move}
          onTouchEnd={end}
        />
      </div>

      {/* Toolbar */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Palette size={18} className="text-ink-soft" />
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => {
                setErasing(false);
                setColor(c);
              }}
              className={`h-7 w-7 rounded-full transition-transform ${!erasing && color === c ? "scale-110 ring-2 ring-champagne-400 ring-offset-2" : ""}`}
              style={{ background: c }}
              aria-label="لون"
            />
          ))}
          <input
            type="range"
            min="3"
            max="22"
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
            className="ml-2 w-24 accent-champagne-400"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setErasing((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm ${erasing ? "btn-gold" : "btn-ghost"}`}
          >
            <Eraser size={16} /> ممحاة
          </button>
          <button onClick={clear} className="btn-ghost flex items-center gap-1.5 px-3 py-2 text-sm">
            <Trash2 size={16} /> مسح
          </button>
          <button onClick={save} className="btn-ghost flex items-center gap-1.5 px-3 py-2 text-sm">
            <Download size={16} /> حفظ
          </button>
          <button onClick={() => setDone(true)} className="btn-gold flex items-center gap-1.5 px-3 py-2 text-sm">
            <Check size={16} /> تم
          </button>
        </div>
      </div>

      {done && (
        <div className="mt-4 flex items-center justify-between rounded-2xl bg-emerald-50/80 p-3 text-emerald-800" style={{ border: "1px solid rgba(16,124,86,0.25)" }}>
          <span className="font-bold">أحسنت! 🌟 خطٌّ جميل للحرف «{target}».</span>
          <button onClick={nextLetter} className="btn-gold px-4 py-2 text-sm">
            الحرف التالي
          </button>
        </div>
      )}
    </div>
  );
}
