"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  Bot,
  Send,
  X,
  Sparkles,
  Clock,
  Crown,
  Menu,
  Plus,
  Search,
  Trash2,
  HelpCircle,
  MessageSquare,
  Mic,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import RobotMascot from "./RobotMascot";
import IslandBackdrop from "./IslandBackdrop";
import ChatMascots from "./ChatMascots";
import { useApp } from "@/context/AppContext";
import { useAuthUser } from "@/context/AuthProvider";
import { useAiUsage, formatCountdown } from "@/hooks/useAiUsage";
import { supportWhatsAppUrl } from "@/lib/constants";
import { FAQ_GROUPS } from "@/lib/faq";
import {
  listConversations,
  upsertConversation,
  deleteConversation,
  searchConversations,
  newId,
} from "@/lib/chatStore";

const GREETING = "مرحباً بك في منصة جزيرة! كيف أقدر أساعدك اليوم؟ 🏝️";
const greetingMsg = () => ({ role: "assistant", content: GREETING });

const QUICK_PROMPTS = ["أين اختبار القدرات؟", "اشرح لي التناظر اللفظي", "كيف أشترك في باقة النخبة؟"];

// Turn [نص](/path) into interactive in-app navigation buttons.
function renderRichText(text, onNavigate) {
  const parts = [];
  const regex = /\[([^\]]+)\]\((\/[^)\s]*)\)/g;
  let lastIndex = 0;
  let m;
  let key = 0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > lastIndex) parts.push(<span key={key++}>{text.slice(lastIndex, m.index)}</span>);
    const label = m[1];
    const href = m[2];
    parts.push(
      <button
        key={key++}
        onClick={() => onNavigate(href)}
        className="mx-0.5 my-1 inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-sm font-bold text-white shadow-gold transition-transform hover:-translate-y-0.5"
        style={{ background: "linear-gradient(135deg,#E6C77E,#C9A86A,#B8923F)" }}
      >
        <Sparkles size={14} />
        {label}
      </button>
    );
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) parts.push(<span key={key++}>{text.slice(lastIndex)}</span>);
  return parts;
}

export default function AIAssistant() {
  const router = useRouter();
  const { isElite } = useApp();
  const { userId } = useAuthUser();
  const usage = useAiUsage(isElite, userId);

  const [open, setOpen] = useState(false);
  const [view, setView] = useState("chat"); // "chat" | "history" | "faq"
  const [messages, setMessages] = useState([greetingMsg()]);
  const [activeId, setActiveId] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [search, setSearch] = useState("");
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [openFaq, setOpenFaq] = useState(null);

  const endRef = useRef(null);
  const recRef = useRef(null);

  // Refresh the conversation list (per user).
  const refreshList = useCallback(() => {
    setConversations(listConversations(userId));
  }, [userId]);

  useEffect(() => {
    if (open) refreshList();
  }, [open, userId, refreshList]);

  // Auto-scroll on new content.
  useEffect(() => {
    if (view === "chat") endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading, open, view]);

  // Persist the active conversation whenever it has real content.
  const persist = useCallback(
    (msgs, id) => {
      const hasUser = msgs.some((m) => m.role === "user");
      if (!hasUser) return id;
      const cid = id || newId();
      upsertConversation(userId, { id: cid, messages: msgs });
      refreshList();
      return cid;
    },
    [userId, refreshList]
  );

  const navigate = (href) => {
    setOpen(false);
    router.push(href);
  };

  const startNewChat = () => {
    setMessages([greetingMsg()]);
    setActiveId(null);
    setView("chat");
    setInput("");
  };

  const openConversation = (c) => {
    setMessages(c.messages);
    setActiveId(c.id);
    setView("chat");
  };

  const removeConversation = (id, e) => {
    e?.stopPropagation();
    deleteConversation(userId, id);
    if (id === activeId) startNewChat();
    refreshList();
  };

  // ---- Voice input (speech -> text only; never auto-sends, robot never speaks) ----
  const toggleMic = () => {
    const SR =
      typeof window !== "undefined" &&
      (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (!SR) {
      alert("التعرّف على الصوت غير مدعوم في هذا المتصفح. جرّب Chrome.");
      return;
    }
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = new SR();
    rec.lang = "ar-SA";
    rec.interimResults = true;
    rec.continuous = false;
    let base = input ? input + " " : "";
    rec.onresult = (e) => {
      let txt = "";
      for (let i = 0; i < e.results.length; i++) txt += e.results[i][0].transcript;
      setInput(base + txt); // fill the field; user reviews before sending
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    try {
      rec.start();
    } catch {
      setListening(false);
    }
  };

  async function send(text) {
    const content = (text ?? input).trim();
    if (!content || isLoading) return;
    if (!usage.consume()) return; // freemium gate

    const userMsg = { role: "user", content };
    const history = [...messages, userMsg];
    const withPlaceholder = [...history, { role: "assistant", content: "" }];
    setMessages(withPlaceholder);
    setInput("");
    setIsLoading(true);

    let convoId = activeId;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });

      if (!res.body) throw new Error("no stream");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: "assistant", content: acc };
          return next;
        });
      }
      const finalMsgs = [...history, { role: "assistant", content: acc }];
      convoId = persist(finalMsgs, convoId);
      setActiveId(convoId);
    } catch {
      const errMsgs = [
        ...history,
        { role: "assistant", content: "عذرًا، حدث خطأ أثناء الاتصال. حاول مرة أخرى 🙏" },
      ];
      setMessages(errMsgs);
      convoId = persist(errMsgs, convoId);
      setActiveId(convoId);
    } finally {
      setIsLoading(false);
    }
  }

  const filteredConvos = search ? searchConversations(userId, search) : conversations;

  return (
    <>
      {/* Floating launcher — bottom-left */}
      <motion.button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-6 left-6 z-50 flex h-16 w-16 items-center justify-center rounded-full text-white shadow-gold"
        style={{ background: "linear-gradient(135deg,#E6C77E,#C9A86A,#B8923F)" }}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.94 }}
        animate={{ y: [0, -6, 0] }}
        transition={{ y: { duration: 3, repeat: Infinity, ease: "easeInOut" } }}
        aria-label="المساعد الذكي"
      >
        {open ? <X size={26} /> : <Bot size={28} />}
        {!open && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold opacity-60" />
            <span className="relative inline-flex h-4 w-4 rounded-full bg-gold" />
          </span>
        )}
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.92 }}
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
            className="glass-strong fixed bottom-24 left-6 z-50 flex h-[600px] max-h-[80vh] w-[94vw] max-w-[420px] flex-col overflow-hidden rounded-3xl"
          >
            {/* Header */}
            <div
              className="relative z-10 flex items-center gap-2 px-3 py-3"
              style={{
                background: "linear-gradient(135deg, rgba(230,199,126,0.4), rgba(201,168,106,0.28))",
                borderBottom: "1px solid rgba(201,168,106,0.35)",
              }}
            >
              <button
                onClick={() => setView(view === "history" ? "chat" : "history")}
                className="rounded-xl p-2 text-ink transition-colors hover:bg-white/40"
                aria-label="المحادثات السابقة"
                title="المحادثات السابقة"
              >
                <Menu size={20} />
              </button>

              <RobotMascot isThinking={isLoading} size={44} />
              <div className="flex-1">
                <h3 className="text-sm font-extrabold text-ink">المساعد الذكي</h3>
                <p className="flex items-center gap-1 text-[11px] text-ink-soft">
                  {isLoading ? "يفكّر الآن..." : "متصل ومستعد لمساعدتك"}
                  {isElite && <Crown size={11} className="text-gold" />}
                </p>
              </div>

              <button
                onClick={() => setView(view === "faq" ? "chat" : "faq")}
                className="rounded-xl p-2 text-ink transition-colors hover:bg-white/40"
                aria-label="الأسئلة الشائعة"
                title="الأسئلة الشائعة"
              >
                <HelpCircle size={20} />
              </button>
              <button
                onClick={startNewChat}
                className="rounded-xl p-2 text-ink transition-colors hover:bg-white/40"
                aria-label="محادثة جديدة"
                title="محادثة جديدة"
              >
                <Plus size={20} />
              </button>
              <button
                onClick={() => setOpen(false)}
                className="rounded-xl p-2 text-ink-soft transition-colors hover:bg-white/40"
                aria-label="إغلاق"
              >
                <X size={18} />
              </button>
            </div>

            {/* ===== HISTORY VIEW (three-line menu) ===== */}
            {view === "history" && (
              <div className="relative z-10 flex flex-1 flex-col overflow-hidden">
                <div className="border-b border-champagne-200/60 p-3">
                  <div className="flex items-center gap-2 rounded-2xl bg-white/70 px-3" style={{ border: "1px solid rgba(201,168,106,0.3)" }}>
                    <Search size={16} className="text-ink-muted" />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="ابحث في المحادثات..."
                      className="flex-1 bg-transparent py-2.5 text-sm outline-none"
                    />
                  </div>
                  <button onClick={startNewChat} className="btn-gold mt-2 flex w-full items-center justify-center gap-2 py-2 text-sm">
                    <Plus size={16} /> محادثة جديدة
                  </button>
                </div>

                <div className="flex-1 space-y-2 overflow-y-auto p-3">
                  <p className="px-1 text-xs font-bold text-ink-muted">
                    المحادثات السابقة {filteredConvos.length ? `(${filteredConvos.length})` : ""}
                  </p>
                  {filteredConvos.length === 0 && (
                    <p className="mt-6 text-center text-sm text-ink-muted">لا توجد محادثات محفوظة بعد.</p>
                  )}
                  {filteredConvos.map((c) => (
                    <div
                      key={c.id}
                      onClick={() => openConversation(c)}
                      className={`group flex cursor-pointer items-center gap-2 rounded-2xl p-3 transition-colors ${
                        c.id === activeId ? "bg-champagne-100" : "bg-white/55 hover:bg-champagne-100/70"
                      }`}
                      style={{ border: "1px solid rgba(201,168,106,0.25)" }}
                    >
                      <MessageSquare size={16} className="shrink-0 text-champagne-500" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink">{c.title}</p>
                        <p className="text-[11px] text-ink-muted">
                          {new Date(c.updatedAt).toLocaleString("ar-SA", { dateStyle: "short", timeStyle: "short" })}
                        </p>
                      </div>
                      <button
                        onClick={(e) => removeConversation(c.id, e)}
                        className="rounded-lg p-1.5 text-ink-muted opacity-0 transition-opacity hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100"
                        aria-label="حذف"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
                {!userId && (
                  <p className="border-t border-champagne-200/60 p-2 text-center text-[11px] text-ink-muted">
                    سجّل الدخول لحفظ محادثاتك بأمان وربطها بحسابك.
                  </p>
                )}
              </div>
            )}

            {/* ===== FAQ VIEW ===== */}
            {view === "faq" && (
              <div className="relative z-10 flex flex-1 flex-col overflow-hidden">
                <div className="flex-1 space-y-2 overflow-y-auto p-3">
                  <p className="px-1 pb-1 text-xs font-bold text-ink-muted">الأسئلة الشائعة</p>
                  {FAQ_GROUPS.map((g, i) => (
                    <div key={i} className="overflow-hidden rounded-2xl bg-white/55" style={{ border: "1px solid rgba(201,168,106,0.25)" }}>
                      <button
                        onClick={() => setOpenFaq(openFaq === i ? null : i)}
                        className="flex w-full items-center justify-between gap-2 p-3 text-right text-sm font-bold text-ink"
                      >
                        <span>{g.q}</span>
                        <motion.span animate={{ rotate: openFaq === i ? 180 : 0 }}>
                          <ChevronDown size={16} className="text-champagne-500" />
                        </motion.span>
                      </button>
                      <AnimatePresence initial={false}>
                        {openFaq === i && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                            <div className="space-y-1.5 px-3 pb-3">
                              {g.subs.map((s, j) => (
                                <details key={j} className="rounded-xl bg-cream-100/70 px-3 py-2">
                                  <summary className="cursor-pointer list-none text-[13px] font-semibold text-ink-soft">
                                    <ChevronRight size={12} className="ml-1 inline" /> {s.q}
                                  </summary>
                                  <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">{s.a}</p>
                                </details>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                </div>
                {/* WhatsApp support */}
                <div className="border-t border-champagne-200/60 p-3">
                  <a
                    href={supportWhatsAppUrl()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex w-full items-center justify-center gap-2 rounded-2xl py-3 font-bold text-white"
                    style={{ background: "linear-gradient(135deg,#25D366,#128C7E)" }}
                  >
                    <MessageSquare size={18} /> تواصل مع الدعم عبر واتساب
                  </a>
                </div>
              </div>
            )}

            {/* ===== CHAT VIEW ===== */}
            {view === "chat" && (
              <>
                <div className="relative flex-1 overflow-hidden">
                  {/* decorative island + mascots behind the messages */}
                  <IslandBackdrop />
                  <ChatMascots />

                  <div className="relative z-10 h-full space-y-3 overflow-y-auto px-4 py-4">
                    {messages.map((m, i) => (
                      <div key={i} className={`flex ${m.role === "user" ? "justify-start" : "justify-end"}`}>
                        <div
                          className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                            m.role === "user" ? "bg-white/80 text-ink" : "text-ink"
                          }`}
                          style={
                            m.role === "assistant"
                              ? {
                                  background: "linear-gradient(135deg, rgba(255,253,249,0.92), rgba(241,228,200,0.92))",
                                  border: "1px solid rgba(201,168,106,0.3)",
                                }
                              : { border: "1px solid rgba(201,168,106,0.2)" }
                          }
                        >
                          {m.role === "assistant" ? renderRichText(m.content, navigate) : m.content}
                          {/* thinking dots */}
                          {m.role === "assistant" && isLoading && i === messages.length - 1 && m.content === "" && (
                            <span className="inline-flex items-center gap-1">
                              <Bot size={14} className="text-champagne-500" />
                              {[0, 1, 2].map((d) => (
                                <motion.span
                                  key={d}
                                  className="inline-block h-2 w-2 rounded-full bg-champagne-400"
                                  animate={{ y: [0, -5, 0] }}
                                  transition={{ duration: 0.7, repeat: Infinity, delay: d * 0.15 }}
                                />
                              ))}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                    <div ref={endRef} />
                  </div>
                </div>

                {/* Quick prompts on a fresh chat */}
                {messages.length === 1 && !usage.limited && (
                  <div className="relative z-10 flex flex-wrap gap-2 px-4 pb-2">
                    {QUICK_PROMPTS.map((p) => (
                      <button
                        key={p}
                        onClick={() => send(p)}
                        className="rounded-full bg-white/70 px-3 py-1.5 text-xs font-semibold text-ink-soft transition-colors hover:bg-champagne-100"
                        style={{ border: "1px solid rgba(201,168,106,0.3)" }}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                )}

                {/* Limit / countdown */}
                {usage.limited ? (
                  <div className="relative z-10 m-3 rounded-2xl bg-white/80 p-3 text-center" style={{ border: "1px solid rgba(201,168,106,0.4)" }}>
                    <p className="flex items-center justify-center gap-1.5 text-sm font-bold text-ink">
                      <Clock size={16} className="text-gold" /> انتهت رسائلك المجانية
                    </p>
                    <p className="ltr-nums mt-1 font-extrabold text-gold-dark" style={{ fontSize: 22 }}>
                      {formatCountdown(usage.msUntilReset)}
                    </p>
                    <button onClick={() => navigate("/subscriptions")} className="btn-gold mt-2 w-full text-sm">
                      اشترك في باقة النخبة للمزيد ✨
                    </button>
                  </div>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      send();
                    }}
                    className="relative z-10 flex items-center gap-2 border-t border-champagne-200/60 bg-white/50 p-3"
                  >
                    {/* Mic (speech -> text only) */}
                    <button
                      type="button"
                      onClick={toggleMic}
                      className={`flex h-11 w-11 items-center justify-center rounded-2xl transition-colors ${
                        listening ? "bg-rose-500 text-white" : "bg-white/80 text-ink-soft hover:bg-champagne-100"
                      }`}
                      style={{ border: "1px solid rgba(201,168,106,0.3)" }}
                      aria-label="إدخال صوتي"
                      title="تحدّث ليتحوّل صوتك إلى نص"
                    >
                      <motion.span animate={listening ? { scale: [1, 1.2, 1] } : {}} transition={{ duration: 0.8, repeat: listening ? Infinity : 0 }}>
                        <Mic size={18} />
                      </motion.span>
                    </button>

                    <input
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder={listening ? "يستمع الآن... تحدّث" : "اكتب رسالتك هنا..."}
                      className="flex-1 rounded-2xl bg-white/85 px-4 py-2.5 text-sm text-ink outline-none placeholder:text-ink-muted focus:ring-2 focus:ring-champagne-400"
                      style={{ border: "1px solid rgba(201,168,106,0.3)" }}
                      disabled={isLoading}
                    />
                    <button
                      type="submit"
                      disabled={isLoading || !input.trim()}
                      className="flex h-11 w-11 items-center justify-center rounded-2xl text-white shadow-gold disabled:opacity-50"
                      style={{ background: "linear-gradient(135deg,#E6C77E,#C9A86A,#B8923F)" }}
                      aria-label="إرسال"
                    >
                      <Send size={18} className="-scale-x-100" />
                    </button>
                  </form>
                )}

                {/* Support shortcut + hidden counter */}
                <div className="relative z-10 flex items-center justify-between gap-2 px-4 pb-2">
                  <a
                    href={supportWhatsAppUrl()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:underline"
                  >
                    <MessageSquare size={12} /> تواصل مع الدعم
                  </a>
                  {!isElite && !usage.limited && (
                    <span className="text-[11px] text-ink-muted">
                      {usage.remaining} من {usage.limit} رسائل مجانية متبقية
                    </span>
                  )}
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
