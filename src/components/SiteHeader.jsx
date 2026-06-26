"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import BrandLogo from "@/components/BrandLogo";
import { EASE } from "@/components/motion/Reveal";

const LINKS = [
  { label: "المنصة", href: "/#features" },
  { label: "المساعد الذكي", href: "/#ai" },
  { label: "المناهج والمصادر", href: "/curriculum" },
  { label: "المسارات", href: "/#paths" },
  { label: "الباقات", href: "/subscriptions" },
  { label: "الأسئلة", href: "/faq" },
];

export default function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Floating glass pill — detached from the top, centred */}
      <header className="pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center px-4 pt-5">
        <nav className="pointer-events-auto flex w-full max-w-4xl items-center justify-between gap-4 rounded-full border border-[rgba(201,168,106,0.28)] bg-white/65 px-3 py-2 shadow-[0_10px_40px_rgba(160,130,70,0.12)] backdrop-blur-2xl">
          <Link href="/" className="shrink-0 pr-2"><BrandLogo size="sm" /></Link>

          <div className="hidden items-center gap-1 md:flex">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="rounded-full px-3.5 py-2 text-sm font-semibold text-ink-soft transition-colors duration-300 hover:bg-white/60 hover:text-ink"
              >
                {l.label}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Link href="/sign-in" className="hidden rounded-full px-4 py-2 text-sm font-bold text-ink transition-colors hover:bg-white/60 sm:inline-flex">
              دخول
            </Link>
            <Link href="/dashboard" className="cta-lux !px-3 !py-2 !text-sm">
              ابدأ الآن
              <span className="cta-puck"><ArrowLeft size={15} /></span>
            </Link>

            {/* Hamburger → X morph (mobile) */}
            <button
              onClick={() => setOpen((v) => !v)}
              className="relative grid h-10 w-10 place-items-center rounded-full hover:bg-white/60 md:hidden"
              aria-label="القائمة"
            >
              <span className={`absolute h-[2px] w-5 rounded-full bg-ink transition-all duration-500 ${open ? "rotate-45" : "-translate-y-1.5"}`} style={{ transitionTimingFunction: "cubic-bezier(0.32,0.72,0,1)" }} />
              <span className={`absolute h-[2px] w-5 rounded-full bg-ink transition-all duration-300 ${open ? "opacity-0" : "opacity-100"}`} />
              <span className={`absolute h-[2px] w-5 rounded-full bg-ink transition-all duration-500 ${open ? "-rotate-45" : "translate-y-1.5"}`} style={{ transitionTimingFunction: "cubic-bezier(0.32,0.72,0,1)" }} />
            </button>
          </div>
        </nav>
      </header>

      {/* Full-screen glass overlay (mobile) with staggered reveal */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: EASE }}
            className="fixed inset-0 z-30 flex flex-col items-center justify-center gap-2 bg-white/80 backdrop-blur-3xl md:hidden"
            onClick={() => setOpen(false)}
          >
            {[...LINKS, { label: "تسجيل الدخول", href: "/sign-in" }].map((l, i) => (
              <motion.div
                key={l.href}
                initial={{ opacity: 0, y: 28 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 12 }}
                transition={{ delay: 0.06 + i * 0.06, duration: 0.5, ease: EASE }}
              >
                <Link href={l.href} className="text-2xl font-extrabold text-ink" onClick={() => setOpen(false)}>
                  {l.label}
                </Link>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
