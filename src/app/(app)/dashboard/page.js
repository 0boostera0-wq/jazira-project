"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Sparkles, Crown, Flame, Star, Users, GraduationCap, BookOpen, Trophy, Bot,
  ArrowLeft, Check, Target, Calendar, BarChart3, Layers, Compass, Zap, Lightbulb,
  ShieldCheck, MessageSquareQuote, Rocket, Lock, Medal, Clock,
  TrendingUp, FileText,
} from "lucide-react";
import { Reveal, Stagger, StaggerItem, Float } from "@/components/motion/Reveal";
import Illustration from "@/components/Illustration";
import Avatar from "@/components/Avatar";
import BrandLogo from "@/components/BrandLogo";
import { useApp } from "@/context/AppContext";
import { useAuthUser } from "@/context/AuthProvider";
import { usePreferences } from "@/context/PreferencesProvider";
import { useStreak } from "@/hooks/useStreak";
import { createClient } from "@/lib/supabase-client";
import { ELITE, PRIZES } from "@/lib/constants";

/* ── primitives ──────────────────────────────────────────────────────── */
function SectionHead({ eyebrow, title, sub, href, cta = "عرض الكل" }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <div className="mb-3"><span className="eyebrow">{eyebrow}</span></div>}
        <h2 className="text-2xl font-extrabold text-ink sm:text-3xl">{title}</h2>
        {sub && <p className="mt-2 max-w-xl text-ink-soft">{sub}</p>}
      </div>
      {href && <Link href={href} className="cta-ghost text-sm">{cta} <ArrowLeft size={15} /></Link>}
    </div>
  );
}

function Ring({ value = 0, size = 88, stroke = 9, children }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.min(1, Math.max(0, value)));
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(201,168,106,0.18)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke="url(#jzgold)" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} initial={{ strokeDashoffset: c }} whileInView={{ strokeDashoffset: off }}
          viewport={{ once: true }} transition={{ duration: 1.1, ease: [0.32, 0.72, 0, 1] }}
        />
        <defs><linearGradient id="jzgold" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#E6C77E" /><stop offset="100%" stopColor="#B8923F" /></linearGradient></defs>
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

function StatChip({ icon: Icon, label, value, color }) {
  return (
    <div className="bezel"><div className="bezel-core glass flex items-center gap-3 p-3.5">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl" style={{ background: `${color}22`, color }}><Icon size={19} strokeWidth={1.5} /></span>
      <div><p className="text-lg font-extrabold text-ink ltr-nums leading-none">{value}</p><p className="mt-1 text-[11px] text-ink-soft">{label}</p></div>
    </div></div>
  );
}

function NavCard({ icon: Icon, title, desc, href, tone = "glass" }) {
  return (
    <Link href={href} className="group block h-full bezel transition-transform duration-500 hover:-translate-y-1.5" style={{ transitionTimingFunction: "cubic-bezier(0.32,0.72,0,1)" }}>
      <div className={`bezel-core ${tone} flex h-full flex-col p-5`}>
        <span className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gold-gradient text-white shadow-gold"><Icon size={20} strokeWidth={1.5} /></span>
        <h3 className="font-extrabold text-ink">{title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">{desc}</p>
        <span className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-gold opacity-0 transition-opacity duration-300 group-hover:opacity-100">ابدأ <ArrowLeft size={14} /></span>
      </div>
    </Link>
  );
}

/* ── page ────────────────────────────────────────────────────────────── */
export default function DashboardPage() {
  const { isElite, hasPremiumAccess } = useApp();
  const { isSignedIn, userId, name, imageUrl } = useAuthUser();
  const { aiSuggestions } = usePreferences();
  const { streak } = useStreak(userId);

  const [xp, setXp] = useState(0);
  const [referrals, setReferrals] = useState(0);
  const [posts, setPosts] = useState(null); // null = loading, [] = empty

  useEffect(() => {
    if (!userId) { setXp(0); setReferrals(0); return; }
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      try {
        const { data } = await supabase.from("profiles").select("xp").eq("id", userId).single();
        if (!cancelled) setXp(data?.xp ?? 0);
      } catch {}
      try {
        const { count } = await supabase.from("referrals").select("id", { count: "exact", head: true }).eq("referrer_id", userId);
        if (!cancelled && typeof count === "number") setReferrals(count);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [userId]);

  // Community preview (best-effort, read-only)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase.from("community_posts").select("id, content, user_id, created_at").order("created_at", { ascending: false }).limit(3);
        let rows = data || [];
        if (rows.length) {
          const ids = [...new Set(rows.map((r) => r.user_id))];
          const { data: profs } = await supabase.from("profiles").select("id, full_name, avatar_url, is_elite").in("id", ids);
          const byId = Object.fromEntries((profs || []).map((p) => [p.id, p]));
          rows = rows.map((r) => ({ ...r, profile: byId[r.user_id] || null }));
        }
        if (!cancelled) setPosts(rows);
      } catch { if (!cancelled) setPosts([]); }
    })();
    return () => { cancelled = true; };
  }, []);

  const openAI = (prompt) => {
    try { window.dispatchEvent(new CustomEvent("jazira:open-assistant", { detail: { prompt } })); } catch {}
  };

  const firstName = (name || "").trim().split(" ")[0];
  const levelXp = xp % 1000;            // progress within current 1000-XP level
  const level = Math.floor(xp / 1000) + 1;
  const streakGoal = Math.min(1, streak / 30);

  const AI_SUGGESTIONS = [
    "اشرح لي التناظر اللفظي ببساطة",
    "أعطني خطة مذاكرة لأسبوع",
    "لخّص لي درس الكسور",
    "كيف أنظّم وقتي قبل الاختبار؟",
    "اختبرني في القدرات الكمية",
  ];

  const achievements = [
    { title: "أول خطوة", desc: "أكمل ملفك الشخصي", icon: Check, unlocked: !!name },
    { title: "١٠٠ نقطة خبرة", desc: "اجمع ١٠٠ XP", icon: Star, unlocked: xp >= 100 },
    { title: "سلسلة الأسبوع", desc: "حافظ على ٧ أيام", icon: Flame, unlocked: streak >= 7 },
    { title: "داعية جزيرة", desc: "ادعُ صديقاً واحداً", icon: Users, unlocked: referrals >= 1 },
    { title: "عضو النخبة", desc: "اشترك في باقة النخبة", icon: Crown, unlocked: isElite, elite: true },
  ];

  return (
    <div className="space-y-16">
      {/* ════ 1 · WELCOME HERO ════ */}
      <Reveal>
        <div className="relative overflow-hidden bezel">
          <div className="bezel-core relative overflow-hidden p-6 sm:p-9" style={{ background: "linear-gradient(135deg, rgba(201,162,39,0.13), rgba(255,253,249,0.75))" }}>
            <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full opacity-40 blur-3xl" style={{ background: "radial-gradient(circle, rgba(201,162,39,0.4), transparent 70%)" }} />
            <div className="grid items-center gap-8 md:grid-cols-2">
              <div>
                <div className="flex items-center gap-3">
                  <Avatar src={imageUrl} name={name} size={56} />
                  <div>
                    <p className="flex items-center gap-1.5 text-sm text-ink-soft">لوحة القيادة {isElite && <span className="inline-flex items-center gap-1 rounded-full bg-gold-gradient px-2 py-0.5 text-[10px] font-bold text-white"><Crown size={10} /> نخبة</span>}</p>
                    <h1 className="text-2xl font-extrabold text-ink sm:text-3xl">{isSignedIn && firstName ? `أهلاً بك، ${firstName} 👋` : "أهلاً بك في جزيرة 🏝️"}</h1>
                  </div>
                </div>
                <p className="mt-4 max-w-md text-ink-soft">ابدأ يومك بخطة واضحة، وتابع تقدّمك خطوة بخطوة — كل جلسة دراسة تقرّبك من هدفك.</p>
                <div className="mt-6 grid grid-cols-3 gap-3">
                  <StatChip icon={Star} label="نقاط الخبرة" value={xp} color="#C9A227" />
                  <StatChip icon={Flame} label="سلسلة يومية" value={`${streak} يوم`} color="#E0793B" />
                  <StatChip icon={Users} label="دعوات ناجحة" value={referrals} color="#7C9A6A" />
                </div>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Link href="/high-school" className="cta-lux"><span>متابعة التعلّم</span><span className="cta-puck"><ArrowLeft size={16} /></span></Link>
                  <button onClick={() => openAI("")} className="cta-ghost"><Bot size={16} /> اسأل المساعد</button>
                </div>
              </div>
              <Float amount={9} duration={7} className="hidden md:block"><Illustration name="dashboard/learning-journey.png" icon={Compass} alt="رحلتك التعليمية" ratio="3 / 2" /></Float>
            </div>
          </div>
        </div>
      </Reveal>

      {/* ════ 2 · AI COMMAND AREA ════ */}
      <section>
        <Reveal>
          <div className="bezel">
            <div className="bezel-core glass-strong grid items-center gap-8 p-6 sm:p-9 md:grid-cols-2">
              <Float amount={10} duration={6} className="order-2 md:order-1"><Illustration name="dashboard/ai-assistant.png" icon={Bot} alt="المساعد الذكي" ratio="3 / 2" /></Float>
              <div className="order-1 md:order-2">
                <div className="mb-3"><span className="eyebrow">المساعد الذكي <Bot size={13} /></span></div>
                <h2 className="text-2xl font-extrabold text-ink sm:text-3xl">مركز قيادتك الذكي</h2>
                <p className="mt-3 text-ink-soft">اسأل المساعد الذكي، راجع نقاط ضعفك، وادخل الاختبار بثقة — يشرح ويلخّص ويختبرك على مدار الساعة.</p>
                {aiSuggestions && (
                  <div className="mt-5 flex flex-wrap gap-2">
                    {AI_SUGGESTIONS.map((s) => (
                      <button key={s} onClick={() => openAI(s)} className="rounded-full border border-[rgba(201,168,106,0.3)] bg-white/55 px-3.5 py-2 text-sm font-semibold text-ink-soft transition-all duration-300 hover:-translate-y-0.5 hover:border-gold hover:text-ink">{s}</button>
                    ))}
                  </div>
                )}
                <div className="mt-6"><button onClick={() => openAI("")} className="cta-lux"><span>افتح المساعد الذكي</span><span className="cta-puck"><Bot size={16} /></span></button></div>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ════ 3 · CONTINUE LEARNING ════ */}
      <section>
        <SectionHead eyebrow="واصل من حيث توقّفت" title="أكمل رحلتك" sub="اختر مسارك وابدأ الدرس التالي — كل خطوة تُحتسب." href="/high-school" cta="كل المسارات" />
        <Stagger className="grid gap-5 md:grid-cols-3">
          <StaggerItem><NavCard icon={BookOpen} href="/elementary" title="المرحلة الابتدائية" desc="أساسيات القراءة والكتابة والحساب بأسلوب ممتع." /></StaggerItem>
          <StaggerItem><NavCard icon={Layers} href="/middle" title="المرحلة المتوسطة" desc="ترسيخ المفاهيم وبناء التفكير النقدي." /></StaggerItem>
          <StaggerItem><NavCard icon={GraduationCap} href="/high-school" title="المرحلة الثانوية" desc="استعداد كامل للقدرات والتحصيلي." /></StaggerItem>
        </Stagger>
      </section>

      {/* ════ 4 · STUDY PROGRESS ════ */}
      <section>
        <SectionHead eyebrow="تقدّمك" title="تابع تقدّمك في كل مادة" sub="أرقام حقيقية من نشاطك — لا قيم وهمية." />
        <div className="grid gap-5 lg:grid-cols-3">
          <Reveal className="lg:col-span-1">
            <div className="bezel h-full"><div className="bezel-core glass flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
              <Ring value={levelXp / 1000}><div><p className="text-xl font-extrabold text-ink ltr-nums">{levelXp}</p><p className="text-[10px] text-ink-soft">/١٠٠٠</p></div></Ring>
              <div><p className="font-extrabold text-ink">المستوى {level}</p><p className="text-xs text-ink-soft">نقاط الخبرة الكلية: <span className="ltr-nums">{xp}</span></p></div>
            </div></div>
          </Reveal>
          <Reveal delay={0.06} className="lg:col-span-1">
            <div className="bezel h-full"><div className="bezel-core glass flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
              <Ring value={streakGoal}><div><Flame size={20} className="mx-auto text-[#E0793B]" /><p className="mt-1 text-lg font-extrabold text-ink ltr-nums">{streak}</p></div></Ring>
              <div><p className="font-extrabold text-ink">سلسلتك اليومية</p><p className="text-xs text-ink-soft">هدفك: ٣٠ يوماً متتالياً</p></div>
            </div></div>
          </Reveal>
          <Reveal delay={0.12} className="lg:col-span-1">
            <Illustration name="dashboard/progress-tracking.png" icon={TrendingUp} alt="تقدّم المواد" ratio="3 / 2" />
          </Reveal>
        </div>
      </section>

      {/* ════ 5 · DAILY MISSIONS ════ */}
      <section>
        <SectionHead eyebrow="مهام اليوم" title="ابدأ يومك بثلاث خطوات" sub="مهام قصيرة تحافظ على سلسلتك وتبني عادتك." />
        <div className="grid gap-5 md:grid-cols-3">
          {[
            { icon: Target, t: "حل اختبار قصير", d: "١٠ أسئلة تكشف مستواك اليوم.", href: "/high-school" },
            { icon: BookOpen, t: "راجع درساً واحداً", d: "تثبيت المعلومة خير من الكم.", href: "/middle" },
            { icon: Users, t: "شارك في المجتمع", d: "سؤال أو إنجاز يلهم غيرك.", href: "/community" },
          ].map((m, i) => (
            <Reveal key={m.t} delay={i * 0.06}>
              <Link href={m.href} className="group block h-full bezel transition-transform duration-500 hover:-translate-y-1.5" style={{ transitionTimingFunction: "cubic-bezier(0.32,0.72,0,1)" }}>
                <div className="bezel-core glass flex h-full items-center gap-4 p-5">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/60 text-gold transition-colors group-hover:bg-gold-gradient group-hover:text-white"><m.icon size={22} strokeWidth={1.5} /></span>
                  <div className="flex-1"><h3 className="font-extrabold text-ink">{m.t}</h3><p className="mt-0.5 text-sm text-ink-soft">{m.d}</p></div>
                  <ArrowLeft size={18} className="text-ink-muted transition-transform group-hover:-translate-x-1" />
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ════ 6 · EXAMS HUB ════ */}
      <section>
        <SectionHead eyebrow="مركز الاختبارات" title="تدرّب كأنك في القاعة" sub="اختبارات تحاكي الواقع بمؤقّت صارم وتحليل فوري." href="/high-school" cta="ابدأ الآن" />
        <div className="grid items-stretch gap-5 md:grid-cols-3">
          <Reveal className="md:col-span-1"><Illustration name="dashboard/study-hub.png" icon={FileText} alt="مركز الدراسة" ratio="4 / 3" /></Reveal>
          <Stagger className="grid gap-5 sm:grid-cols-2 md:col-span-2">
            <StaggerItem><NavCard icon={GraduationCap} href="/high-school" title="اختبار القدرات" desc="لفظي وكمّي بأسئلة عشوائية." /></StaggerItem>
            <StaggerItem><NavCard icon={Medal} href="/high-school" title="الاختبار التحصيلي" desc="تغطية شاملة لمواد المسار العلمي." /></StaggerItem>
            <StaggerItem><NavCard icon={Target} href="/high-school" title="تدريب الأسئلة" desc="تمرّن على نوع سؤال محدّد." /></StaggerItem>
            <StaggerItem><NavCard icon={Clock} href="/high-school" title="اختبار محاكاة" desc="تجربة كاملة بضغط الوقت الحقيقي." /></StaggerItem>
          </Stagger>
        </div>
      </section>

      {/* ════ 7 · SCHOOL STAGES ════ */}
      <section>
        <SectionHead eyebrow="المراحل الدراسية" title="مسار مصمّم لكل مرحلة" sub="محتوى متدرّج يبني المهارة طبقة فوق طبقة." />
        <div className="grid items-center gap-8 md:grid-cols-2">
          <Reveal><Illustration name="dashboard/journey-start.png" icon={Rocket} alt="ابدأ رحلتك" ratio="3 / 2" /></Reveal>
          <Stagger className="grid gap-4">
            {[
              { icon: BookOpen, t: "ابتدائي", d: "بناء الأساس بثقة ومتعة.", href: "/elementary" },
              { icon: Layers, t: "متوسط", d: "تعميق الفهم والتفكير.", href: "/middle" },
              { icon: GraduationCap, t: "ثانوي", d: "جاهزية كاملة للاختبارات.", href: "/high-school" },
            ].map((s) => (
              <StaggerItem key={s.t}>
                <Link href={s.href} className="group flex items-center gap-4 bezel transition-transform duration-500 hover:-translate-x-1" style={{ transitionTimingFunction: "cubic-bezier(0.32,0.72,0,1)" }}>
                  <div className="bezel-core glass flex w-full items-center gap-4 p-4">
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gold-gradient text-white shadow-gold"><s.icon size={22} strokeWidth={1.5} /></span>
                    <div className="flex-1"><h3 className="font-extrabold text-ink">{s.t}</h3><p className="text-sm text-ink-soft">{s.d}</p></div>
                    <ArrowLeft size={18} className="text-ink-muted" />
                  </div>
                </Link>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* ════ 8 · COMMUNITY PREVIEW ════ */}
      <section>
        <SectionHead eyebrow="المجتمع التعليمي" title="تعلّم لا يكتمل وحدك" sub="شارك إنجازك، واستلهم من نخبة الطلاب." href="/community" cta="زيارة المجتمع" />
        {posts === null ? (
          <div className="grid gap-4 sm:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="h-28 animate-pulse rounded-3xl bg-champagne-100/60" />)}</div>
        ) : posts.length === 0 ? (
          <Reveal>
            <div className="bezel"><div className="bezel-core glass flex flex-col items-center gap-3 p-10 text-center">
              <span className="text-4xl">🌴</span>
              <p className="font-extrabold text-ink">كن أول من يبدأ الحوار</p>
              <p className="max-w-md text-sm text-ink-soft">لا توجد منشورات بعد — شارك سؤالاً أو إنجازاً وافتح باب النقاش لزملائك.</p>
              <Link href="/community" className="cta-lux mt-1"><span>انشر الآن</span><span className="cta-puck"><ArrowLeft size={16} /></span></Link>
            </div></div>
          </Reveal>
        ) : (
          <Stagger className="grid gap-4 sm:grid-cols-3">
            {posts.map((p) => (
              <StaggerItem key={p.id}>
                <Link href="/community" className="block h-full bezel transition-transform duration-500 hover:-translate-y-1" style={{ transitionTimingFunction: "cubic-bezier(0.32,0.72,0,1)" }}>
                  <div className="bezel-core glass flex h-full flex-col gap-3 p-5">
                    <div className="flex items-center gap-2">
                      <Avatar src={p.profile?.avatar_url} name={p.profile?.full_name} size={34} />
                      <span className="flex items-center gap-1 text-sm font-bold text-ink">{p.profile?.full_name || "مستخدم"} {p.profile?.is_elite && <Crown size={12} className="text-gold" />}</span>
                    </div>
                    <p className="line-clamp-3 text-sm text-ink-soft">{p.content || "منشور بوسائط"}</p>
                  </div>
                </Link>
              </StaggerItem>
            ))}
          </Stagger>
        )}
      </section>

      {/* ════ 9 · ACHIEVEMENTS ════ */}
      <section>
        <SectionHead eyebrow="الإنجازات والأوسمة" title="وثّق تفوّقك" sub="تُفتح الأوسمة تلقائياً مع تقدّمك الحقيقي." href="/achievements" />
        <Stagger className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {achievements.map((a) => (
            <StaggerItem key={a.title}>
              <div className={`h-full bezel ${a.unlocked ? "" : "opacity-70"}`}>
                <div className="bezel-core glass flex h-full flex-col items-center gap-2 p-5 text-center">
                  <span className={`grid h-12 w-12 place-items-center rounded-2xl ${a.unlocked ? "bg-gold-gradient text-white shadow-gold" : "bg-white/60 text-ink-muted"}`}>
                    {a.unlocked ? <a.icon size={22} strokeWidth={1.5} /> : <Lock size={20} strokeWidth={1.5} />}
                  </span>
                  <p className="text-sm font-extrabold text-ink">{a.title}</p>
                  <p className="text-[11px] leading-snug text-ink-soft">{a.desc}</p>
                </div>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* ════ 10 · COMPETITIONS ════ */}
      <section>
        <SectionHead eyebrow="المسابقات" title="تنافس واربح" sub="تصدّر لوحة المتصدرين واحصد جوائز قيّمة." href="/competitions" cta="إلى المسابقات" />
        <Reveal>
          <div className="bezel"><div className="bezel-core glass-strong flex flex-col items-center gap-5 p-8 text-center sm:p-12">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gold-gradient text-white shadow-gold"><Trophy size={26} strokeWidth={1.5} /></span>
            <p className="font-extrabold text-ink">لا توجد مسابقة نشطة حالياً</p>
            <p className="max-w-md text-sm text-ink-soft">ترقّب انطلاق التحدّي القادم — وكن مستعداً لتتصدّر القائمة.</p>
            <div className="flex flex-wrap justify-center gap-2">
              {PRIZES.map((p) => <span key={p.rank} className="rounded-full bg-white/60 px-3 py-1.5 text-xs font-bold text-ink">{p.icon} {p.label}: {p.prize}</span>)}
            </div>
            <Link href="/competitions" className="cta-ghost mt-1">استكشف المسابقات <ArrowLeft size={15} /></Link>
          </div></div>
        </Reveal>
      </section>

      {/* ════ 11 · SMART ANALYTICS ════ */}
      <section>
        <SectionHead eyebrow="تحليلات ذكية" title="افهم تقدّمك بدقّة" sub="نظرة واضحة على نشاطك الحقيقي في المنصة." />
        <div className="grid items-center gap-8 md:grid-cols-2">
          <Stagger className="grid grid-cols-2 gap-4">
            <StaggerItem><div className="bezel"><div className="bezel-core glass p-5"><BarChart3 size={20} className="text-gold" /><p className="mt-3 text-2xl font-extrabold text-ink ltr-nums">{xp}</p><p className="text-xs text-ink-soft">إجمالي نقاط الخبرة</p></div></div></StaggerItem>
            <StaggerItem><div className="bezel"><div className="bezel-core glass p-5"><Flame size={20} className="text-[#E0793B]" /><p className="mt-3 text-2xl font-extrabold text-ink ltr-nums">{streak}</p><p className="text-xs text-ink-soft">أيام السلسلة</p></div></div></StaggerItem>
            <StaggerItem><div className="bezel"><div className="bezel-core glass p-5"><Users size={20} className="text-[#7C9A6A]" /><p className="mt-3 text-2xl font-extrabold text-ink ltr-nums">{referrals}</p><p className="text-xs text-ink-soft">دعوات ناجحة</p></div></div></StaggerItem>
            <StaggerItem><div className="bezel"><div className="bezel-core glass p-5"><Zap size={20} className="text-gold" /><p className="mt-3 text-2xl font-extrabold text-ink ltr-nums">{level}</p><p className="text-xs text-ink-soft">مستواك الحالي</p></div></div></StaggerItem>
          </Stagger>
          <Reveal delay={0.1}><Illustration name="dashboard/smart-analytics.png" icon={BarChart3} alt="تحليلات ذكية" ratio="3 / 2" /></Reveal>
        </div>
      </section>

      {/* ════ 12 · QUICK ACTIONS ════ */}
      <section>
        <SectionHead eyebrow="إجراءات سريعة" title="كل ما تحتاجه بضغطة" />
        <Stagger className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {[
            { label: "اختبارات القدرات", href: "/high-school", icon: GraduationCap },
            { label: "المرحلة الابتدائية", href: "/elementary", icon: BookOpen },
            { label: "المرحلة المتوسطة", href: "/middle", icon: Layers },
            { label: "المجتمع التعليمي", href: "/community", icon: Users },
            { label: "المسابقات", href: "/competitions", icon: Trophy },
            { label: "الإنجازات", href: "/achievements", icon: Star },
            { label: "آراء الطلبة", href: "/reviews", icon: MessageSquareQuote },
            { label: "باقة النخبة", href: "/subscriptions", icon: Crown },
            { label: "الأسئلة الشائعة", href: "/faq", icon: Lightbulb },
            { label: "الدعم الفني", href: "/support", icon: ShieldCheck },
            { label: "الإعدادات", href: "/settings", icon: Compass },
            { label: "عن جزيرة", href: "/about", icon: Sparkles },
          ].map((q) => (
            <StaggerItem key={q.label}>
              <Link href={q.href} className="group flex items-center gap-3 rounded-2xl border border-[rgba(201,168,106,0.25)] bg-white/50 px-4 py-3.5 transition-all duration-300 hover:-translate-y-0.5 hover:border-[rgba(201,168,106,0.5)] hover:bg-white/70">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/70 text-gold transition-colors group-hover:bg-gold-gradient group-hover:text-white"><q.icon size={17} strokeWidth={1.5} /></span>
                <span className="text-sm font-bold text-ink">{q.label}</span>
              </Link>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* ════ 13 · ELITE PREVIEW ════ */}
      <section>
        <Reveal>
          <div className="bezel">
            <div className="bezel-core relative overflow-hidden p-8 sm:p-10" style={{ background: "linear-gradient(135deg, rgba(201,162,39,0.14), rgba(255,253,249,0.7))" }}>
              <div className="grid items-center gap-8 md:grid-cols-2">
                <div>
                  <div className="mb-3"><span className="eyebrow">{ELITE.name} <Crown size={13} /></span></div>
                  {isElite ? (
                    <>
                      <h2 className="text-2xl font-extrabold text-ink sm:text-3xl">أنت عضو نخبة ✨</h2>
                      <p className="mt-3 text-ink-soft">تتمتّع بوصول كامل لكل المزايا المتقدّمة. شكراً لثقتك بجزيرة.</p>
                      <Link href="/subscriptions" className="cta-ghost mt-6">إدارة الاشتراك <ArrowLeft size={15} /></Link>
                    </>
                  ) : (
                    <>
                      <h2 className="text-2xl font-extrabold text-ink sm:text-3xl">افتح وصولاً كاملاً بلا حدود</h2>
                      <div className="mt-4 flex items-end gap-1"><span className="gold-text text-4xl font-extrabold ltr-nums">{ELITE.priceSAR}</span><span className="mb-1 font-bold text-ink-soft">ريال / شهرياً</span></div>
                      <p className="mt-2 text-sm text-ink-muted">يُفعّل بعد دفع مؤكّد — أو افتح مكافأة محدودة بدعوة ٥ أصدقاء.</p>
                      <div className="mt-6 flex flex-wrap gap-3">
                        <Link href="/subscriptions" className="cta-lux"><span>الترقية للنخبة</span><span className="cta-puck"><ArrowLeft size={16} /></span></Link>
                        <Link href="/subscriptions" className="cta-ghost">قارن الباقات</Link>
                      </div>
                    </>
                  )}
                </div>
                <ul className="grid gap-3">
                  {ELITE.perks.slice(0, 4).map((perk) => (
                    <li key={perk} className="flex items-start gap-2.5 text-ink-soft"><span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-gold-gradient text-white"><Check size={12} strokeWidth={3} /></span><span className="leading-relaxed">{perk}</span></li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ════ 14 · RECOMMENDATIONS ════ */}
      <section>
        <SectionHead eyebrow="موصى لك" title="خطوتك التالية المقترحة" sub="توصيات مختارة لتبقيك على المسار الصحيح." />
        <div className="grid items-center gap-8 md:grid-cols-2">
          <Stagger className="grid gap-4">
            {[
              { icon: Bot, t: "اسأل المساعد عن نقطة ضعفك", d: "ابدأ محادثة موجّهة لتحسين أضعف مهاراتك.", action: () => openAI("ما هي أفضل طريقة لتقوية نقاط ضعفي؟") },
              { icon: Target, t: "حل اختبار قدرات قصير", d: "قِس مستواك الآن في ١٠ دقائق.", href: "/high-school" },
              { icon: Calendar, t: "نظّم خطتك الأسبوعية", d: "وزّع وقتك على المواد بحكمة.", href: "/high-school" },
            ].map((r, i) => (
              <StaggerItem key={r.t}>
                {r.href ? (
                  <Link href={r.href} className="group flex items-center gap-4 bezel transition-transform duration-500 hover:-translate-x-1" style={{ transitionTimingFunction: "cubic-bezier(0.32,0.72,0,1)" }}>
                    <div className="bezel-core glass flex w-full items-center gap-4 p-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/60 text-gold"><r.icon size={20} strokeWidth={1.5} /></span><div className="flex-1"><h3 className="font-extrabold text-ink">{r.t}</h3><p className="text-sm text-ink-soft">{r.d}</p></div><ArrowLeft size={18} className="text-ink-muted" /></div>
                  </Link>
                ) : (
                  <button onClick={r.action} className="group flex w-full items-center gap-4 bezel text-right transition-transform duration-500 hover:-translate-x-1" style={{ transitionTimingFunction: "cubic-bezier(0.32,0.72,0,1)" }}>
                    <div className="bezel-core glass flex w-full items-center gap-4 p-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/60 text-gold"><r.icon size={20} strokeWidth={1.5} /></span><div className="flex-1"><h3 className="font-extrabold text-ink">{r.t}</h3><p className="text-sm text-ink-soft">{r.d}</p></div><ArrowLeft size={18} className="text-ink-muted" /></div>
                  </button>
                )}
              </StaggerItem>
            ))}
          </Stagger>
          <Reveal delay={0.1}><Illustration name="dashboard/hero-future.png" icon={Sparkles} alt="مستقبلك المشرق" ratio="3 / 2" /></Reveal>
        </div>
      </section>

      {/* ════ 15 · DASHBOARD FOOTER ════ */}
      <footer className="bezel">
        <div className="bezel-core glass-strong p-8">
          <div className="flex flex-col items-center gap-6 text-center">
            <Float amount={6} duration={7}><BrandLogo size="sm" /></Float>
            <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm font-semibold text-ink-soft">
              <Link href="/high-school" className="hover:text-gold">الاختبارات</Link>
              <Link href="/community" className="hover:text-gold">المجتمع</Link>
              <Link href="/subscriptions" className="hover:text-gold">النخبة</Link>
              <Link href="/reviews" className="hover:text-gold">الآراء</Link>
              <Link href="/faq" className="hover:text-gold">الأسئلة</Link>
              <Link href="/support" className="hover:text-gold">الدعم الفني</Link>
              <Link href="/settings" className="hover:text-gold">الإعدادات</Link>
            </div>
            <p className="text-xs text-ink-muted">© 2026 منصة جزيرة التعليمية — صُنع بشغف لمستقبلك.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
