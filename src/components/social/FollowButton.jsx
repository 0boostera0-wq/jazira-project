"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, BellOff, BellRing, Check, UserPlus, Loader2 } from "lucide-react";
import { useAuthUser } from "@/context/AuthProvider";
import { isFollowing, followUser, unfollowUser, setFollowPref } from "@/lib/social";

const PREFS = [
  { id: "all", label: "كل الإشعارات", Icon: BellRing },
  { id: "posts", label: "منشورات فقط", Icon: Bell },
  { id: "off", label: "إيقاف الإشعارات", Icon: BellOff },
];

// متابعة when not following; once following, becomes a bell that opens the
// notification-preference menu (كل الإشعارات / منشورات فقط / إيقاف الإشعارات).
export default function FollowButton({ authorId, size = "md", onChange }) {
  const { isSignedIn, userId } = useAuthUser();
  const [state, setState] = useState(null); // { following, pref } | null
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    let alive = true;
    if (authorId && userId !== authorId) {
      isFollowing(authorId).then((s) => alive && setState(s));
    }
    return () => { alive = false; };
  }, [authorId, userId]);

  useEffect(() => {
    if (!menu) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setMenu(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menu]);

  // hide for self / signed-out / unknown
  if (!authorId || userId === authorId || state === null) return null;

  const follow = async () => {
    if (!isSignedIn) { window.location.href = "/sign-in?next=" + encodeURIComponent(location.pathname); return; }
    setBusy(true);
    setState({ following: true, pref: "all" }); // optimistic
    const r = await followUser(authorId);
    setBusy(false);
    if (!r.ok) setState({ following: false, pref: null });
    else onChange?.(true);
  };

  const choose = async (pref) => {
    setMenu(false);
    if (pref === "off" && state.pref === "off") return;
    if (pref === "unfollow") {
      setState({ following: false, pref: null });
      await unfollowUser(authorId);
      onChange?.(false);
      return;
    }
    setState((s) => ({ ...s, pref }));
    await setFollowPref(authorId, pref);
  };

  const pad = size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm";

  if (!state.following) {
    return (
      <button
        onClick={follow}
        disabled={busy}
        className={`inline-flex items-center gap-1.5 rounded-full bg-gold-gradient font-bold text-white shadow-gold transition hover:brightness-105 disabled:opacity-60 ${pad}`}
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />} متابعة
      </button>
    );
  }

  const Active = PREFS.find((p) => p.id === state.pref)?.Icon || Bell;
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setMenu((v) => !v)}
        className={`inline-flex items-center gap-1.5 rounded-full glass font-bold text-ink transition hover:bg-white/70 ${pad}`}
        aria-label="إعدادات إشعارات المتابعة"
      >
        <Active size={15} className="text-gold" /> متابَع
      </button>
      <AnimatePresence>
        {menu && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            className="absolute left-0 z-50 mt-2 w-52 overflow-hidden rounded-2xl border border-[rgba(201,168,106,0.3)] bg-white/95 p-1.5 shadow-glass backdrop-blur-xl"
          >
            {PREFS.map((p) => (
              <button
                key={p.id}
                onClick={() => choose(p.id)}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-right text-sm text-ink transition hover:bg-champagne-100/70"
              >
                <p.Icon size={16} className="text-gold" />
                <span className="flex-1">{p.label}</span>
                {state.pref === p.id && <Check size={15} className="text-emerald-600" />}
              </button>
            ))}
            <div className="my-1 h-px bg-champagne-200/70" />
            <button
              onClick={() => choose("unfollow")}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-right text-sm font-semibold text-red-700/80 transition hover:bg-red-50/70"
            >
              <BellOff size={16} /> إلغاء المتابعة
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
