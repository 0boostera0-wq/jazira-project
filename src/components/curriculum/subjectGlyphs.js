// ============================================================================
// Subject → lucide glyph. The ONE map for the whole app: curriculum tiles,
// stage pages (stages/icons.js), exam sections (exams/labels.js) and search
// all resolve subject icons here, so a subject looks the same everywhere
// (biology is a DNA helix on /curriculum, /high-school and /exams alike).
// Pure data + lookup, server- and client-safe.
//
//   BY_ID    subject / section ids (curriculum subject ids, exam sections)
//   BY_ICON  the catalog's shared icon ids (src/lib/curriculum.js `icon`)
// A key present in both maps has the same glyph in both.
// ============================================================================

import {
  Accessibility, Activity, Atom, Award, BadgeDollarSign, BookHeart, BookMarked, BookOpen, BookOpenText,
  Brain, BrainCircuit, Briefcase, Building2, Calculator, CalendarRange, ChartColumn, ChartPie, ClipboardList,
  Code, Cpu, Database, DraftingCompass, Dna, Dumbbell, Earth, Feather, FileSearch, FlaskConical, Gavel,
  Globe, GraduationCap, HandCoins, HeartHandshake, HeartPulse, Landmark, Languages, Map as MapIcon,
  Megaphone, Microscope, Mic, Orbit, Palette, PenTool, Quote, Route, Scale, ScrollText, Shapes, ShieldCheck,
  Sigma, SpellCheck, Stethoscope, TrendingUp, Users, Wallet, Wifi, Wrench,
} from "lucide-react";

const BY_ID = {
  islamic: BookOpen, quran: BookMarked, tawhid: BookHeart, hadith: ScrollText, tafsir: BookOpenText,
  qiraat: Mic, "quran-sciences": BookMarked, fiqh: Scale, "usul-fiqh": Landmark, "hadith-terminology": ScrollText,
  faraid: HandCoins,
  arabic: Feather, "linguistic-studies": SpellCheck, rhetoric: Quote,
  english: Languages,
  math: Calculator, statistics: ChartPie,
  physics: Atom, "earth-space": Orbit,
  chemistry: FlaskConical,
  science: Microscope, biology: Dna, environment: Earth, "health-sciences": Stethoscope, healthcare: Stethoscope,
  "body-systems": HeartPulse,
  social: Globe, history: Landmark, geography: MapIcon, "psych-social": Users,
  digital: Cpu, "digital-citizenship": ShieldCheck, "data-science": Database, iot: Wifi, ai: BrainCircuit,
  cybersecurity: ShieldCheck, "software-engineering": Code, engineering: DraftingCompass, "engineering-design": PenTool,
  art: Palette, arts: Palette,
  pe: Dumbbell, fitness: Activity,
  life: HeartHandshake, critical: Brain, vocational: Wrench, "financial-literacy": Wallet, research: FileSearch,
  "decision-making": Route, "intro-business": Briefcase, economics: TrendingUp, finance: BadgeDollarSign,
  management: Building2, events: CalendarRange, marketing: Megaphone, secretarial: ClipboardList,
  law: Gavel, "law-applications": Gavel,
  capstone: Award, elective: Shapes,
  // Qudurat sections (Tahsili sections are the school subjects above)
  quantitative: Sigma, verbal: BookOpenText,
};

const BY_ICON = {
  quran: BookMarked, islamic: BookOpen, arabic: Feather, english: Languages, math: Calculator, science: Microscope,
  physics: Atom, chemistry: FlaskConical, biology: Dna, social: Globe, digital: Cpu, cs: Code, art: Palette,
  pe: Dumbbell, critical: Brain, business: Briefcase, finance: BadgeDollarSign, law: Gavel, engineering: DraftingCompass,
  health: HeartPulse, hadith: ScrollText, tawhid: BookHeart, life: HeartHandshake, teacher: ClipboardList,
  rehab: Accessibility, grade: GraduationCap, chart: ChartColumn,
};

/** Lucide glyph for a subject: by id, then by catalog icon id, else a book. */
export function subjectGlyph({ id, icon } = {}) {
  return BY_ID[id] || BY_ICON[icon] || BookOpen;
}
