"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Send, MessageCircle, Inbox, ChevronRight, Loader2, Mic, ImagePlus, Languages, Check, CheckCheck } from "lucide-react";
import { createClient } from "@/lib/supabase-client";
import { useAuthUser } from "@/context/AuthProvider";
import Avatar from "@/components/Avatar";
import { timeAgo } from "@/lib/timeAgo";

export default function ChatPage() {
  const { isLoaded, isSignedIn, userId } = useAuthUser();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [tab, setTab] = useState("chats"); // chats | requests
  const [convos, setConvos] = useState([]);
  const [requests, setRequests] = useState([]);
  const [active, setActive] = useState(null); // { conversation_id, other }
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);

  // auth gate
  useEffect(() => {
    if (isLoaded && !isSignedIn) router.replace("/sign-in?next=/chat");
  }, [isLoaded, isSignedIn, router]);

  // load conversations + requests (resilient to missing tables before migration)
  const loadInbox = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const { data: parts } = await supabase.from("conversation_participants")
        .select("conversation_id, last_read_at").eq("user_id", userId);
      const ids = (parts || []).map((p) => p.conversation_id);
      let convRows = [];
      if (ids.length) {
        const { data: convs } = await supabase.from("conversations").select("*").in("id", ids).order("last_message_at", { ascending: false, nullsFirst: false });
        const { data: others } = await supabase.from("conversation_participants")
          .select("conversation_id, user_id").in("conversation_id", ids).neq("user_id", userId);
        const otherIds = [...new Set((others || []).map((o) => o.user_id))];
        const profMap = otherIds.length ? Object.fromEntries(
          ((await supabase.from("profiles").select("id, username, full_name, avatar_url, is_elite").in("id", otherIds)).data || []).map((p) => [p.id, p])
        ) : {};
        const otherByConv = Object.fromEntries((others || []).map((o) => [o.conversation_id, profMap[o.user_id]]));
        convRows = (convs || []).map((c) => ({ ...c, other: otherByConv[c.id] }));
      }
      setConvos(convRows.filter((c) => !c.is_request));
      const { data: reqs } = await supabase.from("message_requests")
        .select("*").eq("recipient_id", userId).eq("status", "pending").order("created_at", { ascending: false });
      setRequests(reqs || []);
    } catch { /* tables not migrated yet */ }
    setLoading(false);
  }, [supabase, userId]);

  useEffect(() => { if (userId) loadInbox(); }, [userId, loadInbox]);

  // open a thread
  const openThread = useCallback(async (conversation_id, other) => {
    setActive({ conversation_id, other });
    try {
      const { data } = await supabase.from("messages").select("*").eq("conversation_id", conversation_id).order("created_at", { ascending: true }).limit(200);
      setMessages(data || []);
      await supabase.from("conversation_participants").update({ last_read_at: new Date().toISOString() }).eq("conversation_id", conversation_id).eq("user_id", userId);
    } catch { setMessages([]); }
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, [supabase, userId]);

  // realtime for the active thread
  useEffect(() => {
    if (!active?.conversation_id) return;
    let ch;
    try {
      ch = supabase.channel(`thread:${active.conversation_id}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${active.conversation_id}` },
          (payload) => { setMessages((m) => [...m, payload.new]); setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 30); })
        .subscribe();
    } catch {}
    return () => { try { ch && supabase.removeChannel(ch); } catch {} };
  }, [active?.conversation_id, supabase]);

  const send = async () => {
    const body = text.trim();
    if (!body || !active?.conversation_id) return;
    setSending(true);
    setText("");
    try {
      const { data, error } = await supabase.from("messages")
        .insert({ conversation_id: active.conversation_id, sender_id: userId, content: body }).select().single();
      if (!error && data) setMessages((m) => [...m, data]);
      await supabase.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", active.conversation_id);
    } catch {}
    setSending(false);
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 30);
  };

  if (!isLoaded) return <div className="mx-auto max-w-4xl"><div className="h-[70vh] animate-pulse rounded-3xl bg-champagne-100/70" /></div>;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-5">
        <h1 className="text-2xl font-extrabold text-ink">الدردشة</h1>
        <p className="text-sm text-ink-soft">رسائلك الخاصة داخل منصة جزيرة.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-[320px_1fr]">
        {/* inbox */}
        <div className="bezel md:sticky md:top-20 md:self-start">
          <div className="bezel-core glass-strong flex h-[72vh] flex-col p-3">
            <div className="mb-3 flex gap-1.5 rounded-2xl bg-white/50 p-1">
              <button onClick={() => setTab("chats")} className={`flex-1 rounded-xl px-3 py-2 text-sm font-bold transition ${tab === "chats" ? "bg-gold-gradient text-white shadow-gold" : "text-ink-soft"}`}>
                المحادثات
              </button>
              <button onClick={() => setTab("requests")} className={`relative flex-1 rounded-xl px-3 py-2 text-sm font-bold transition ${tab === "requests" ? "bg-gold-gradient text-white shadow-gold" : "text-ink-soft"}`}>
                طلبات الرسائل
                {requests.length > 0 && <span className="absolute -top-1 left-1 grid h-5 min-w-[20px] place-items-center rounded-full bg-[#C97B3B] px-1 text-[10px] font-extrabold text-white">{requests.length}</span>}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="space-y-2 p-1">{[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-champagne-100/70" />)}</div>
              ) : tab === "chats" ? (
                convos.length === 0 ? (
                  <EmptyInbox icon={MessageCircle} title="لا توجد محادثات بعد" sub="ابدأ محادثة من ملف أي مستخدم عبر زر «رسالة»." />
                ) : (
                  convos.map((c) => (
                    <button key={c.id} onClick={() => openThread(c.id, c.other)}
                      className={`flex w-full items-center gap-3 rounded-2xl p-2.5 text-right transition hover:bg-champagne-100/60 ${active?.conversation_id === c.id ? "bg-champagne-100/70" : ""}`}>
                      <Avatar src={c.other?.avatar_url} name={c.other?.full_name || "مستخدم"} size={44} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-bold text-ink">{c.other?.full_name || "مستخدم"}</p>
                        <p className="truncate text-xs text-ink-muted">{c.last_message_at ? timeAgo(c.last_message_at) : "محادثة جديدة"}</p>
                      </div>
                      <ChevronRight size={16} className="text-ink-muted" />
                    </button>
                  ))
                )
              ) : requests.length === 0 ? (
                <EmptyInbox icon={Inbox} title="لا توجد طلبات" sub="ستظهر هنا طلبات الرسائل الجديدة." />
              ) : (
                requests.map((r) => (
                  <div key={r.id} className="rounded-2xl bg-white/60 p-3">
                    <p className="text-sm font-bold text-ink">طلب رسالة جديد</p>
                    <p className="mt-0.5 text-xs text-ink-muted">{timeAgo(r.created_at)}</p>
                    <div className="mt-2 flex gap-2">
                      <button className="flex-1 rounded-xl bg-gold-gradient py-1.5 text-xs font-bold text-white">قبول</button>
                      <button className="flex-1 rounded-xl glass py-1.5 text-xs font-bold text-ink">تجاهل</button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* thread */}
        <div className="bezel">
          <div className="bezel-core glass flex h-[72vh] flex-col p-0">
            {!active ? (
              <div className="grid flex-1 place-items-center px-6 text-center">
                <div>
                  <span className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-3xl bg-champagne-100 text-gold"><MessageCircle size={30} /></span>
                  <p className="font-extrabold text-ink">اختر محادثة</p>
                  <p className="mt-1 text-sm text-ink-muted">اختر محادثة من القائمة لعرض الرسائل.</p>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 border-b border-champagne-200/60 p-3">
                  <Avatar src={active.other?.avatar_url} name={active.other?.full_name || "مستخدم"} size={40} />
                  <p className="font-extrabold text-ink">{active.other?.full_name || "مستخدم"}</p>
                </div>
                <div className="flex-1 space-y-2 overflow-y-auto p-4">
                  {messages.length === 0 ? (
                    <p className="mt-10 text-center text-sm text-ink-muted">لا توجد رسائل بعد — أرسل أول رسالة.</p>
                  ) : messages.map((m) => {
                    const mine = m.sender_id === userId;
                    return (
                      <div key={m.id} className={`flex ${mine ? "justify-start" : "justify-end"}`}>
                        <div className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm ${mine ? "bg-gold-gradient text-white" : "glass text-ink"}`}>
                          <p className="whitespace-pre-wrap break-words">{m.deleted_for_all ? "🚫 تم حذف الرسالة" : m.content}</p>
                          <span className={`mt-0.5 flex items-center gap-1 text-[10px] ${mine ? "text-white/70" : "text-ink-muted"}`}>
                            {timeAgo(m.created_at)} {mine && (m.read_at ? <CheckCheck size={12} /> : <Check size={12} />)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={endRef} />
                </div>
                {/* composer */}
                <div className="border-t border-champagne-200/60 p-3">
                  <div className="flex items-end gap-2">
                    <button title="مرفق (قيد الإكمال)" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl glass text-ink-soft opacity-60"><ImagePlus size={18} /></button>
                    <button title="رسالة صوتية (قيد الإكمال)" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl glass text-ink-soft opacity-60"><Mic size={18} /></button>
                    <textarea
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                      rows={1}
                      placeholder="اكتب رسالة…"
                      className="max-h-32 flex-1 resize-none rounded-2xl bg-white/70 px-4 py-2.5 text-sm text-ink outline-none placeholder:text-ink-muted"
                    />
                    <button onClick={send} disabled={sending || !text.trim()} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gold-gradient text-white shadow-gold disabled:opacity-50">
                      {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={17} />}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <p className="mt-4 text-center text-xs text-ink-muted">
        الرسائل النصية واستقبالها الفوري مفعّلة. الرسائل الصوتية والوسائط والترجمة وقواعد الحذف قيد الإكمال.
      </p>
    </div>
  );
}

function EmptyInbox({ icon: Icon, title, sub }) {
  return (
    <div className="grid place-items-center px-4 py-14 text-center">
      <span className="mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-champagne-100 text-gold"><Icon size={26} /></span>
      <p className="font-bold text-ink">{title}</p>
      <p className="mt-1 text-xs text-ink-muted">{sub}</p>
    </div>
  );
}
