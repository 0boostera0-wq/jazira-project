import Link from "next/link";
import { GraduationCap, Bot, Users, LineChart, ShieldCheck, Clock, Sparkles } from "lucide-react";
import BrandLogo from "@/components/BrandLogo";
import { Float } from "@/components/motion/Reveal";

const VALUES = [
  { Icon: GraduationCap, t: "مسارات دراسية متكاملة", d: "محتوى متدرّج لكل مرحلة ومادة." },
  { Icon: Bot, t: "مساعد ذكي على مدار الساعة", d: "يشرح ويراجع ويجيب متى احتجت." },
  { Icon: Users, t: "مجتمع تعليمي ملهم", d: "تعلّم وتفاعل مع زملاء يشاركونك الهدف." },
  { Icon: LineChart, t: "تتبّع تقدّمك بدقّة", d: "نقاط خبرة وسلسلة يومية وإنجازات." },
];

// Full-screen split auth layout. Form on the reading side · a rich educational
// panel fills the rest so the page never feels empty. Panel hides on mobile.
export default function AuthShell({ title, subtitle, children, footer }) {
  return (
    <main className="grid min-h-screen bg-cream-gradient lg:grid-cols-[1.05fr_.95fr]">
      {/* form side */}
      <div className="relative flex flex-col items-center justify-center overflow-hidden px-5 py-10 sm:px-10">
        <div aria-hidden className="pointer-events-none absolute -top-24 right-0 h-72 w-72 rounded-full opacity-50 blur-3xl lg:hidden" style={{ background: "radial-gradient(circle, rgba(201,162,39,0.16), transparent 65%)" }} />
        <Link href="/" className="relative mb-8"><BrandLogo size="lg" /></Link>
        <div className="relative w-full max-w-md">
          <div className="bezel"><div className="bezel-core glass-strong p-7 sm:p-8">
            <h1 className="text-2xl font-extrabold text-ink">{title}</h1>
            {subtitle && <p className="mt-1.5 text-sm text-ink-soft">{subtitle}</p>}
            <div className="mt-6">{children}</div>
          </div></div>
          {footer && <div className="mt-6 text-center text-xs text-ink-soft">{footer}</div>}
        </div>
      </div>

      {/* educational panel */}
      <aside className="relative hidden flex-col justify-between overflow-hidden p-12 lg:flex">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, rgba(201,162,39,0.12), rgba(255,253,249,0.5) 55%, rgba(245,235,217,0.7))" }} />
          <div className="absolute -right-24 top-16 h-80 w-80 rounded-full opacity-60 blur-3xl" style={{ background: "radial-gradient(circle, rgba(201,162,39,0.22), transparent 65%)" }} />
          <div className="absolute -left-28 bottom-10 h-96 w-96 rounded-full opacity-50 blur-3xl" style={{ background: "radial-gradient(circle, rgba(124,154,106,0.16), transparent 65%)" }} />
          <Float amount={16} duration={9} className="absolute left-16 top-24"><div className="h-24 w-24 rounded-[2rem] bg-white/30 backdrop-blur-sm" /></Float>
          <Float amount={12} duration={7} delay={0.8} className="absolute right-24 bottom-28"><div className="h-16 w-16 rounded-2xl bg-gold/15 backdrop-blur-sm" /></Float>
        </div>

        <div className="relative">
          <span className="eyebrow"><Sparkles size={13} /> منصة جزيرة التعليمية</span>
          <h2 className="mt-5 max-w-sm text-3xl font-extrabold leading-tight text-ink">تعلّم بذكاء وحقّق أهدافك بثقة</h2>
          <p className="mt-3 max-w-sm leading-relaxed text-ink-soft">بيئة تعليمية فاخرة تجمع المحتوى والمساعد الذكي والمجتمع في مكان واحد.</p>
        </div>

        <div className="relative grid max-w-md gap-3">
          {VALUES.map((v) => (
            <div key={v.t} className="flex items-center gap-3.5 rounded-2xl bg-white/45 p-3.5 backdrop-blur-sm" style={{ border: "1px solid rgba(201,168,106,0.25)" }}>
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gold-gradient text-white shadow-gold"><v.Icon size={20} strokeWidth={1.6} /></span>
              <div><p className="font-extrabold text-ink">{v.t}</p><p className="text-sm text-ink-soft">{v.d}</p></div>
            </div>
          ))}
        </div>

        <div className="relative flex flex-wrap gap-2 text-xs font-semibold text-ink-soft">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/50 px-3 py-1.5"><ShieldCheck size={13} className="text-gold" /> محتوى موثوق</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/50 px-3 py-1.5"><Clock size={13} className="text-gold" /> متاح ٢٤/٧</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/50 px-3 py-1.5"><Users size={13} className="text-gold" /> بيئة آمنة</span>
        </div>
      </aside>
    </main>
  );
}
