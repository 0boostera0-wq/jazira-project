"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell, Heart, UserPlus, AtSign, Repeat2, MessageCircle, MailQuestion, X, CheckCheck,
} from "lucide-react";
import { createClient } from "@/lib/supabase-client";
import { useAuthUser } from "@/context/AuthProvider";
import Avatar from "@/components/Avatar";
import { timeAgo } from "@/lib/timeAgo";
import { listNotifications, unreadNotificationCount, markNotificationsRead, getSocialSettings } from "@/lib/social";
import { setSoundEnabled, primeAudio, playNotificationSound } from "@/lib/notificationSound";

const TABS = [
  { id: "all", label: "الكل" },
  { id: "like", label: "الإعجابات" },
  { id: "follow", label: "المتابعات" },
  { id: "mention", label: "المنشن" },
  { id: "repost", label: "إعادة النشر" },
  { id: "comment", label: "التعليقات" },
  { id: "message_request", label: "طلبات الرسائل" },
];

const META = {
  like: { Icon: Heart, color: "#E0556B", text: "أعجب بمنشورك" },
  follow: { Icon: UserPlus, color: "#3BA67B", text: "بدأ بمتابعتك" },
  mention: { Icon: AtSign, color: "#6A6AC9", text: "أشار إليك" },
  repost: { Icon: Repeat2, color: "#C9A227", text: "أعاد نشر منشورك" },
  comment: { Icon: MessageCircle, color: "#3B82A6", text: "علّق على منشورك" },
  message_request: { Icon: MailQuestion, color: "#C97B3B", text: "أرسل لك طلب رسالة" },
  request_accepted: { Icon: CheckCheck, color: "#3BA67B", text: "قبل طلب رسالتك" },
  message: { Icon: MessageCircle, color: "#3B82A6", text: "أرسل لك رسالة" },
};

function linkFor(n, actor) {
  if (n.type === "follow") return actor?.username ? `/u/${actor.username}` : "/community";
  if (n.type === "message" || n.type === "message_request" || n.type === "request_accepted") return "/chat";
  return "/community";
}

export default function NotificationBell() {
  const { isSignedIn, userId } = useAuthUser();
  const supabase = useMemo(() => createClient(), []);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("all");
  const [items, setItems] = useState([]);
  const [actors, setActors] = useState({});
  const [unread, setUnread] = useState(0);
  const [burst, setBurst] = useState(false);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef(null);

  // load social sound preference
  useEffect(() => {
    if (!userId) return;
    getSocialSettings(userId).then((s) => setSoundEnabled(s.notif_sound !== false));
  }, [userId]);

  const refreshUnread = useCallback(async () => {
    const c = await unreadNotificationCount();
    setUnread(c);
    return c;
  }, []);

  // initial unread + entry burst (~5s) if there are unseen items
  useEffect(() => {
    if (!isSignedIn) { setUnread(0); return; }
    let alive = true;
    refreshUnread().then((c) => {
      if (alive && c > 0) {
        setBurst(true);
        setTimeout(() => alive && setBurst(false), 5000);
      }
    });
    return () => { alive = false; };
  }, [isSignedIn, refreshUnread]);

  // realtime: new notifications → bump count, burst, sound
  useEffect(() => {
    if (!isSignedIn || !userId) return;
    let channel;
    try {
      channel = supabase
        .channel(`notif:${userId}`)
        .on("postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
          () => {
            setUnread((u) => u + 1);
            setBurst(true);
            setTimeout(() => setBurst(false), 5000);
            playNotificationSound();
            if (open) load(tab);
          })
        .subscribe();
    } catch { /* realtime not available → polling below covers it */ }

    const poll = setInterval(() => { refreshUnread(); }, 45000);
    return () => {
      clearInterval(poll);
      try { channel && supabase.removeChannel(channel); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn, userId, supabase]);

  const fetchActors = useCallback(async (rows) => {
    const ids = [...new Set(rows.map((r) => r.actor_id).filter(Boolean))];
    if (!ids.length) return;
    try {
      let res = await supabase.from("profiles")
        .select("id, username, full_name, avatar_url, is_elite, show_elite_badge, anonymous_community").in("id", ids);
      if (res.error) res = await supabase.from("profiles").select("id, username, full_name, avatar_url").in("id", ids);
      setActors((prev) => ({ ...prev, ...Object.fromEntries((res.data || []).map((p) => [p.id, p])) }));
    } catch {}
  }, [supabase]);

  const load = useCallback(async (t) => {
    setLoading(true);
    const rows = await listNotifications({ type: t });
    setItems(rows);
    await fetchActors(rows);
    setLoading(false);
  }, [fetchActors]);

  const openPanel = async () => {
    primeAudio();
    setOpen(true);
    setBurst(false);
    await load(tab);
    // mark all read
    await markNotificationsRead();
    setUnread(0);
  };

  useEffect(() => { if (open) load(tab); }, [tab, open, load]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false); };
    const onEsc = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onEsc); };
  }, [open]);

  if (!isSignedIn) return null;

  return (
    <div className="fixed right-[4.75rem] top-4 z-40" ref={panelRef}>
      <button
        onClick={() => (open ? setOpen(false) : openPanel())}
        className="relative grid h-12 w-12 place-items-center rounded-2xl glass-strong text-ink transition-transform hover:scale-105"
        aria-label="الإشعارات"
      >
        <motion.span animate={burst ? { rotate: [0, -18, 16, -10, 0] } : {}} transition={{ duration: 0.9 }}>
          <Bell size={22} />
        </motion.span>
        <AnimatePresence>
          {unread > 0 && (
            <motion.span
              initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
              className="absolute -right-1 -top-1 grid min-w-[20px] place-items-center rounded-full bg-gold-gradient px-1.5 text-[11px] font-extrabold text-white shadow-gold"
            >
              {unread > 99 ? "99+" : unread}
            </motion.span>
          )}
        </AnimatePresence>
        {/* entry burst ring */}
        <AnimatePresence>
          {burst && (
            <motion.span
              initial={{ scale: 0.6, opacity: 0.6 }} animate={{ scale: 1.8, opacity: 0 }} exit={{ opacity: 0 }}
              transition={{ duration: 1.4, repeat: 2 }}
              className="pointer-events-none absolute inset-0 rounded-2xl ring-2 ring-gold"
            />
          )}
        </AnimatePresence>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="absolute left-0 mt-3 flex max-h-[78vh] w-[min(92vw,400px)] flex-col overflow-hidden rounded-3xl border border-[rgba(201,168,106,0.3)] bg-white/95 shadow-glass-lg backdrop-blur-xl"
          >
            <div className="flex items-center justify-between px-4 pt-4">
              <h3 className="text-base font-extrabold text-ink">الإشعارات</h3>
              <button onClick={() => setOpen(false)} className="rounded-full p-1.5 text-ink-soft hover:bg-champagne-100"><X size={18} /></button>
            </div>
            {/* tabs */}
            <div className="flex gap-1.5 overflow-x-auto px-3 py-3" style={{ scrollbarWidth: "none" }}>
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition ${
                    tab === t.id ? "bg-gold-gradient text-white shadow-gold" : "glass text-ink-soft hover:text-ink"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {/* list */}
            <div className="min-h-[120px] flex-1 overflow-y-auto px-2 pb-3">
              {loading ? (
                <div className="space-y-2 p-2">
                  {[0, 1, 2].map((i) => <div key={i} className="h-14 animate-pulse rounded-2xl bg-champagne-100/70" />)}
                </div>
              ) : items.length === 0 ? (
                <div className="grid place-items-center px-6 py-12 text-center">
                  <span className="mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-champagne-100 text-gold"><Bell size={26} /></span>
                  <p className="font-bold text-ink">لا توجد إشعارات بعد</p>
                  <p className="mt-1 text-xs text-ink-muted">سيظهر هنا كل تفاعل جديد مع حسابك.</p>
                </div>
              ) : (
                items.map((n) => {
                  const m = META[n.type] || META.like;
                  const actor = actors[n.actor_id];
                  const name = actor?.anonymous_community ? "مجهول" : actor?.full_name || "مستخدم";
                  return (
                    <Link
                      key={n.id}
                      href={linkFor(n, actor)}
                      onClick={() => setOpen(false)}
                      className={`flex items-center gap-3 rounded-2xl p-2.5 transition hover:bg-champagne-100/60 ${n.read ? "" : "bg-champagne-50"}`}
                    >
                      <div className="relative shrink-0">
                        <Avatar src={actor?.anonymous_community ? null : actor?.avatar_url} name={name} size={42} />
                        <span className="absolute -bottom-1 -left-1 grid h-5 w-5 place-items-center rounded-full text-white" style={{ background: m.color }}>
                          <m.Icon size={11} />
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-ink"><b className="font-extrabold">{name}</b> {m.text}</p>
                        <p className="text-[11px] text-ink-muted">{timeAgo(n.created_at)}</p>
                      </div>
                      {!n.read && <span className="h-2 w-2 shrink-0 rounded-full bg-gold" />}
                    </Link>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
