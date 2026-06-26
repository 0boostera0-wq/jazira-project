"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Star, Send, MessageSquareQuote, Edit3, Trash2, X, Check } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import Avatar from "@/components/Avatar";
import GoldBadge from "@/components/GoldBadge";
import { createClient } from "@/lib/supabase-client";
import { useAuthUser } from "@/context/AuthProvider";
import { publicName } from "@/lib/profile";
import { fetchProfileMap } from "@/lib/profileJoin";

// Client-side profile join (no PostgREST embed → no FK dependency).
async function attachProfiles(supabase, rows) {
  if (!rows?.length) return rows || [];
  const byId = await fetchProfileMap(supabase, rows.map((r) => r.user_id));
  return rows.map((r) => ({ ...r, profile: byId[r.user_id] || null }));
}

function Stars({ value, onChange }) {
  const [hover, setHover] = useState(0);
  const interactive = typeof onChange === "function";
  return (
    <div className="flex gap-1" dir="ltr">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" disabled={!interactive}
          onClick={() => interactive && onChange(n)}
          onMouseEnter={() => interactive && setHover(n)}
          onMouseLeave={() => interactive && setHover(0)}
          className={interactive ? "transition-transform hover:scale-110" : "cursor-default"}>
          <Star size={interactive ? 34 : 16} className={(hover || value) >= n ? "fill-[#C9A227] text-[#C9A227]" : "text-champagne-200"} />
        </button>
      ))}
    </div>
  );
}

export default function ReviewsPage() {
  const { userId, isSignedIn } = useAuthUser();
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);

  // edit state
  const [editId, setEditId] = useState(null);
  const [editRating, setEditRating] = useState(0);
  const [editText, setEditText] = useState("");

  const fetchReviews = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data, error: e } = await supabase
        .from("reviews")
        .select("id, rating, content, created_at, user_id")
        .order("created_at", { ascending: false })
        .limit(60);
      if (e) throw e;
      setReviews(await attachProfiles(supabase, data || []));
    } catch {
      setReviews([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchReviews(); }, [fetchReviews]);

  const submit = async (e) => {
    e.preventDefault();
    if (!rating) { setError("اختر تقييماً من 1 إلى 5 نجوم"); return; }
    if (!text.trim()) { setError("اكتب رأيك قبل الإرسال"); return; }
    setSubmitting(true); setError(""); setSuccess("");
    try {
      const supabase = createClient();
      const { data, error: insErr } = await supabase
        .from("reviews")
        .insert({ user_id: userId, rating, content: text.trim() })
        .select("id, rating, content, created_at, user_id")
        .single();
      if (insErr) throw insErr;
      const [withProfile] = await attachProfiles(supabase, [data]);
      setReviews((prev) => [withProfile, ...prev]);
      setRating(0); setText("");
      setSuccess("تم نشر رأيك بنجاح 🌟");
      setTimeout(() => setSuccess(""), 3000);
    } catch {
      setError("تعذّر إرسال رأيك حالياً. حاول مجدداً.");
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (r) => { setEditId(r.id); setEditRating(r.rating); setEditText(r.content || ""); };

  const saveEdit = async () => {
    if (!editRating) return;
    const supabase = createClient();
    const { error: e } = await supabase
      .from("reviews")
      .update({ rating: editRating, content: editText.trim() })
      .eq("id", editId);
    if (!e) {
      setReviews((prev) => prev.map((r) => r.id === editId ? { ...r, rating: editRating, content: editText.trim() } : r));
      setEditId(null);
    }
  };

  const deleteReview = async (id) => {
    if (!confirm("هل تريد حذف رأيك؟")) return;
    const supabase = createClient();
    const { error: e } = await supabase.from("reviews").delete().eq("id", id);
    if (!e) setReviews((prev) => prev.filter((r) => r.id !== id));
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="آراء الطلبة" subtitle="شارك تجربتك واطّلع على آراء زملائك" icon={MessageSquareQuote} />

      {isSignedIn ? (
        <form onSubmit={submit} className="glass-strong mb-6 rounded-3xl p-6">
          <p className="font-bold text-ink">قيّم تجربتك</p>
          <div className="mt-3 flex justify-center"><Stars value={rating} onChange={setRating} /></div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={500}
            placeholder="اكتب رأيك عن منصة جزيرة..."
            className="mt-4 w-full resize-none rounded-2xl bg-white/70 px-4 py-3 text-ink outline-none placeholder:text-ink-muted focus:ring-2 focus:ring-champagne-400"
            style={{ border: "1px solid rgba(201,168,106,0.3)" }} />
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          {success && <p className="mt-2 text-sm font-semibold text-emerald-600">{success}</p>}
          <button type="submit" disabled={submitting} className="btn-gold mt-3 flex w-full items-center justify-center gap-2 disabled:opacity-50">
            <Send size={16} className="-scale-x-100" />
            {submitting ? "جارٍ الإرسال..." : "إرسال الرأي"}
          </button>
        </form>
      ) : (
        <div className="glass-strong mb-6 rounded-3xl p-6 text-center">
          <p className="font-semibold text-ink">سجّل الدخول لمشاركة رأيك</p>
          <a href="/sign-in" className="btn-gold mt-3 inline-block px-5 py-2 text-sm">تسجيل الدخول</a>
        </div>
      )}

      {loading ? (
        <div className="glass-strong rounded-3xl p-10 text-center">
          <span className="inline-block h-7 w-7 animate-spin rounded-full border-b-2 border-gold" />
          <p className="mt-3 text-sm text-ink-soft">جاري تحميل الآراء...</p>
        </div>
      ) : reviews.length === 0 ? (
        <div className="glass-strong rounded-3xl p-10 text-center">
          <span className="text-4xl">🌟</span>
          <p className="mt-3 font-bold text-ink">كن أول من يشارك برأيه</p>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence>
            {reviews.map((r) => {
              const displayName = publicName(r.profile);
              const mine = r.user_id === userId;
              const editing = editId === r.id;
              return (
                <motion.div key={r.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="glass rounded-3xl p-5">
                  <div className="flex items-center gap-3">
                    <Avatar src={r.profile?.avatar_url} name={displayName} size={42} />
                    <div className="flex-1">
                      <p className="flex items-center gap-1.5 font-bold text-ink">{displayName} {r.profile?.is_elite && r.profile?.show_elite_badge !== false && <GoldBadge />}</p>
                      {editing ? <Stars value={editRating} onChange={setEditRating} /> : <Stars value={r.rating} />}
                    </div>
                    <span className="text-xs text-ink-muted">{new Date(r.created_at).toLocaleDateString("ar-SA")}</span>
                  </div>

                  {editing ? (
                    <div className="mt-3">
                      <textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={3} maxLength={500}
                        className="w-full resize-none rounded-2xl bg-white/70 px-4 py-3 text-sm text-ink outline-none focus:ring-2 focus:ring-champagne-400"
                        style={{ border: "1px solid rgba(201,168,106,0.3)" }} />
                      <div className="mt-2 flex gap-2">
                        <button onClick={saveEdit} className="btn-gold flex items-center gap-1.5 px-4 py-2 text-sm"><Check size={15} /> حفظ</button>
                        <button onClick={() => setEditId(null)} className="btn-ghost flex items-center gap-1.5 px-4 py-2 text-sm"><X size={15} /> إلغاء</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {r.content && <p className="mt-3 leading-relaxed text-ink-soft">{r.content}</p>}
                      {mine && (
                        <div className="mt-3 flex gap-3 border-t border-champagne-200/50 pt-2 text-sm">
                          <button onClick={() => startEdit(r)} className="flex items-center gap-1 text-ink-soft hover:text-gold transition"><Edit3 size={14} /> تعديل</button>
                          <button onClick={() => deleteReview(r.id)} className="flex items-center gap-1 text-ink-soft hover:text-red-500 transition"><Trash2 size={14} /> حذف</button>
                        </div>
                      )}
                    </>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
