"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpen, Check, Cloud, Flower2, Mic, MicOff, Moon, Mountain, RefreshCw, Star, Sun, Volume2, Waves, X } from "lucide-react";
import Button from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/Progress";
import { cn } from "@/components/ui/cn";
import { useLocale, useT } from "@/i18n/client";

// Read-aloud challenge (elementary "learning games"). The words are Arabic
// reading content in both locales; English mode adds a small gloss.
const WORDS = [
  { id: "sun", word: "شَمس", Icon: Sun },
  { id: "moon", word: "قمر", Icon: Moon },
  { id: "sea", word: "بحر", Icon: Waves },
  { id: "book", word: "كتاب", Icon: BookOpen },
  { id: "rose", word: "وردة", Icon: Flower2 },
  { id: "star", word: "نجمة", Icon: Star },
  { id: "clouds", word: "سحاب", Icon: Cloud },
  { id: "mountain", word: "جبل", Icon: Mountain },
];

// Forgiving comparison: drop diacritics and spaces, unify alef/taa marbuta/yaa forms.
const normalize = (s) =>
  (s || "")
    .replace(/[ً-ْٰـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, "")
    .trim();

export default function ReadingChallenge() {
  const t = useT("stages");
  const { locale } = useLocale();
  const [index, setIndex] = useState(0);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");
  // null | "correct" | "wrong" | "nospeech" | "blocked"
  const [result, setResult] = useState(null);
  const [supported, setSupported] = useState(true);
  const [canSpeak, setCanSpeak] = useState(false);
  const [score, setScore] = useState(0);
  const recRef = useRef(null);

  const current = WORDS[index];

  useEffect(() => {
    setCanSpeak(typeof window !== "undefined" && "speechSynthesis" in window);
  }, []);

  useEffect(() => {
    const SR = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
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
      setHeard(alts[0] || "");
      const ok = alts.some((a) => normalize(a) === normalize(current.word));
      setResult(ok ? "correct" : "wrong");
      if (ok) setScore((s) => s + 1);
    };
    rec.onerror = (e) => {
      setListening(false);
      if (e.error === "aborted") return;
      if (e.error === "not-allowed" || e.error === "service-not-allowed") setResult("blocked");
      else if (e.error === "no-speech") setResult("nospeech");
      else setResult("wrong");
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;

    return () => rec.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const speak = () => {
    if (!canSpeak) return;
    const u = new SpeechSynthesisUtterance(current.word);
    u.lang = "ar-SA";
    u.rate = 0.85;
    const voice = window.speechSynthesis.getVoices().find((v) => v.lang?.toLowerCase().startsWith("ar"));
    if (voice) u.voice = voice;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
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

  const feedback = {
    correct: { tone: "text-green-700", text: t("games.reading.correct") },
    wrong: { tone: "text-danger", text: heard ? `${t("games.reading.wrong")} ${t("games.reading.heard", { heard })}` : t("games.reading.wrong") },
    nospeech: { tone: "text-warning", text: t("games.reading.noSpeech") },
    blocked: { tone: "text-warning", text: t("games.reading.micBlocked") },
  }[result];

  const { Icon } = current;
  const ring = result === "correct" ? "ring-green-500/50" : result === "wrong" ? "ring-danger/40" : "ring-line/10";

  return (
    <div className="surface-flat p-4 sm:p-6">
      {/* Progress + score */}
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="t-caption tabular">{t("games.reading.progress", { current: index + 1, total: WORDS.length })}</p>
          <ProgressBar value={((index + 1) / WORDS.length) * 100} tone="green" size="sm" className="mt-2 max-w-[12rem]" label={t("games.reading.progress", { current: index + 1, total: WORDS.length })} />
        </div>
        <p className="inline-flex h-9 items-center gap-2 rounded-full border border-gold-200/70 bg-gold-50 px-3.5 text-sm text-gold-700">
          {t("games.reading.score")}
          <span className="font-bold tabular">{score}</span>
        </p>
      </div>

      {/* Word card — cream paper, same in both themes */}
      <div key={current.id} className={cn("animate-scale relative mx-auto mt-6 max-w-sm rounded-xl bg-[#F7F0E3] px-6 py-8 text-center ring-2 ring-inset transition-shadow", ring)}>
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#FFFDF9] text-[#A67F38] shadow-xs">
          <Icon size={30} strokeWidth={1.75} aria-hidden="true" />
        </span>
        <p className="sr-only">{t("games.reading.wordLabel")}</p>
        <p lang="ar" dir="rtl" className="mt-4 font-ar text-5xl font-bold leading-snug text-[#3A3024] sm:text-6xl">
          {current.word}
        </p>
        {locale !== "ar" && <p className="mt-1 text-sm text-[#7A5A2B]">{t(`games.reading.words.${current.id}`)}</p>}

        {(result === "correct" || result === "wrong") && (
          <span
            aria-hidden="true"
            className={cn(
              "animate-scale absolute -top-3 end-4 grid h-11 w-11 place-items-center rounded-full text-white shadow-md",
              result === "correct" ? "bg-green-500" : "bg-danger"
            )}
          >
            {result === "correct" ? <Check size={24} /> : <X size={24} />}
          </span>
        )}
      </div>

      {/* Feedback */}
      <div className="mt-4 min-h-[3.25rem] text-center" aria-live="polite">
        {!supported ? (
          <p className="t-small mx-auto flex max-w-md items-start justify-center gap-2 text-ink-3">
            <MicOff size={16} aria-hidden="true" className="mt-1 shrink-0" />
            {t("games.reading.unsupported")}
          </p>
        ) : feedback ? (
          <p className={cn("font-medium", feedback.tone)}>
            <span dir="auto">{feedback.text}</span>
          </p>
        ) : (
          <p className="t-small text-ink-3">{listening ? t("games.reading.listening") : t("games.reading.instruction")}</p>
        )}
      </div>

      {/* Controls */}
      <div className="mt-4 flex flex-col items-stretch justify-center gap-2.5 xs:flex-row xs:flex-wrap xs:items-center">
        <Button variant="secondary" iconStart={Volume2} onClick={speak} disabled={!canSpeak}>
          {t("games.reading.listen")}
        </Button>
        <Button
          variant="primary"
          iconStart={Mic}
          onClick={listen}
          disabled={!supported || listening}
          className={cn("order-first xs:order-none", listening && "animate-[jz-pulse-soft_1.2s_ease-in-out_infinite] disabled:opacity-100")}
        >
          {listening ? t("games.reading.listening") : t("games.reading.speak")}
        </Button>
        <Button variant="ghost" iconStart={RefreshCw} onClick={next}>
          {t("games.reading.next")}
        </Button>
      </div>
    </div>
  );
}
