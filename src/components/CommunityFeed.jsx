"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, MessageCircle, Share2, Send, TrendingUp, Award } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { useAuthUser } from "@/context/AuthProvider";
import GoldBadge from "./GoldBadge";

const SEED_POSTS = [
  {
    id: 1,
    author: "نورة العتيبي",
    elite: true,
    time: "قبل ٥ دقائق",
    tag: "إنجاز",
    text: "حصلت على ٩٥٪ في اختبار القدرات الكمي اليوم! 🎉 المثابرة تؤتي ثمارها 💪",
    likes: 128,
    comments: [{ author: "محمد", text: "ما شاء الله، مبروك! 👏" }],
    liked: false,
  },
  {
    id: 2,
    author: "عبدالله القحطاني",
    elite: true,
    time: "قبل ٢٠ دقيقة",
    tag: "سلسلة يومية",
    text: "أكملت سلسلة ٣٠ يومًا متواصلة من المذاكرة على منصة جزيرة 🔥🏝️",
    likes: 94,
    comments: [],
    liked: false,
  },
  {
    id: 3,
    author: "سارة الدوسري",
    elite: false,
    time: "قبل ساعة",
    tag: "نتيجة",
    text: "تحسّن مستواي في التحصيلي من ٧٠ إلى ٨٨ خلال أسبوعين فقط بفضل الاختبارات التفاعلية 📈",
    likes: 67,
    comments: [{ author: "ريم", text: "ملهمة! كيف نظّمتِ وقتك؟" }],
    liked: false,
  },
];

function Avatar({ name }) {
  const initial = (name || "؟").trim().charAt(0);
  return (
    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gold-gradient text-lg font-extrabold text-white shadow-gold">
      {initial}
    </span>
  );
}

export default function CommunityFeed() {
  const { isElite } = useApp();
  const { name, isSignedIn } = useAuthUser();
  const [posts, setPosts] = useState(SEED_POSTS);
  const [draft, setDraft] = useState("");
  const [openComments, setOpenComments] = useState(null);
  const [commentText, setCommentText] = useState("");

  const myName = isSignedIn && name ? name : "زائر جزيرة";

  const toggleLike = (id) =>
    setPosts((p) =>
      p.map((post) =>
        post.id === id
          ? { ...post, liked: !post.liked, likes: post.likes + (post.liked ? -1 : 1) }
          : post
      )
    );

  const publish = () => {
    if (!draft.trim()) return;
    setPosts((p) => [
      {
        id: Date.now(),
        author: myName,
        elite: isElite,
        time: "الآن",
        tag: "منشور",
        text: draft.trim(),
        likes: 0,
        comments: [],
        liked: false,
      },
      ...p,
    ]);
    setDraft("");
  };

  const addComment = (id) => {
    if (!commentText.trim()) return;
    setPosts((p) =>
      p.map((post) =>
        post.id === id
          ? { ...post, comments: [...post.comments, { author: myName, text: commentText.trim() }] }
          : post
      )
    );
    setCommentText("");
  };

  return (
    <div className="space-y-4">
      {/* Composer */}
      <div className="glass-strong rounded-3xl p-4">
        <div className="flex items-center gap-3">
          <Avatar name={myName} />
          <div className="flex items-center gap-1">
            <span className="font-bold text-ink">{myName}</span>
            {isElite && <GoldBadge />}
          </div>
        </div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="شارك إنجازك أو نتيجتك مع المجتمع..."
          rows={2}
          className="mt-3 w-full resize-none rounded-2xl bg-white/70 px-4 py-3 text-ink outline-none placeholder:text-ink-muted focus:ring-2 focus:ring-champagne-400"
          style={{ border: "1px solid rgba(201,168,106,0.3)" }}
        />
        <div className="mt-2 flex justify-end">
          <button onClick={publish} disabled={!draft.trim()} className="btn-gold flex items-center gap-2 px-5 py-2 text-sm disabled:opacity-50">
            <Send size={16} className="-scale-x-100" /> نشر
          </button>
        </div>
      </div>

      {/* Feed */}
      {posts.map((post) => (
        <motion.div
          key={post.id}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-3xl p-5"
        >
          <div className="flex items-center gap-3">
            <Avatar name={post.author} />
            <div className="flex-1">
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-ink">{post.author}</span>
                {post.elite && <GoldBadge />}
              </div>
              <span className="text-xs text-ink-muted">{post.time}</span>
            </div>
            <span className="flex items-center gap-1 rounded-full bg-champagne-100 px-3 py-1 text-xs font-bold text-gold-dark">
              {post.tag === "نتيجة" ? <TrendingUp size={13} /> : <Award size={13} />}
              {post.tag}
            </span>
          </div>

          <p className="mt-3 leading-relaxed text-ink">{post.text}</p>

          {/* Actions */}
          <div className="mt-4 flex items-center gap-6 border-t border-champagne-200/60 pt-3 text-ink-soft">
            <button onClick={() => toggleLike(post.id)} className={`flex items-center gap-1.5 text-sm font-semibold transition-colors ${post.liked ? "text-rose-600" : "hover:text-rose-500"}`}>
              <Heart size={18} className={post.liked ? "fill-rose-600" : ""} /> {post.likes}
            </button>
            <button onClick={() => setOpenComments(openComments === post.id ? null : post.id)} className="flex items-center gap-1.5 text-sm font-semibold hover:text-champagne-500">
              <MessageCircle size={18} /> {post.comments.length}
            </button>
            <button className="flex items-center gap-1.5 text-sm font-semibold hover:text-champagne-500">
              <Share2 size={18} /> مشاركة
            </button>
          </div>

          {/* Comments */}
          <AnimatePresence>
            {openComments === post.id && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-3 space-y-2">
                  {post.comments.map((c, i) => (
                    <div key={i} className="rounded-2xl bg-white/60 px-3 py-2 text-sm">
                      <span className="font-bold text-ink">{c.author}: </span>
                      <span className="text-ink-soft">{c.text}</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-2">
                    <input
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addComment(post.id)}
                      placeholder="أضف تعليقًا..."
                      className="flex-1 rounded-full bg-white/70 px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-champagne-400"
                      style={{ border: "1px solid rgba(201,168,106,0.3)" }}
                    />
                    <button onClick={() => addComment(post.id)} className="btn-gold px-4 py-2 text-sm">
                      <Send size={15} className="-scale-x-100" />
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      ))}
    </div>
  );
}
