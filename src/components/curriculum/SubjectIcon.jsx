import {
  Accessibility, Activity, Atom, Award, BadgeDollarSign, BookHeart, BookMarked, BookOpen, BookOpenText,
  Brain, BrainCircuit, Briefcase, Building2, Calculator, CalendarRange, ChartColumn, ChartPie, ClipboardList,
  Code, Cpu, Database, DraftingCompass, Dumbbell, Earth, Feather, FileSearch, FlaskConical, Gavel,
  Globe, GraduationCap, HandCoins, HeartHandshake, HeartPulse, Landmark, Languages, Leaf, Map as MapIcon,
  Megaphone, Microscope, Mic, Orbit, Palette, PenTool, Quote, Route, Scale, ScrollText, Shapes, ShieldCheck,
  SpellCheck, Stethoscope, TrendingUp, Users, Wallet, Wifi, Wrench,
} from "lucide-react";
import { cn } from "@/components/ui/cn";

// Subject glyphs. Server-safe (no hooks, no motion). The catalog's `icon` field
// (shared with src/components/stages/icons.js) is the fallback; the id map
// gives newer secondary subjects a more specific glyph.
const BY_ID = {
  islamic: BookOpen, quran: BookMarked, tawhid: BookHeart, hadith: ScrollText, tafsir: BookOpenText,
  qiraat: Mic, "quran-sciences": BookMarked, fiqh: Scale, "usul-fiqh": Landmark, "hadith-terminology": ScrollText,
  faraid: HandCoins,
  arabic: Feather, "linguistic-studies": SpellCheck, rhetoric: Quote,
  english: Languages,
  math: Calculator, statistics: ChartPie,
  physics: Atom, "earth-space": Orbit,
  chemistry: FlaskConical,
  science: Microscope, biology: Leaf, environment: Earth, "health-sciences": Stethoscope, healthcare: Stethoscope,
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
};

const BY_ICON = {
  quran: BookMarked, islamic: BookOpen, arabic: Feather, english: Languages, math: Calculator, science: Microscope,
  physics: Atom, chemistry: FlaskConical, biology: Leaf, social: Globe, digital: Cpu, cs: Code, art: Palette,
  pe: Dumbbell, critical: Brain, business: Briefcase, finance: TrendingUp, law: Scale, engineering: DraftingCompass,
  health: HeartPulse, hadith: ScrollText, tawhid: BookHeart, life: HeartHandshake, teacher: ClipboardList,
  rehab: Accessibility, grade: GraduationCap, chart: ChartColumn,
};

/** Lucide glyph for a subject (by id, then by catalog icon id). */
export function subjectGlyph({ id, icon } = {}) {
  return BY_ID[id] || BY_ICON[icon] || BookOpen;
}

/** Bare glyph. */
export default function SubjectIcon({ id, icon, size = 20, className }) {
  const Icon = subjectGlyph({ id, icon });
  return <Icon size={size} aria-hidden="true" className={className} />;
}

const TILE = {
  xs: ["h-7 w-7 rounded-sm", 14],
  sm: ["h-8 w-8 rounded-sm", 16],
  md: ["h-11 w-11 rounded-md", 20],
  lg: ["h-14 w-14 rounded-lg", 26],
};

/**
 * Subject colour tile. The subject colour is a CSS variable; the tint and the
 * glyph colour are mixed per theme so contrast holds in light and dark mode.
 */
export function SubjectTile({ subject, size = "md", className }) {
  const [box, px] = TILE[size] || TILE.md;
  const Icon = subjectGlyph(subject || {});
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-grid shrink-0 place-items-center ring-1 ring-inset",
        "bg-[color-mix(in_srgb,var(--subj)_11%,transparent)] text-[color:var(--subj)] ring-[color:color-mix(in_srgb,var(--subj)_22%,transparent)]",
        "dark:bg-[color-mix(in_srgb,var(--subj)_24%,transparent)] dark:text-[color:color-mix(in_srgb,var(--subj)_45%,white)] dark:ring-[color:color-mix(in_srgb,var(--subj)_40%,transparent)]",
        box,
        className
      )}
      style={{ "--subj": subject?.color || "#9A722C" }}
    >
      <Icon size={px} />
    </span>
  );
}
