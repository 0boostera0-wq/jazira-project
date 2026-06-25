"use client";

import Link from "next/link";
import { Instagram, Twitter, Youtube, Send } from "lucide-react";
import BrandLogo from "@/components/BrandLogo";
import { Float } from "@/components/motion/Reveal";

const COLS = [
  {
    title: "المنصة",
    links: [
      { label: "المسارات الدراسية", href: "/high-school" },
      { label: "اختبارات القدرات", href: "/high-school" },
      { label: "المجتمع التعليمي", href: "/community" },
      { label: "المسابقات", href: "/competitions" },
      { label: "باقة النخبة", href: "/subscriptions" },
    ],
  },
  {
    title: "الدعم",
    links: [
      { label: "الأسئلة الشائعة", href: "/faq" },
      { label: "الدعم الفني", href: "/support" },
      { label: "عن جزيرة", href: "/about" },
      { label: "آراء الطلبة", href: "/reviews" },
    ],
  },
  {
    title: "الحساب",
    links: [
      { label: "تسجيل الدخول", href: "/sign-in" },
      { label: "إنشاء حساب", href: "/sign-up" },
      { label: "لوحة التحكم", href: "/dashboard" },
      { label: "الإعدادات", href: "/settings" },
    ],
  },
];

const SOCIAL = [
  { Icon: Instagram, href: "#", label: "Instagram" },
  { Icon: Twitter, href: "#", label: "X" },
  { Icon: Youtube, href: "#", label: "YouTube" },
  { Icon: Send, href: "#", label: "Telegram" },
];

export default function SiteFooter() {
  return (
    <footer className="relative mt-24 px-4 pb-10">
      <div className="mx-auto max-w-6xl bezel">
        <div className="bezel-core glass-strong p-8 sm:p-12">
          <div className="grid grid-cols-2 gap-8 md:grid-cols-5">
            {/* Brand */}
            <div className="col-span-2 md:col-span-2">
              <Float amount={6} duration={7}><BrandLogo size="md" /></Float>
              <p className="mt-4 max-w-xs text-sm leading-relaxed text-ink-soft">
                بيئة تعليمية فاخرة ترافق الطالب خطوة بخطوة نحو التفوق — بمسارات ذكية، ومساعد فاخر، ومجتمع ملهم.
              </p>
              <div className="mt-5 flex gap-2">
                {SOCIAL.map(({ Icon, href, label }) => (
                  <a
                    key={label}
                    href={href}
                    aria-label={label}
                    className="grid h-10 w-10 place-items-center rounded-full border border-[rgba(201,168,106,0.3)] bg-white/50 text-ink-soft transition-all duration-300 hover:-translate-y-0.5 hover:text-gold"
                  >
                    <Icon size={17} strokeWidth={1.5} />
                  </a>
                ))}
              </div>
            </div>

            {/* Link columns */}
            {COLS.map((col) => (
              <div key={col.title}>
                <h4 className="mb-3 text-sm font-extrabold text-ink">{col.title}</h4>
                <ul className="space-y-2.5">
                  {col.links.map((l) => (
                    <li key={l.label}>
                      <Link href={l.href} className="text-sm text-ink-soft transition-colors duration-300 hover:text-gold">
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-[rgba(201,168,106,0.25)] pt-6 text-center sm:flex-row sm:text-right">
            <p className="text-xs text-ink-muted">© 2026 منصة جزيرة التعليمية — جميع الحقوق محفوظة.</p>
            <div className="flex gap-4 text-xs text-ink-muted">
              <Link href="/about" className="hover:text-gold">الخصوصية</Link>
              <Link href="/about" className="hover:text-gold">الشروط</Link>
              <Link href="/support" className="hover:text-gold">تواصل معنا</Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
