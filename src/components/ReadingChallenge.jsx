"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, Volume2, RefreshCw, Check, X, MicOff } from "lucide-react";

const WORDS = [
  { word: "شَمس", emoji: "☀️" },
  { word: "قمر", emoji: "🌙" },
  { word: "بحر", emoji: "🌊" },
  { word: "كتاب", emoji: "📖" },
  { word: "وردة", emoji: "🌹" },
  { word: "نجمة", emoji: "⭐" },
  { word: "سحاب", emoji: "☁️" },
  { word: "جبل", emoji: "⛰️" },
];

// Strip Arabic diacritics for a forgiving comparison.
const normalize = (s) =>
  (s || "")
    .replace(/[ً-ْٰ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/\s+/g, "")
    .trim();

export default function ReadingChallenge() {
  const [index, setIndex] = useState(0);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");
  const [result, setResult] = useState(null); // "correct" | "wrong" | null
  const [supported, setSupported] = useState(true);
  const [score, setScore] = useState(0);
  const recRef = useRef(null);

  const current = WORDS[index];

  useEffect(() => {
    const SR =
      typeof window !== "undefined" &&
      (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (!SR) {
      setSupported(false);
      return;
    }
    const rec = new SR();
    rec.lang = "ar-SA";
    rec.interimResults = false;
    rec.maxAlternatives = 3;

    rec.onresult = (e) => {
      const alts = Array.from(e.results[0]).map((r) => r.transcript);
      setHeard(alts[0]);
      const ok = alts.some((a) => normalize(a) === normalize(current.word));
      setResult(ok ? "correct" : "wrong");
      if (ok) setScore((s) => s + 1);
    };
    rec.onerror = () => {
      setListening(false);
      setResult("wrong");
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;

    return () => rec.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const speak = () => {
    if (!("speechSynthesis" in window)) return;
    const u = new SpeechSynthesisUtterance(current.word);
    u.lang = "ar-SA";
    u.rate = 0.85;
    speechSynthesis.speak(u);
  };

  const listen = () => {
    if (!supported || !recRef.current) return;
    setHeard("");
    setResult(null);
    try {
      recRef.current.start();
      setListening(true);
    } catch {
      /* already started */
    }
  };

  const next = () => {
    setIndex((i) => (i + 1) % WORDS.length);
    setHeard("");
    setResult(null);
  };

  return (
    <div className="glass-strong rounded-3xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm font-semibold text-ink-soft">
          النتيجة: <span className="font-extrabold text-gold-dark">{score}</span>
        </p>
        <p className="text-sm text-ink-muted">
          كلمة {index + 1} من {WORDS.length}
        </p>
      </div>

      {/* Word card */}
      <motion.div
        key={current.word}
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="relative mx-auto flex max-w-sm flex-col items-center rounded-3xl bg-white/60 p-8"
        style={{
          border: `2px solid ${
            result === "correct"
              ? "rgba(16,124,86,0.5)"
              : result === "wrong"
              ? "rgba(178,58,72,0.5)"
              : "rgba(201,168,106,0.4)"
          }`,
        }}
      >
        <span className="text-6xl">{current.emoji}</span>
        <span className="mt-3 text-5xl font-extrabold text-ink">{current.word}</span>

        <AnimatePresence>
          {result && (
            <motion.div
              initial={{ scale: 0, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0 }}
              className={`absolute -top-4 -left-4 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg ${
                result === "correct" ? "bg-emerald-500" : "bg-rose-500"
              }`}
            >
              {result === "correct" ? <Check size={30} /> : <X size={30} />}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Feedback text */}
      <div className="mt-4 text-center">
        {result === "correct" && <p className="font-bold text-emerald-700">رائع! نطقٌ صحيح 🎉</p>}
        {result === "wrong" && (
          <p className="font-bold text-rose-700">
            حاول مرّة أخرى{heard ? ` — سمعتُ: «${heard}»` : ""} 💪
          </p>
        )}
        {!result && supported && <p className="text-sm text-ink-soft">اضغط على الميكروفون ثم انطق الكلمة بوضوح</p>}
        {!supported && (
          <p className="flex items-center justify-center gap-1.5 text-sm text-rose-700">
            <MicOff size={16} /> متصفّحك لا يدعم التعرّف على الصوت. استخدم متصفح Chrome.
          </p>
        )}
      </div>

      {/* Controls */}
      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
        <button onClick={speak} className="btn-ghost flex items-center gap-2">
          <Volume2 size={18} /> استمع للنطق
        </button>
        <motion.button
          onClick={listen}
          disabled={!supported || listening}
          animate={listening ? { scale: [1, 1.08, 1] } : {}}
          transition={{ duration: 0.8, repeat: listening ? Infinity : 0 }}
          className="btn-gold flex items-center gap-2 disabled:opacity-60"
        >
          <Mic size={18} /> {listening ? "يستمع الآن..." : "تحدّث الآن"}
        </motion.button>
        <button onClick={next} className="btn-ghost flex items-center gap-2">
          <RefreshCw size={18} /> كلمة جديدة
        </button>
      </div>
    </div>
  );
}
