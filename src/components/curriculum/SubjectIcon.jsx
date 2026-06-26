"use client";

import { useRef } from "react";
import { motion, useReducedMotion, useInView } from "framer-motion";
import {
  Calculator, FlaskConical, Atom, BookOpen, BookMarked, Feather, Languages,
  Microscope, Dna, Globe, Cpu, Code, Palette, Dumbbell, Brain, Briefcase,
  TrendingUp, Scale, DraftingCompass, HeartPulse, ScrollText, Sparkles,
  HeartHandshake, ClipboardList, Accessibility, GraduationCap,
} from "lucide-react";

// Each subject maps to a Lucide glyph + a continuous micro-animation preset.
// Animations are transform/opacity ONLY (GPU-cheap), pause when off-screen, and
// are fully disabled under prefers-reduced-motion. Hover intensifies them.
const MAP = {
  quran: { Icon: BookMarked, motion: "breathe" },
  islamic: { Icon: BookOpen, motion: "flip" },
  arabic: { Icon: Feather, motion: "write" },
  english: { Icon: Languages, motion: "pop" },
  math: { Icon: Calculator, motion: "press" },     // "interacting" calculator
  science: { Icon: Microscope, motion: "bob" },
  physics: { Icon: Atom, motion: "spin" },         // orbiting atom
  chemistry: { Icon: FlaskConical, motion: "bubble" }, // reacting flask
  biology: { Icon: Dna, motion: "spin" },
  social: { Icon: Globe, motion: "spin" },
  digital: { Icon: Cpu, motion: "pulse" },
  cs: { Icon: Code, motion: "press" },
  art: { Icon: Palette, motion: "sway" },
  pe: { Icon: Dumbbell, motion: "lift" },
  critical: { Icon: Brain, motion: "pulse" },
  business: { Icon: Briefcase, motion: "pop" },
  finance: { Icon: TrendingUp, motion: "rise" },
  law: { Icon: Scale, motion: "sway" },
  engineering: { Icon: DraftingCompass, motion: "spin" },
  health: { Icon: HeartPulse, motion: "pulse" },
  hadith: { Icon: ScrollText, motion: "breathe" },
  tawhid: { Icon: Sparkles, motion: "twinkle" },
  life: { Icon: HeartHandshake, motion: "pulse" },
  teacher: { Icon: ClipboardList, motion: "bob" },
  rehab: { Icon: Accessibility, motion: "pulse" },
  grade: { Icon: GraduationCap, motion: "bob" },
  default: { Icon: BookOpen, motion: "breathe" },
};

const LOOP = {
  breathe: { animate: { scale: [1, 1.06, 1] }, transition: { duration: 3.2 } },
  spin: { animate: { rotate: 360 }, transition: { duration: 9, ease: "linear" } },
  bubble: { animate: { y: [0, -2.5, 0], rotate: [0, -4, 4, 0] }, transition: { duration: 2.6 } },
  press: { animate: { y: [0, -2, 0] }, transition: { duration: 1.8 } },
  write: { animate: { rotate: [0, -7, 6, 0] }, transition: { duration: 2.4 } },
  pulse: { animate: { scale: [1, 1.1, 1], opacity: [0.9, 1, 0.9] }, transition: { duration: 2 } },
  bob: { animate: { y: [0, -3, 0] }, transition: { duration: 2.8 } },
  sway: { animate: { rotate: [0, 6, -6, 0] }, transition: { duration: 3 } },
  pop: { animate: { scale: [1, 1.08, 1] }, transition: { duration: 2.2 } },
  lift: { animate: { y: [0, -3, 0], rotate: [0, -3, 0] }, transition: { duration: 2 } },
  rise: { animate: { y: [0, -3, 0] }, transition: { duration: 2 } },
  twinkle: { animate: { scale: [1, 1.15, 1], rotate: [0, 15, 0] }, transition: { duration: 2.4 } },
  flip: { animate: { rotateY: [0, 22, 0] }, transition: { duration: 3 } },
};

export default function SubjectIcon({ icon = "default", size = 26, className = "" }) {
  const reduce = useReducedMotion();
  const ref = useRef(null);
  const inView = useInView(ref, { margin: "0px 0px -10% 0px" });

  const { Icon, motion: m } = MAP[icon] || MAP.default;
  const preset = LOOP[m] || LOOP.breathe;
  const live = !reduce && inView;

  return (
    <motion.span
      ref={ref}
      animate={live ? preset.animate : {}}
      transition={
        live
          ? { ...preset.transition, repeat: Infinity, repeatType: "loop", ease: preset.transition.ease || "easeInOut" }
          : { duration: 0.2 }
      }
      whileHover={reduce ? {} : { scale: 1.18 }}
      style={{ display: "inline-flex", transformStyle: "preserve-3d", willChange: "transform" }}
      className={className}
    >
      <Icon size={size} strokeWidth={1.6} />
    </motion.span>
  );
}
