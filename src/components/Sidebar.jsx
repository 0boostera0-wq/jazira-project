"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Home,
  BookOpen,
  GraduationCap,
  Users,
  Trophy,
  Info,
  Star,
  HelpCircle,
  Headphones,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronDown,
  Crown,
} from "lucide-react";
import { NAV_SECTIONS } from "@/lib/constants";
import { useAuthUser } from "@/context/AuthProvider";
import { useApp } from "@/context/AppContext";
import DefaultAvatar from "./DefaultAvatar";
import Avatar from "./Avatar";
import GoldBadge from "./GoldBadge";
import BrandLogo from "./BrandLogo";

const ICONS = {
  Home,
  BookOpen,
  GraduationCap,
  Users,
  Trophy,
  Info,
  Star,
  HelpCircle,
  Headphones,
  Settings,
  Crown,
};

export default function Sidebar() {
  const [open, setOpen] = useState(false);
  const [tracksOpen, setTracksOpen] = useState(true);
  const pathname = usePathname();
  const router = useRouter();
  const { isLoaded, isSignedIn, name, imageUrl, signOut } = useAuthUser();
  const { isElite } = useApp();

  const close = () => setOpen(false);

  const go = (href) => {
    router.push(href);
    close();
  };

  const handleSignIn = () => {
    close();
    router.push("/sign-in");
  };

  const handleSignOut = async () => {
    close();
    await signOut();
    router.refresh();
    router.push("/");
  };

  const isActive = (href) =>
    href && (pathname === href || (href !== "/dashboard" && pathname.startsWith(href)));

  return (
    <>
      {/* Hamburger — fixed top-right (RTL) */}
      <button
        onClick={() => setOpen(true)}
        className="glass-strong fixed right-4 top-4 z-40 flex h-12 w-12 items-center justify-center rounded-2xl text-ink transition-transform hover:scale-105"
        aria-label="فتح القائمة"
      >
        <Menu size={24} />
      </button>

      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={close}
              className="fixed inset-0 z-40 bg-ink/25 backdrop-blur-sm"
            />

            {/* Drawer (right side, RTL) */}
            <motion.aside
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 32 }}
              className="glass-strong fixed right-0 top-0 z-50 flex h-full w-[86vw] max-w-[340px] flex-col overflow-hidden rounded-l-3xl"
            >
              {/* Header / brand — name then emoji in HTML = emoji after name visually in RTL */}
              <div className="flex items-center justify-between px-5 pt-5">
                <BrandLogo size="sm" />
                <button
                  onClick={close}
                  className="rounded-full p-1.5 text-ink-soft hover:bg-white/40"
                  aria-label="إغلاق"
                >
                  <X size={22} />
                </button>
              </div>

              {/* Profile card */}
              <div className="px-5 pt-4">
                <div
                  className="flex items-center gap-3 rounded-3xl bg-white/55 p-3.5"
                  style={{ border: "1px solid rgba(201,168,106,0.35)" }}
                >
                  {!isLoaded ? (
                    <span className="h-14 w-14 shrink-0 animate-pulse rounded-full bg-champagne-100" />
                  ) : isSignedIn ? (
                    <Avatar src={imageUrl} name={name} size={56} />
                  ) : (
                    <DefaultAvatar size={56} />
                  )}

                  <div className="min-w-0 flex-1">
                    {!isLoaded ? (
                      /* Loading skeleton — never flash the guest CTA to a logged-in user */
                      <div className="space-y-2">
                        <span className="block h-4 w-28 animate-pulse rounded bg-champagne-100" />
                        <span className="block h-3 w-20 animate-pulse rounded bg-champagne-100" />
                      </div>
                    ) : isSignedIn ? (
                      <>
                        <div className="flex items-center gap-1.5">
                          <p className="truncate font-extrabold text-ink">
                            {name || "مستخدم جزيرة"}
                          </p>
                          {isElite && <GoldBadge />}
                        </div>
                        <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-gold-gradient px-2 py-0.5 text-[11px] font-bold text-white">
                          <Crown size={11} /> المستوى الذهبي
                        </span>
                      </>
                    ) : (
                      <>
                        <p className="font-extrabold text-ink">زائر مجهول</p>
                        <button
                          onClick={handleSignIn}
                          className="btn-gold mt-2 w-full px-3 py-2 text-sm"
                        >
                          تسجيل الدخول / إنشاء حساب
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Navigation */}
              <nav className="mt-4 flex-1 overflow-y-auto px-3 pb-4">
                {NAV_SECTIONS.map((section) => (
                  <div key={section.title} className="mb-2">
                    <p className="px-3 py-2 text-xs font-bold text-ink-muted">
                      {section.title}
                    </p>

                    {section.items.map((item) => {
                      const Icon = ICONS[item.icon] || Home;

                      if (item.accordion) {
                        return (
                          <div key={item.key}>
                            <button
                              onClick={() => setTracksOpen((v) => !v)}
                              className="flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-3 text-right text-ink transition-colors hover:bg-champagne-100/70"
                            >
                              <span className="flex items-center gap-3">
                                <Icon size={20} className="text-champagne-500" />
                                <span className="font-semibold">{item.label}</span>
                              </span>
                              <motion.span animate={{ rotate: tracksOpen ? 180 : 0 }}>
                                <ChevronDown size={18} className="text-ink-muted" />
                              </motion.span>
                            </button>

                            <AnimatePresence initial={false}>
                              {tracksOpen && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: "auto", opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.25 }}
                                  className="overflow-hidden"
                                >
                                  <div className="mr-5 border-r-2 border-champagne-200 pr-2">
                                    {item.accordion.map((sub) => (
                                      <button
                                        key={sub.href}
                                        onClick={() => go(sub.href)}
                                        className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-right text-sm transition-colors hover:bg-champagne-100/70 ${
                                          isActive(sub.href)
                                            ? "font-bold text-gold-dark"
                                            : "text-ink-soft"
                                        }`}
                                      >
                                        <span className="h-1.5 w-1.5 rounded-full bg-champagne-400" />
                                        {sub.label}
                                      </button>
                                    ))}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      }

                      return (
                        <button
                          key={item.key}
                          onClick={() => go(item.href)}
                          className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-right transition-all ${
                            isActive(item.href)
                              ? "bg-gold-gradient font-bold text-white shadow-gold"
                              : "text-ink hover:bg-champagne-100/70"
                          }`}
                        >
                          <Icon
                            size={20}
                            className={isActive(item.href) ? "text-white" : "text-champagne-500"}
                          />
                          <span className="font-semibold">{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </nav>

              {isSignedIn && (
                <div className="border-t border-champagne-200/60 p-4">
                  <button
                    onClick={handleSignOut}
                    className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 font-semibold text-red-700/80 transition-colors hover:bg-red-50/70"
                  >
                    <LogOut size={20} />
                    تسجيل الخروج
                  </button>
                </div>
              )}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
