"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion, useMotionValue, useSpring } from "framer-motion";
import {
  GraduationCap, Sparkles, Users, Trophy, BookOpen, Bot, Calendar, BarChart3,
  ShieldCheck, Crown, Flame, Star, Clock, Compass, Layers, Rocket, ArrowLeft,
  Check, LineChart, Lightbulb, MessageSquareQuote, ChevronDown, Target, Zap,
  Library, Accessibility,
} from "lucide-react";
import { Reveal, Stagger, StaggerItem, Float, EASE } from "@/components/motion/Reveal";
import Illustration from "@/components/Illustration";
import HeroStats from "@/components/HeroStats";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { ELITE, PRIZES } from "@/lib/constants";
import { ACADEMIC_YEAR } from "@/lib/curriculum";

/* ── tiny premium primitives ─────────────────────────────────────────── */
function Eyebrow({ children }) {
  return <span className="eyebrow">{children}</span>;
}
function CTAPrimary({ href, children }) {
  return (
    <Link href={href} className="cta-lux">
      <span>{children}</span>
      <span className="cta-puck"><ArrowLeft size={16} strokeWidth={2} /></span>
    </Link>
  );
}
function Bullet({ children }) {
  return (
    <li className="flex items-start gap-2.5 text-ink-soft">
      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-gold-gradient text-white">
        <Check size={12} strokeWidth={3} />
      </span>
      <span className="leading-relaxed">{children}</span>
    </li>
  );
}
function Section({ id, className = "", children, cv = true }) {
  return (
    <section id={id} className={`relative mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-10 ${cv ? "cv-auto" : ""} ${className}`}>
      {children}
    </section>
  );
}
function FeatureCard({ icon: Icon, title, desc, href, className = "" }) {
  return (
    <Link
      href={href}
      className={`group block bezel transition-transform duration-500 hover:-translate-y-1.5 ${className}`}
      style={{ transitionTimingFunction: "cubic-bezier(0.32,0.72,0,1)" }}
    >
      <div className="bezel-core glass h-full p-6">
        <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-gradient text-white shadow-gold">
          <Icon size={22} strokeWidth={1.5} />
        </span>
        <h3 className="text-lg font-extrabold text-ink">{title}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{desc}</p>
        <span className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-gold opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          اكتشف <ArrowLeft size={14} />
        </span>
      </div>
    </Link>
  );
}

/* ── page ────────────────────────────────────────────────────────────── */
export default function Landing() {
  // Hero mouse-parallax (spring-smoothed, transform-only)
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 60, damping: 18 });
  const sy = useSpring(my, { stiffness: 60, damping: 18 });
  // Only run the parallax on a fine pointer + wide screen + motion allowed.
  // Skips the per-mousemove spring work on touch and low-end devices.
  const [parallaxOn, setParallaxOn] = useState(false);
  useEffect(() => {
    try {
      const ok = window.matchMedia("(pointer: fine)").matches
        && window.matchMedia("(min-width: 768px)").matches
        && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      setParallaxOn(ok);
    } catch {}
  }, []);
  const onHeroMove = (e) => {
    if (!parallaxOn) return;
    const r = e.currentTarget.getBoundingClientRect();
    mx.set(((e.clientX - r.left) / r.width - 0.5) * 20);
    my.set(((e.clientY - r.top) / r.height - 0.5) * 20);
  };
  const onHeroLeave = () => { if (!parallaxOn) return; mx.set(0); my.set(0); };

  return (
    <div className="relative overflow-x-clip">
      <div className="lux-grain" aria-hidden />
      <SiteHeader />

      {/* ambient gold orbs */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[120vh] overflow-hidden">
        <div className="absolute -right-32 top-10 h-[34rem] w-[34rem] rounded-full opacity-60 blur-3xl" style={{ background: "radial-gradient(circle, rgba(201,162,39,0.16), transparent 65%)" }} />
        <div className="absolute -left-40 top-72 h-[30rem] w-[30rem] rounded-full opacity-50 blur-3xl" style={{ background: "radial-gradient(circle, rgba(201,168,106,0.14), transparent 65%)" }} />
      </div>

      {/* Primary landmark — every page needs exactly one <main> */}
      <main id="main">

      {/* ════════ HERO ════════ */}
      <Section id="top" cv={false} className="!pt-36 sm:!pt-44">
        <div className="grid items-center gap-12 md:grid-cols-2">
          <div>
            <Reveal><Eyebrow>منصة جزيرة التعليمية <Sparkles size={13} /></Eyebrow></Reveal>
            <Reveal delay={0.06}>
              <h1 className="mt-5 text-4xl font-extrabold leading-[1.15] text-ink sm:text-6xl">
                رحلتك التعليمية
                <br />
                <span className="gold-text">مستقبلك المشرق</span>
              </h1>
            </Reveal>
            <Reveal delay={0.12}>
              <p className="mt-5 max-w-md text-lg leading-relaxed text-ink-soft">
                نرافقك خطوة بخطوة لتتعلّم بذكاء وتطوّر مهاراتك وتحقّق أهدافك بثقة — بمسارات متكاملة ومساعد ذكي فاخر يعمل لأجلك على مدار الساعة.
              </p>
            </Reveal>
            <Reveal delay={0.18}>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <CTAPrimary href="/dashboard">ابدأ الآن</CTAPrimary>
                <Link href="/sign-in" className="cta-ghost">تسجيل الدخول</Link>
              </div>
            </Reveal>
            <Reveal delay={0.24}>
              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-muted">
                <span className="flex items-center gap-1.5"><Check size={15} className="text-gold" /> تعلّم بذكاء</span>
                <span className="flex items-center gap-1.5"><Clock size={15} className="text-gold" /> متاح ٢٤/٧</span>
                <span className="flex items-center gap-1.5"><ShieldCheck size={15} className="text-gold" /> محتوى موثوق</span>
              </div>
            </Reveal>
          </div>

          {/* Illustration + floating Z-cascade cards */}
          <div className="relative" onMouseMove={onHeroMove} onMouseLeave={onHeroLeave}>
            <motion.div style={{ x: sx, y: sy }}>
              <Illustration name="hero-main.png" icon={Compass} alt="رحلتك التعليمية مع منصة جزيرة" ratio="1 / 1" priority sizes="(max-width: 768px) 92vw, 40vw" />
            </motion.div>

            <HeroStats />
          </div>
        </div>

        {/* scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }}
          className="mt-16 flex justify-center"
        >
          <motion.div animate={{ y: [0, 8, 0] }} transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }} className="text-ink-muted">
            <ChevronDown size={26} strokeWidth={1.5} />
          </motion.div>
        </motion.div>
      </Section>

      {/* ════════ TRUST BAND ════════ */}
      <Section id="features" className="!py-12">
        <Reveal>
          <div className="bezel">
            <div className="bezel-core glass grid grid-cols-2 gap-6 px-6 py-7 sm:grid-cols-4">
              {[
                { icon: Lightbulb, t: "تعلّم بذكاء", s: "حفظ وفهم أسرع" },
                { icon: Clock, t: "في أي وقت", s: "٢٤/٧ بلا توقف" },
                { icon: ShieldCheck, t: "محتوى موثوق", s: "من مصادر معتمدة" },
                { icon: LineChart, t: "تقدّم مستمر", s: "تابع تطوّرك" },
              ].map((x) => (
                <div key={x.t} className="flex items-center gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/60 text-gold"><x.icon size={20} strokeWidth={1.5} /></span>
                  <div><p className="font-extrabold text-ink">{x.t}</p><p className="text-xs text-ink-soft">{x.s}</p></div>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </Section>

      {/* ════════ AI ASSISTANT ════════ */}
      <Section id="ai">
        <div className="grid items-center gap-12 md:grid-cols-2">
          <Reveal className="order-2 md:order-1">
            <Illustration name="ai-assistant.png" icon={Bot} alt="المساعد الذكي" ratio="3 / 2" />
          </Reveal>
          <div className="order-1 md:order-2">
            <Reveal><Eyebrow>المساعد الذكي <Bot size={13} /></Eyebrow></Reveal>
            <Reveal delay={0.06}><h2 className="mt-5 text-3xl font-extrabold leading-tight text-ink sm:text-5xl">مرشدك التعليمي الذي لا ينام</h2></Reveal>
            <Reveal delay={0.12}><p className="mt-4 text-lg leading-relaxed text-ink-soft">مساعد فاخر بتقنية Gemini يشرح ويلخّص ويختبرك ويبني لك خطة — بالعربية الفصحى وبأسلوب راقٍ يناسب كل مرحلة.</p></Reveal>
            <Stagger className="mt-6 grid gap-3 sm:grid-cols-2">
              {["تدريس ذكي خطوة بخطوة", "إرشاد شخصي لكل طالب", "حلّ الواجبات والتمارين", "الاستعداد للاختبارات", "توصيات تعليمية مخصّصة", "متاح ٢٤ ساعة دون انتظار"].map((f) => (
                <StaggerItem key={f}><ul><Bullet>{f}</Bullet></ul></StaggerItem>
              ))}
            </Stagger>
            <Reveal delay={0.1}><div className="mt-7"><CTAPrimary href="/dashboard">جرّب المساعد الآن</CTAPrimary></div></Reveal>
          </div>
        </div>
      </Section>

      {/* ════════ LEARNING PATHS ════════ */}
      <Section id="paths">
        <Reveal className="mx-auto mb-12 max-w-2xl text-center">
          <Eyebrow>المناهج والمصادر</Eyebrow>
          <h2 className="mt-5 text-3xl font-extrabold text-ink sm:text-5xl">مكتبة تعليمية لكل مرحلة</h2>
          <p className="mt-4 text-lg text-ink-soft">كتب الطالب والنشاط ونماذج الاختبارات لكل مادة وفصل دراسي — للعام {ACADEMIC_YEAR}.</p>
        </Reveal>
        <Stagger className="grid gap-5 md:grid-cols-3">
          <StaggerItem><FeatureCard icon={BookOpen} href="/curriculum/elementary" title="المرحلة الابتدائية" desc="الصفوف من الأول إلى السادس — جميع المواد ومصادرها." /></StaggerItem>
          <StaggerItem><FeatureCard icon={Layers} href="/curriculum/middle" title="المرحلة المتوسطة" desc="الصفوف من الأول إلى الثالث بمحتوى متدرّج منظّم." /></StaggerItem>
          <StaggerItem><FeatureCard icon={GraduationCap} href="/curriculum/high-school" title="المرحلة الثانوية" desc="السنة الأولى المشتركة وخمسة مسارات تخصّصية." /></StaggerItem>
          <StaggerItem><FeatureCard icon={Compass} href="/curriculum/continuing" title="التعليم المستمر" desc="مسار مرن لمواصلة التعلّم في كل الأعمار." /></StaggerItem>
          <StaggerItem><FeatureCard icon={Accessibility} href="/curriculum/special" title="التربية الخاصة" desc="برامج وأدلة داعمة ومتخصّصة لكل احتياج." /></StaggerItem>
          <StaggerItem><FeatureCard icon={Library} href="/curriculum" title="كل المراحل والمصادر" desc="تصفّح المكتبة التعليمية كاملة في مكان واحد." /></StaggerItem>
        </Stagger>
      </Section>

      {/* ════════ APTITUDE TESTS ════════ */}
      <Section>
        <div className="grid items-center gap-12 md:grid-cols-2">
          <div>
            <Reveal><Eyebrow>القدرات والتحصيلي</Eyebrow></Reveal>
            <Reveal delay={0.06}><h2 className="mt-5 text-3xl font-extrabold leading-tight text-ink sm:text-5xl">اختبارات تحاكي الواقع</h2></Reveal>
            <Reveal delay={0.12}><p className="mt-4 text-lg leading-relaxed text-ink-soft">محرّك أسئلة عشوائية بمؤقّت صارم وتحليل فوري لنقاط القوة والضعف — تدرّب كأنك في القاعة تماماً.</p></Reveal>
            <Reveal delay={0.16}><ul className="mt-6 grid gap-3 sm:grid-cols-2"><Bullet>أسئلة عشوائية لكل محاولة</Bullet><Bullet>مؤقّت دقيق لكل سؤال</Bullet><Bullet>تحليل نتائج لحظي</Bullet><Bullet>تتبّع التقدّم عبر الزمن</Bullet></ul></Reveal>
            <Reveal delay={0.2}><div className="mt-7"><CTAPrimary href="/high-school">ابدأ اختباراً</CTAPrimary></div></Reveal>
          </div>
          <Reveal delay={0.1}><Illustration name="smart-analytics.png" icon={BarChart3} alt="تحليلات ذكية" ratio="3 / 2" /></Reveal>
        </div>
      </Section>

      {/* ════════ INTERACTIVE LESSONS ════════ */}
      <Section>
        <div className="grid items-center gap-12 md:grid-cols-2">
          <Reveal className="order-2 md:order-1"><Illustration name="interactive-lessons.png" icon={BookOpen} alt="دروس تفاعلية" ratio="3 / 2" /></Reveal>
          <div className="order-1 md:order-2">
            <Reveal><Eyebrow>دروس تفاعلية</Eyebrow></Reveal>
            <Reveal delay={0.06}><h2 className="mt-5 text-3xl font-extrabold leading-tight text-ink sm:text-5xl">تعلّم بطريقتك الخاصة</h2></Reveal>
            <Reveal delay={0.12}><p className="mt-4 text-lg leading-relaxed text-ink-soft">شرح مبسّط يجمع بين الفيديو والتطبيق العملي والاختبار السريع — لتضمن فهماً عميقاً ونتائج أفضل.</p></Reveal>
            <Reveal delay={0.16}><ul className="mt-6 grid gap-3 sm:grid-cols-2"><Bullet>فيديوهات تفاعلية</Bullet><Bullet>اختبارات فورية</Bullet><Bullet>تقدّم لحظي</Bullet><Bullet>ملخّصات ذكية</Bullet></ul></Reveal>
          </div>
        </div>
      </Section>

      {/* ════════ PROGRESS / DASHBOARD ════════ */}
      <Section>
        <div className="grid items-center gap-12 md:grid-cols-2">
          <div>
            <Reveal><Eyebrow>متابعة تقدّمك</Eyebrow></Reveal>
            <Reveal delay={0.06}><h2 className="mt-5 text-3xl font-extrabold leading-tight text-ink sm:text-5xl">تابع تقدّمك في كل مادة</h2></Reveal>
            <Reveal delay={0.12}><p className="mt-4 text-lg leading-relaxed text-ink-soft">لوحة تحكّم فاخرة تعرض نقاط الخبرة والسلسلة اليومية ومستوى إتقانك لكل مادة بشكل واضح ومنظّم.</p></Reveal>
            <Stagger className="mt-6 grid grid-cols-3 gap-3">
              {[
                { icon: Star, t: "نقاط الخبرة", c: "#C9A227" },
                { icon: Flame, t: "السلسلة اليومية", c: "#E0793B" },
                { icon: Target, t: "إتقان المواد", c: "#7C9A6A" },
              ].map((x) => (
                <StaggerItem key={x.t}><div className="bezel h-full"><div className="bezel-core glass flex h-full flex-col items-center gap-2 p-4 text-center">
                  <span className="grid h-10 w-10 place-items-center rounded-2xl" style={{ background: `${x.c}22`, color: x.c }}><x.icon size={18} strokeWidth={1.5} /></span>
                  <p className="text-xs font-bold text-ink-soft">{x.t}</p>
                </div></div></StaggerItem>
              ))}
            </Stagger>
            <Reveal delay={0.2}><div className="mt-7"><CTAPrimary href="/dashboard">افتح لوحتك</CTAPrimary></div></Reveal>
          </div>
          <Reveal delay={0.1} className="order-first md:order-none"><Illustration name="progress-tracking.png" icon={LineChart} alt="تتبع التقدم" ratio="3 / 2" /></Reveal>
        </div>
      </Section>

      {/* ════════ STUDY PLANS ════════ */}
      <Section>
        <div className="grid items-center gap-12 md:grid-cols-2">
          <Reveal className="order-2 md:order-1"><Illustration name="study-plan.png" icon={Calendar} alt="خطة دراسية" ratio="3 / 2" /></Reveal>
          <div className="order-1 md:order-2">
            <Reveal><Eyebrow>تنظيم وقتك</Eyebrow></Reveal>
            <Reveal delay={0.06}><h2 className="mt-5 text-3xl font-extrabold leading-tight text-ink sm:text-5xl">خطّط لدراستك بذكاء</h2></Reveal>
            <Reveal delay={0.12}><p className="mt-4 text-lg leading-relaxed text-ink-soft">جدول دراسي مرن يناسب أهدافك ويوزّع وقتك على المواد بحكمة ليوصلك إلى أفضل النتائج دون إرهاق.</p></Reveal>
            <Reveal delay={0.16}><ul className="mt-6 grid gap-3 sm:grid-cols-2"><Bullet>جدول قابل للتخصيص</Bullet><Bullet>تذكيرات ذكية</Bullet><Bullet>أهداف يومية</Bullet><Bullet>توازن بين المواد</Bullet></ul></Reveal>
          </div>
        </div>
      </Section>

      {/* ════════ STUDY HUB ════════ */}
      <Section>
        <div className="grid items-center gap-12 md:grid-cols-2">
          <div>
            <Reveal><Eyebrow>كل أدواتك للدراسة</Eyebrow></Reveal>
            <Reveal delay={0.06}><h2 className="mt-5 text-3xl font-extrabold leading-tight text-ink sm:text-5xl">دراستك في مكان واحد</h2></Reveal>
            <Reveal delay={0.12}><p className="mt-4 text-lg leading-relaxed text-ink-soft">ملاحظاتك واختباراتك وملفاتك ومصادرك المفضّلة — كلها مجتمعة في مساحة واحدة أنيقة تساعدك على التركيز والتفوّق.</p></Reveal>
            <Stagger className="mt-6 grid grid-cols-2 gap-3">
              {[
                { icon: BookOpen, t: "ملاحظاتي", s: "كتابة وتنظيم" },
                { icon: Target, t: "اختباراتي", s: "تدرّب وتقييم" },
                { icon: Layers, t: "ملفاتي", s: "كل المصادر" },
                { icon: Star, t: "المفضّلة", s: "مصادر مهمة" },
              ].map((x) => (
                <StaggerItem key={x.t}><div className="bezel h-full"><div className="bezel-core glass flex h-full items-center gap-3 p-4">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white/60 text-gold"><x.icon size={18} strokeWidth={1.5} /></span>
                  <div><p className="text-sm font-extrabold text-ink">{x.t}</p><p className="text-[11px] text-ink-soft">{x.s}</p></div>
                </div></div></StaggerItem>
              ))}
            </Stagger>
          </div>
          <Reveal delay={0.1} className="order-first md:order-none"><Illustration name="study-hub.png" icon={Layers} alt="مساحة الدراسة" ratio="3 / 2" /></Reveal>
        </div>
      </Section>

      {/* ════════ FEATURE BENTO ════════ */}
      <Section>
        <Reveal className="mx-auto mb-12 max-w-2xl text-center">
          <Eyebrow>تجربة متكاملة</Eyebrow>
          <h2 className="mt-5 text-3xl font-extrabold text-ink sm:text-5xl">كل ما تحتاجه للتفوّق</h2>
        </Reveal>
        <Stagger className="grid gap-5 md:grid-cols-6">
          {/* community — wide */}
          <StaggerItem className="md:col-span-4">
            <Link href="/community" className="group block h-full bezel transition-transform duration-500 hover:-translate-y-1.5" style={{ transitionTimingFunction: "cubic-bezier(0.32,0.72,0,1)" }}>
              <div className="bezel-core glass flex h-full flex-col justify-between gap-4 p-7">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-gradient text-white shadow-gold"><Users size={22} strokeWidth={1.5} /></span>
                <div>
                  <h3 className="text-xl font-extrabold text-ink">مجتمع تعليمي راقٍ</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">شارك إنجازاتك وناقش زملاءك واستلهم من نخبة الطلاب في بيئة محفّزة وآمنة.</p>
                </div>
              </div>
            </Link>
          </StaggerItem>
          {/* xp — tall */}
          <StaggerItem className="md:col-span-2 md:row-span-2">
            <Link href="/achievements" className="group block h-full bezel transition-transform duration-500 hover:-translate-y-1.5" style={{ transitionTimingFunction: "cubic-bezier(0.32,0.72,0,1)" }}>
              <div className="bezel-core glass flex h-full flex-col justify-between gap-4 p-7" style={{ background: "linear-gradient(160deg, rgba(201,162,39,0.12), rgba(255,255,255,0.5))" }}>
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-gradient text-white shadow-gold"><Zap size={22} strokeWidth={1.5} /></span>
                <div>
                  <h3 className="text-xl font-extrabold text-ink">نقاط الخبرة والأوسمة</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">اكسب XP مع كل إنجاز واجمع الأوسمة وحافظ على سلسلتك اليومية المشتعلة.</p>
                </div>
                <div className="flex gap-2">
                  <span className="rounded-full bg-white/60 px-3 py-1 text-xs font-bold text-ink">🔥 سلسلة</span>
                  <span className="rounded-full bg-white/60 px-3 py-1 text-xs font-bold text-ink">⭐ XP</span>
                </div>
              </div>
            </Link>
          </StaggerItem>
          {/* competitions */}
          <StaggerItem className="md:col-span-2">
            <Link href="/competitions" className="group block h-full bezel transition-transform duration-500 hover:-translate-y-1.5" style={{ transitionTimingFunction: "cubic-bezier(0.32,0.72,0,1)" }}>
              <div className="bezel-core glass flex h-full flex-col gap-3 p-6">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gold-gradient text-white shadow-gold"><Trophy size={20} strokeWidth={1.5} /></span>
                <h3 className="font-extrabold text-ink">مسابقات وجوائز</h3>
                <div className="flex flex-wrap gap-1.5">
                  {PRIZES.map((p) => <span key={p.rank} className="rounded-full bg-white/60 px-2.5 py-1 text-[11px] font-bold text-ink">{p.icon} {p.prize}</span>)}
                </div>
              </div>
            </Link>
          </StaggerItem>
          {/* achievements */}
          <StaggerItem className="md:col-span-2">
            <FeatureCard icon={Trophy} href="/achievements" title="الإنجازات والأوسمة" desc="وثّق تفوّقك بأوسمة أنيقة تتراكم مع تقدّمك." className="h-full" />
          </StaggerItem>
        </Stagger>
      </Section>

      {/* ════════ ELITE ════════ */}
      <Section>
        <Reveal>
          <div className="bezel">
            <div className="bezel-core glass-strong relative overflow-hidden p-8 sm:p-12">
              <div className="pointer-events-none absolute -left-16 -top-16 h-56 w-56 rounded-full opacity-30 blur-3xl" style={{ background: "radial-gradient(circle, rgba(201,162,39,0.4), transparent 70%)" }} />
              <div className="grid items-center gap-10 md:grid-cols-2">
                <div>
                  <Eyebrow>{ELITE.name} <Crown size={13} /></Eyebrow>
                  <h2 className="mt-5 text-3xl font-extrabold text-ink sm:text-5xl">وصول كامل بلا حدود</h2>
                  <div className="mt-5 flex items-end gap-1">
                    <span className="gold-text text-5xl font-extrabold ltr-nums">{ELITE.priceSAR}</span>
                    <span className="mb-1 text-lg font-bold text-ink-soft">ريال / شهرياً</span>
                  </div>
                  <p className="mt-3 text-sm text-ink-muted">يُفعّل الاشتراك بعد دفع مؤكّد — أو افتح مكافأة محدودة بدعوة ٥ أصدقاء.</p>
                  <div className="mt-7 flex flex-wrap gap-3">
                    <CTAPrimary href="/subscriptions">اعرف المزيد</CTAPrimary>
                    <Link href="/subscriptions" className="cta-ghost">قارن الباقات</Link>
                  </div>
                </div>
                <ul className="grid gap-3">
                  {ELITE.perks.map((perk) => <Bullet key={perk}>{perk}</Bullet>)}
                </ul>
              </div>
            </div>
          </div>
        </Reveal>
      </Section>

      {/* ════════ PRIVACY ════════ */}
      <Section>
        <div className="grid items-center gap-12 md:grid-cols-2">
          <Reveal className="order-2 md:order-1"><Illustration name="privacy.png" icon={ShieldCheck} alt="الخصوصية" ratio="3 / 2" /></Reveal>
          <div className="order-1 md:order-2">
            <Reveal><Eyebrow>حماية خصوصيتك</Eyebrow></Reveal>
            <Reveal delay={0.06}><h2 className="mt-5 text-3xl font-extrabold leading-tight text-ink sm:text-5xl">خصوصيتك أولويتنا</h2></Reveal>
            <Reveal delay={0.12}><p className="mt-4 text-lg leading-relaxed text-ink-soft">نلتزم بحماية بياناتك بأعلى معايير الأمان — بريدك ورقمك لا يظهران علناً أبداً وبياناتك مشفّرة ولا تُشارك مع أي جهة.</p></Reveal>
            <Reveal delay={0.16}><ul className="mt-6 grid gap-3 sm:grid-cols-2"><Bullet>تشفير متقدّم للبيانات</Bullet><Bullet>خصوصية كاملة لحسابك</Bullet><Bullet>لا مشاركة مع طرف ثالث</Bullet><Bullet>تحكّم كامل بحسابك</Bullet></ul></Reveal>
          </div>
        </div>
      </Section>

      {/* ════════ STUDENT VOICES ════════ */}
      <Section>
        <Reveal>
          <div className="bezel">
            <div className="bezel-core glass flex flex-col items-center gap-5 p-10 text-center sm:p-14">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gold-gradient text-white shadow-gold"><MessageSquareQuote size={26} strokeWidth={1.5} /></span>
              <h2 className="text-3xl font-extrabold text-ink sm:text-4xl">صوت طلابنا يصنع جزيرة</h2>
              <p className="max-w-xl text-lg text-ink-soft">اقرأ تجارب زملائك الحقيقية وشارك رأيك ليستفيد غيرك — مجتمعنا يكبر بآرائكم الصادقة.</p>
              <CTAPrimary href="/reviews">اطّلع على الآراء</CTAPrimary>
            </div>
          </div>
        </Reveal>
      </Section>

      {/* ════════ QUICK LINKS ════════ */}
      <Section>
        <Reveal className="mb-10 text-center">
          <Eyebrow>روابط سريعة</Eyebrow>
          <h2 className="mt-5 text-3xl font-extrabold text-ink sm:text-4xl">كل المنصة بين يديك</h2>
        </Reveal>
        <Stagger className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {[
            { label: "لوحة التحكم", href: "/dashboard", icon: Compass },
            { label: "المناهج والمصادر", href: "/curriculum", icon: Library },
            { label: "اختبارات القدرات", href: "/high-school", icon: GraduationCap },
            { label: "المرحلة الابتدائية", href: "/curriculum/elementary", icon: BookOpen },
            { label: "المرحلة المتوسطة", href: "/curriculum/middle", icon: Layers },
            { label: "المرحلة الثانوية", href: "/curriculum/high-school", icon: GraduationCap },
            { label: "المجتمع التعليمي", href: "/community", icon: Users },
            { label: "المسابقات", href: "/competitions", icon: Trophy },
            { label: "الإنجازات", href: "/achievements", icon: Star },
            { label: "آراء الطلبة", href: "/reviews", icon: MessageSquareQuote },
            { label: "باقة النخبة", href: "/subscriptions", icon: Crown },
            { label: "عن جزيرة", href: "/about", icon: Sparkles },
            { label: "الأسئلة الشائعة", href: "/faq", icon: Lightbulb },
            { label: "الدعم الفني", href: "/support", icon: ShieldCheck },
            { label: "الإعدادات", href: "/settings", icon: Layers },
            { label: "تسجيل الدخول", href: "/sign-in", icon: ArrowLeft },
            { label: "إنشاء حساب", href: "/sign-up", icon: Rocket },
          ].map((q) => (
            <StaggerItem key={q.label}>
              <Link href={q.href} className="group flex items-center gap-3 rounded-2xl border border-[rgba(201,168,106,0.25)] bg-white/50 px-4 py-3.5 transition-all duration-300 hover:-translate-y-0.5 hover:border-[rgba(201,168,106,0.5)] hover:bg-white/70">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/70 text-gold transition-colors group-hover:bg-gold-gradient group-hover:text-white"><q.icon size={17} strokeWidth={1.5} /></span>
                <span className="text-sm font-bold text-ink">{q.label}</span>
              </Link>
            </StaggerItem>
          ))}
        </Stagger>
      </Section>

      {/* ════════ FINAL CTA ════════ */}
      <Section className="!pb-10">
        <Reveal>
          <div className="bezel">
            <div className="bezel-core relative overflow-hidden p-10 text-center sm:p-16" style={{ background: "linear-gradient(135deg, rgba(201,162,39,0.14), rgba(255,253,249,0.7))" }}>
              <Float amount={8} duration={6} className="mx-auto mb-5 w-max"><span className="text-6xl">🏝️</span></Float>
              <h2 className="text-3xl font-extrabold text-ink sm:text-5xl">ابدأ رحلتك اليوم</h2>
              <p className="mx-auto mt-4 max-w-xl text-lg text-ink-soft">استثمر في نفسك — فالمستقبل يصنعه من يتعلّم. انضمّ إلى جزيرة وابدأ خطوتك الأولى نحو التفوّق.</p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <CTAPrimary href="/dashboard">ابدأ الآن مجاناً</CTAPrimary>
                <Link href="/sign-up" className="cta-ghost">إنشاء حساب</Link>
              </div>
            </div>
          </div>
        </Reveal>
      </Section>

      </main>

      <SiteFooter />
    </div>
  );
}
