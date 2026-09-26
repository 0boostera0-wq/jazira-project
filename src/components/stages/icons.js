// Subject icon ids used by the curriculum catalog → lucide glyphs. Kept apart
// from catalog.js so client components can use it without bundling the catalog.

import {
  BookMarked, BookOpen, Feather, Languages, Calculator, Microscope, Atom, FlaskConical,
  Dna, Globe, Cpu, Code, Palette, Dumbbell, Brain, Briefcase, TrendingUp, Scale,
  DraftingCompass, HeartPulse, ScrollText, BookHeart, HeartHandshake, GraduationCap,
  ClipboardList, Accessibility,
} from "lucide-react";

/** Catalog subject icon id → lucide glyph (static, no motion). */
const ICONS = {
  quran: BookMarked,
  islamic: BookOpen,
  arabic: Feather,
  english: Languages,
  math: Calculator,
  science: Microscope,
  physics: Atom,
  chemistry: FlaskConical,
  biology: Dna,
  social: Globe,
  digital: Cpu,
  cs: Code,
  art: Palette,
  pe: Dumbbell,
  critical: Brain,
  business: Briefcase,
  finance: TrendingUp,
  law: Scale,
  engineering: DraftingCompass,
  health: HeartPulse,
  hadith: ScrollText,
  tawhid: BookHeart,
  life: HeartHandshake,
  teacher: ClipboardList,
  rehab: Accessibility,
  grade: GraduationCap,
};
export const subjectIcon = (id) => ICONS[id] || BookOpen;
