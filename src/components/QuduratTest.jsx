"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Timer, Lock, Award, RotateCcw, ChevronLeft, ShieldCheck, Crown } from "lucide-react";
import { generateTest } from "@/lib/questions";
import { QUDURAT_SECONDS_PER_QUESTION, QUDURAT_QUESTIONS_PER_TEST } from "@/lib/constants";
import { useApp } from "@/context/AppContext";

const STAGES = { intro: "intro", running: "running", result: "result", locked: "locked" };

export default function QuduratTest({ section = "qudurat", title = "اختبار القدرات" }) {
  const { hasPremiumAccess, freeTrialUsed, markFreeTrialUsed, addXp } = useApp();
  const [stage, setStage] = useState(STAGES.intro);
  const [questions, setQuestions] = useState([]);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [seconds, setSeconds] = useState(QUDURAT_SECONDS_PER_QUESTION);
  const [score, setScore] = useState(0);
  const tickRef = useRef(null);

  const canPlay = hasPremiumAccess || !freeTrialUsed;

  const finish = useCallback(
    (finalAnswers) => {
      clearInterval(tickRef.current);
      const correct = finalAnswers.filter((a) => a.correct).length;
      setScore(correct);
      const earned = correct * 10;
      addXp(earned);
      setStage(STAGES.result);
    },
    [addXp]
  );

  // Advance to next question (or finish). Records the answer for current Q.
  const advance = useCallback(
    (choiceIndex) => {
      clearInterval(tickRef.current);
      const q = questions[current];
      const isCorrect = choiceIndex === q.answerIndex;
      const record = {
        id: q.id,
        choice: choiceIndex,
        correct: isCorrect,
        timedOut: choiceIndex === null,
      };
      const nextAnswers = [...answers, record];
      setAnswers(nextAnswers);
      setSelected(null);

      if (current + 1 >= questions.length) {
        finish(nextAnswers);
      } else {
        setCurrent((c) => c + 1);
        setSeconds(QUDURAT_SECONDS_PER_QUESTION);
      }
    },
    [answers, current, questions, finish]
  );

  // Anti-cheat countdown — auto-submits (as timeout) when it hits zero.
  useEffect(() => {
    if (stage !== STAGES.running) return;
    setSeconds(QUDURAT_SECONDS_PER_QUESTION);
    tickRef.current = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          clearInterval(tickRef.current);
          advance(null); // time ran out -> auto submit
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(tickRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, current]);

  const begin = () => {
    if (!canPlay) {
      setStage(STAGES.locked);
      return;
    }
    if (!hasPremiumAccess) markFreeTrialUsed(); // consume the single free trial
    setQuestions(generateTest(section, QUDURAT_QUESTIONS_PER_TEST));
    setAnswers([]);
    setCurrent(0);
    setScore(0);
    setSelected(null);
    setStage(STAGES.running);
  };

  const choose = (i) => {
    if (selected !== null) return;
    setSelected(i);
    setTimeout(() => advance(i), 450); // brief pause to show selection
  };

  // ---------- LOCKED (paywall) ----------
  if (stage === STAGES.locked || (stage === STAGES.intro && !canPlay)) {
    return (
      <div className="glass-strong rounded-3xl p-8 text-center">
        <span className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-gold-gradient text-white shadow-gold">
          <Lock size={30} />
        </span>
        <h3 className="text-xl font-extrabold text-ink">انتهت تجربتك المجانية</h3>
        <p className="mx-auto mt-2 max-w-md text-sm text-ink-soft">
          لقد استخدمت اختبارك المجاني الوحيد. للوصول غير المحدود لجميع اختبارات القدرات
          والتحصيلي، اشترك في <b>باقة النخبة</b> أو ادعُ ٥ أصدقاء عبر رابطك الخاص.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/subscriptions" className="btn-gold flex items-center gap-2">
            <Crown size={18} /> اشترك بباقة النخبة (19 ريال)
          </Link>
          <Link href="/subscriptions" className="btn-ghost">
            ادعُ أصدقاءك مجانًا
          </Link>
        </div>
      </div>
    );
  }

  // ---------- INTRO ----------
  if (stage === STAGES.intro) {
    return (
      <div className="glass-strong rounded-3xl p-8">
        <div className="flex flex-col items-center text-center">
          <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-gold-gradient text-white shadow-gold">
            <Award size={30} />
          </span>
          <h3 className="text-2xl font-extrabold text-ink">{title}</h3>
          <p className="mt-2 max-w-lg text-sm text-ink-soft">
            اختبار محاكٍ بأسئلة عشوائية تُسحب من بنك أسئلة آمن لمنع الغش. لكل سؤال
            <b className="mx-1 text-gold-dark">{QUDURAT_SECONDS_PER_QUESTION} ثانية</b>
            فقط، ويُرسل تلقائيًا عند انتهاء الوقت.
          </p>

          <div className="mt-5 grid w-full max-w-lg grid-cols-3 gap-3">
            {[
              { n: QUDURAT_QUESTIONS_PER_TEST, l: "سؤال" },
              { n: QUDURAT_SECONDS_PER_QUESTION + "s", l: "لكل سؤال" },
              { n: "+10", l: "XP لكل إجابة صحيحة" },
            ].map((s) => (
              <div key={s.l} className="rounded-2xl bg-white/60 p-3 text-center">
                <p className="text-xl font-extrabold gold-text ltr-nums">{s.n}</p>
                <p className="text-xs text-ink-soft">{s.l}</p>
              </div>
            ))}
          </div>

          {!hasPremiumAccess && !freeTrialUsed && (
            <p className="mt-4 flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-bold text-emerald-700">
              <ShieldCheck size={16} /> اختبارك التجريبي المجاني متاح الآن
            </p>
          )}

          <button onClick={begin} className="btn-gold mt-6 px-8 text-lg">
            ابدأ الاختبار
          </button>
        </div>
      </div>
    );
  }

  // ---------- RESULT ----------
  if (stage === STAGES.result) {
    const total = questions.length;
    const pct = Math.round((score / total) * 100);
    return (
      <div className="glass-strong rounded-3xl p-8 text-center">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-gold-gradient text-white shadow-gold">
          <span className="text-2xl font-extrabold ltr-nums">{pct}%</span>
        </motion.div>
        <h3 className="text-xl font-extrabold text-ink">اكتمل الاختبار بنزاهة ✅</h3>
        <p className="mt-1 text-ink-soft">
          أجبت بشكل صحيح على <b className="text-gold-dark ltr-nums">{score}</b> من{" "}
          <b className="ltr-nums">{total}</b> — كسبت{" "}
          <b className="text-gold-dark ltr-nums">{score * 10} XP</b>
        </p>

        {/* Review */}
        <div className="mt-6 space-y-2 text-right">
          {questions.map((q, i) => {
            const a = answers[i];
            return (
              <div key={q.id} className="rounded-2xl bg-white/60 p-3" style={{ border: "1px solid rgba(201,168,106,0.25)" }}>
                <p className="text-sm font-bold text-ink">{i + 1}. {q.text}</p>
                <p className={`mt-1 text-sm ${a?.correct ? "text-emerald-700" : "text-rose-700"}`}>
                  {a?.timedOut ? "⏱️ انتهى الوقت — " : a?.correct ? "✓ صحيحة — " : "✗ خاطئة — "}
                  الإجابة الصحيحة: <b>{q.options[q.answerIndex]}</b>
                </p>
                <p className="mt-1 text-xs text-ink-muted">{q.explanation}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button onClick={() => setStage(STAGES.intro)} className="btn-gold flex items-center gap-2">
            <RotateCcw size={18} /> اختبار جديد
          </button>
          <Link href="/competitions" className="btn-ghost flex items-center gap-2">
            لوحة المتصدرين <ChevronLeft size={18} />
          </Link>
        </div>
      </div>
    );
  }

  // ---------- RUNNING ----------
  const q = questions[current];
  const pctTime = (seconds / QUDURAT_SECONDS_PER_QUESTION) * 100;
  const danger = seconds <= 10;

  return (
    <div className="glass-strong rounded-3xl p-6">
      {/* Progress + timer */}
      <div className="mb-5 flex items-center justify-between gap-4">
        <span className="text-sm font-bold text-ink-soft">
          السؤال {current + 1} / {questions.length}
        </span>
        <div className="flex items-center gap-2">
          <Timer size={18} className={danger ? "text-rose-600" : "text-champagne-500"} />
          <span className={`ltr-nums text-lg font-extrabold ${danger ? "text-rose-600" : "text-ink"}`}>
            {seconds}s
          </span>
        </div>
      </div>

      {/* Timer bar */}
      <div className="mb-6 h-2 w-full overflow-hidden rounded-full bg-white/60">
        <motion.div
          animate={{ width: `${pctTime}%` }}
          transition={{ ease: "linear", duration: 0.4 }}
          className={`h-full rounded-full ${danger ? "bg-rose-500" : "bg-gold-gradient"}`}
        />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={q.id}
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -30 }}
        >
          <span className="inline-block rounded-full bg-champagne-100 px-3 py-1 text-xs font-bold text-gold-dark">
            {q.category}
          </span>
          <h3 className="mt-3 text-xl font-extrabold leading-relaxed text-ink">{q.text}</h3>

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {q.options.map((opt, i) => {
              const isSel = selected === i;
              return (
                <button
                  key={i}
                  onClick={() => choose(i)}
                  disabled={selected !== null}
                  className={`rounded-2xl px-4 py-4 text-right text-lg font-semibold transition-all ${
                    isSel
                      ? "bg-gold-gradient text-white shadow-gold"
                      : "bg-white/70 text-ink hover:bg-champagne-100"
                  }`}
                  style={{ border: "1px solid rgba(201,168,106,0.3)" }}
                >
                  <span className="ml-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-champagne-200 text-sm font-bold text-ink">
                    {["أ", "ب", "ج", "د"][i]}
                  </span>
                  {opt}
                </button>
              );
            })}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
