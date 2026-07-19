"use client";

import { m, useReducedMotion } from "framer-motion";
import { BarChart3, LogIn } from "lucide-react";
import { Float } from "@/components/motion/Reveal";
import { useAuthUser } from "@/context/AuthProvider";
import { useStreak } from "@/hooks/useStreak";

// Premium GPU-friendly animated flame — subtle flicker + inner glow.
// Static under reduced-motion. Pure transform/opacity so it stays cheap.
export function AnimatedFlame({ size = 22 }) {
  const reduce = useReducedMotion();
  const flicker = reduce
    ? {}
    : { scaleY: [1, 1.12, 0.96, 1.08, 1], scaleX: [1, 0.96, 1.04, 0.98, 1], opacity: [0.9, 1, 0.92, 1, 0.9] };
  return (
    <span className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      {/* glow halo */}
      {!reduce && (
        <m.span
          aria-hidden
          className="absolute inset-0 rounded-full"
          style={{ background: "radial-gradient(circle, rgba(224,121,59,0.55), transparent 68%)", willChange: "transform, opacity" }}
          animate={{ scale: [1, 1.25, 1], opacity: [0.5, 0.85, 0.5] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        />
      )}
      <m.svg
        width={size} height={size} viewBox="0 0 24 24" fill="none"
        style={{ transformOrigin: "50% 100%", willChange: "transform, opacity" }}
        animate={flicker}
        transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
      >
        <defs>
          <linearGradient id="flameGrad" x1="12" y1="2" x2="12" y2="22" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FFD27A" />
            <stop offset="0.5" stopColor="#F5A03B" />
            <stop offset="1" stopColor="#E0562B" />
          </linearGradient>
        </defs>
        <path
          d="M12 2c2.4 3 3.2 5 2 7 2.6-.4 3.4-2.2 3.4-2.2C19.6 9 20.5 11.6 20.5 14a8.5 8.5 0 1 1-17 0c0-3 1.6-5.6 3.9-7.3C7.2 8 8.6 8.6 9.5 8 8.2 5.6 9.2 3.7 12 2Z"
          fill="url(#flameGrad)"
        />
        {/* inner bright core */}
        <m.path
          d="M12 12c1.5 1.4 2 2.7 1.3 4A3.3 3.3 0 0 1 12 22a3.4 3.4 0 0 1-1.6-6.4C11 14.6 11.3 13.4 12 12Z"
          fill="#FFF3D6"
          animate={reduce ? {} : { opacity: [0.75, 1, 0.75] }}
          transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
        />
      </m.svg>
    </span>
  );
}

function Card({ children }) {
  return (
    <div className="bezel">
      <div className="bezel-core glass-strong flex items-center gap-2.5 px-3.5 py-2.5 ring-1 ring-[rgba(201,168,106,0.25)]">
        {children}
      </div>
    </div>
  );
}

function Medallion({ children, tone = "rgba(201,168,106,0.16)" }) {
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: tone }}>
      {children}
    </span>
  );
}

// The two floating hero cards — now correct for guests vs authenticated users.
// Guests see an elegant invitation (no fabricated numbers). Signed-in users see
// their REAL streak (persisted via record_daily_activity) and a weekly-progress
// value derived from that real activity (0 for brand-new accounts).
export default function HeroStats() {
  const { isSignedIn, userId } = useAuthUser();
  const { streak } = useStreak(isSignedIn ? userId : null);
  // Show real numbers ONLY when actually signed in. While auth is still loading
  // (and for guests) show the elegant invitation — never a fake "0 يوم".
  const guest = !isSignedIn;
  const pct = Math.min(100, Math.round((Math.min(streak, 7) / 7) * 100));

  return (
    <>
      <Float amount={12} duration={6} className="absolute -left-3 top-5 hidden md:block">
        <Card>
          <Medallion tone="rgba(224,121,59,0.14)"><AnimatedFlame size={20} /></Medallion>
          {guest ? (
            <div className="max-w-[11.5rem]">
              <p className="text-[12px] font-bold leading-snug text-ink">سجّل دخولك لبدء سلسلتك اليومية</p>
              <p className="mt-0.5 flex items-center gap-1 text-[10px] font-semibold text-gold"><LogIn size={11} /> ابدأ الآن</p>
            </div>
          ) : (
            <div>
              <p className="text-sm font-extrabold text-ink ltr-nums">{streak} يوم</p>
              <p className="text-[11px] text-ink-soft">سلسلة يومية</p>
            </div>
          )}
        </Card>
      </Float>

      <Float amount={10} duration={7} delay={0.6} className="absolute -bottom-4 right-3 hidden md:block">
        <Card>
          <Medallion tone="linear-gradient(135deg,#E6C77E,#B8923F)"><BarChart3 size={17} className="text-white" /></Medallion>
          {guest ? (
            <div className="max-w-[11.5rem]">
              <p className="text-[12px] font-bold leading-snug text-ink">سجّل دخولك لمتابعة تقدّمك هذا الأسبوع</p>
              <p className="mt-0.5 flex items-center gap-1 text-[10px] font-semibold text-gold"><LogIn size={11} /> ابدأ الآن</p>
            </div>
          ) : (
            <div>
              <p className="text-sm font-extrabold text-ink ltr-nums">{pct}٪</p>
              <p className="text-[11px] text-ink-soft">تقدّمك هذا الأسبوع</p>
            </div>
          )}
        </Card>
      </Float>
    </>
  );
}
