"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Star, Send, MessageSquareQuote } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import Avatar from "@/components/Avatar";
import { createClient } from "@/lib/supabase-client";
import { useAuthUser } from "@/context/AuthProvider";
import { publicName } from "@/lib/profile";

function Stars({ value, onChange }) {
  const [hover, setHover] = useState(0);
  const interactive = typeof onChange === "function";
  return (
    <div className="flex gap-1" dir="ltr">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!interactive}
          onClick={() => interactive && onChange(n)}
          onMouseEnter={() => interactive && setHover(n)}
          onMouseLeave={() => interactive && setHover(0)}
          className={interactive ? "transition-transform hover:scale-110" : "cursor-default"}
        >
          <Star
            size={interactive ? 34 : 16}
            className={(hover || value) >= n ? "fill-[#C9A227] text-[#C9A227]" : "text-champagne-200"}
          />
        </button>
      ))}
    </div>
  );
}

export default function ReviewsPage() {
  const { userId, isSignedIn, name, imageUrl } = useAuthUser();
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchReviews = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from("reviews")
        .select("id, rating, content, created_at, user_id, profiles(full_name, avatar_url)")
        .order("created_at", { ascending: false })
        .limit(50);
      setReviews(data || []);
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
    setSubmitting(true);
    setError("");
    try {
      const supabase = createClient();
      const { data, error: insErr } = await supabase
        .from("reviews")
        .insert({ user_id: userId, rating, content: text.trim() })
        .select("id, rating, content, created_at, user_id, profiles(full_name, avatar_url)")
        .single();
      if (insErr) throw insErr;
      // Show immediately
      setReviews((prev) => [data, ...prev]);
      setRating(0);
      setText("");
    } catch {
      setError("تعذّر إرسال رأيك حالياً. حاول مجدداً.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="آراء الطلبة" subtitle="شارك تجربتك واطّلع على آراء زملائك" icon={MessageSquareQuote} />

      {/* Submit form */}
      {isSignedIn ? (
        <form onSubmit={submit} className="glass-strong mb-6 rounded-3xl p-6">
          <p className="font-bold text-ink">قيّم تجربتك</p>
          <div className="mt-3 flex justify-center">
            <Stars value={rating} onChange={setRating} />
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="اكتب رأيك عن منصة جزيرة..."
            className="mt-4 w-full resize-none rounded-2xl bg-white/70 px-4 py-3 text-ink outline-none placeholder:text-ink-muted focus:ring-2 focus:ring-champagne-400"
            style={{ border: "1px solid rgba(201,168,106,0.3)" }}
          />
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="btn-gold mt-3 flex w-full items-center justify-center gap-2 disabled:opacity-50"
          >
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

      {/* Reviews list */}
      {loading ? (
        <div className="glass-strong rounded-3xl p-10 text-center">
          <span className="inline-block h-7 w-7 animate-spin rounded-full border-b-2 border-gold" />
        </div>
      ) : reviews.length === 0 ? (
        <div className="glass-strong rounded-3xl p-10 text-center">
          <span className="text-4xl">🌟</span>
          <p className="mt-3 font-bold text-ink">كن أول من يشارك رأيه</p>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence>
            {reviews.map((r) => {
              const displayName = publicName(r.profiles);
              return (
                <motion.div
                  key={r.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="glass rounded-3xl p-5"
                >
                  <div className="flex items-center gap-3">
                    <Avatar src={r.profiles?.avatar_url} name={displayName} size={42} />
                    <div className="flex-1">
                      <p className="font-bold text-ink">{displayName}</p>
                      <Stars value={r.rating} />
                    </div>
                    <span className="text-xs text-ink-muted">
                      {new Date(r.created_at).toLocaleDateString("ar-SA")}
                    </span>
                  </div>
                  {r.content && <p className="mt-3 leading-relaxed text-ink-soft">{r.content}</p>}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
