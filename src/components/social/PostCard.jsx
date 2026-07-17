"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Heart, MessageCircle, Repeat2, Share2, Check } from "lucide-react";
import { createClient } from "@/lib/supabase-client";
import { useAuthUser } from "@/context/AuthProvider";
import Avatar from "@/components/Avatar";
import GoldBadge from "@/components/GoldBadge";
import FollowButton from "./FollowButton";
import { timeAgo } from "@/lib/timeAgo";

// Linkify #hashtags and @mentions inside post text.
function RichText({ text }) {
  if (!text) return null;
  const parts = String(text).split(/(\s+)/);
  return (
    <p className="whitespace-pre-wrap break-words leading-relaxed text-ink">
      {parts.map((tok, i) => {
        const tag = tok.match(/^#([0-9A-Za-z_؀-ۿ]{2,50})$/);
        const men = tok.match(/^@([0-9A-Za-z_]{2,30})$/);
        if (tag) return <Link key={i} href={`/tags/${tag[1].toLowerCase()}`} className="font-bold text-gold hover:underline">{tok}</Link>;
        if (men) return <Link key={i} href={`/u/${men[1]}`} className="font-bold text-[#6A6AC9] hover:underline">{tok}</Link>;
        return tok;
      })}
    </p>
  );
}

export default function PostCard({ post, author }) {
  const { userId, isSignedIn } = useAuthUser();
  const supabase = createClient();
  const [liked, setLiked] = useState(false);
  const [likes, setLikes] = useState(post.likes_count || 0);
  const [reposts, setReposts] = useState(post.reposts_count || 0);
  const [reposted, setReposted] = useState(false);
  const [copied, setCopied] = useState(false);

  const anon = !!author?.anonymous_community;
  const name = anon ? "مجهول" : author?.full_name || "مستخدم";
  const showBadge = !anon && !!author?.is_elite && author?.show_elite_badge !== false;

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    (async () => {
      try {
        const [{ data: l }, { data: r }] = await Promise.all([
          supabase.from("post_likes").select("id").eq("post_id", post.id).eq("user_id", userId).maybeSingle(),
          supabase.from("post_reposts").select("id").eq("post_id", post.id).eq("user_id", userId).maybeSingle(),
        ]);
        if (alive) { setLiked(!!l); setReposted(!!r); }
      } catch {}
    })();
    return () => { alive = false; };
  }, [userId, post.id, supabase]);

  const requireAuth = () => {
    if (!isSignedIn) { window.location.href = "/sign-in?next=" + encodeURIComponent(location.pathname); return false; }
    return true;
  };

  const toggleLike = async () => {
    if (!requireAuth()) return;
    const next = !liked;
    setLiked(next); setLikes((n) => n + (next ? 1 : -1)); // optimistic
    try {
      if (next) await supabase.from("post_likes").insert({ post_id: post.id, user_id: userId });
      else await supabase.from("post_likes").delete().eq("post_id", post.id).eq("user_id", userId);
    } catch { setLiked(!next); setLikes((n) => n + (next ? -1 : 1)); }
  };

  const toggleRepost = async () => {
    if (!requireAuth()) return;
    const next = !reposted;
    setReposted(next); setReposts((n) => n + (next ? 1 : -1));
    try {
      if (next) await supabase.from("post_reposts").insert({ post_id: post.id, user_id: userId });
      else await supabase.from("post_reposts").delete().eq("post_id", post.id).eq("user_id", userId);
    } catch { setReposted(!next); setReposts((n) => n + (next ? -1 : 1)); }
  };

  const share = async () => {
    const url = `${location.origin}/community#post-${post.id}`;
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };

  return (
    <article id={`post-${post.id}`} className="bezel">
      <div className="bezel-core glass p-4 sm:p-5">
        {/* header */}
        <div className="mb-3 flex items-center gap-3">
          <Link href={anon ? "#" : `/u/${author?.username || ""}`} className="shrink-0">
            <Avatar src={anon ? null : author?.avatar_url} name={name} size={44} />
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <Link href={anon ? "#" : `/u/${author?.username || ""}`} className="truncate font-extrabold text-ink hover:underline">{name}</Link>
              {showBadge && <GoldBadge />}
            </div>
            <p className="text-xs text-ink-muted">{timeAgo(post.created_at)}</p>
          </div>
          {!anon && author?.id && author.id !== userId && <FollowButton authorId={author.id} size="sm" />}
        </div>

        {/* content */}
        <RichText text={post.content} />

        {/* media */}
        {post.media_url && post.media_type === "image" && (
          <img src={post.media_url} alt="" loading="lazy" className="mt-3 max-h-[28rem] w-full rounded-2xl object-cover" />
        )}
        {post.media_url && post.media_type === "video" && (
          <video src={post.media_url} controls preload="metadata" className="mt-3 max-h-[28rem] w-full rounded-2xl" />
        )}

        {/* actions */}
        <div className="mt-4 flex items-center gap-1 text-ink-soft">
          <button onClick={toggleLike} className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold transition hover:bg-champagne-100/70 ${liked ? "text-[#E0556B]" : ""}`}>
            <motion.span animate={liked ? { scale: [1, 1.35, 1] } : {}} transition={{ duration: 0.3 }}>
              <Heart size={18} fill={liked ? "#E0556B" : "none"} />
            </motion.span>
            {likes > 0 && <span className="ltr-nums">{likes}</span>}
          </button>
          <Link href={`/community#post-${post.id}`} className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold transition hover:bg-champagne-100/70">
            <MessageCircle size={18} />{post.comments_count > 0 && <span className="ltr-nums">{post.comments_count}</span>}
          </Link>
          <button onClick={toggleRepost} className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold transition hover:bg-champagne-100/70 ${reposted ? "text-[#3BA67B]" : ""}`}>
            <Repeat2 size={18} />{reposts > 0 && <span className="ltr-nums">{reposts}</span>}
          </button>
          <button onClick={share} aria-label="نسخ رابط المنشور" className="mr-auto flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold transition hover:bg-champagne-100/70">
            {copied ? <Check size={17} className="text-emerald-600" /> : <Share2 size={17} />}
          </button>
        </div>
      </div>
    </article>
  );
}
