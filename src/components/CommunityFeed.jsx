"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Heart, ThumbsDown, MessageCircle, Repeat2, MoreVertical, Send,
  ImageIcon, Video, X, Edit3, Trash2, RefreshCw, ImageOff,
} from "lucide-react";
import { createClient } from "@/lib/supabase-client";
import { useAuthUser } from "@/context/AuthProvider";
import GoldBadge from "./GoldBadge";

const BUCKET = "post-media";
const MAX_VIDEO_SECONDS = 30;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;   // 5 MB
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;  // 50 MB
const POST_COLS = "id, user_id, content, media_url, media_type, media_path, likes_count, dislikes_count, comments_count, reposts_count, created_at";

// Fetch profiles for a set of user ids and attach as row.profile (client-side
// join — avoids PostgREST embed which needs a FK to profiles that may not exist).
async function attachProfiles(supabase, rows) {
  if (!rows?.length) return rows || [];
  const ids = [...new Set(rows.map((r) => r.user_id))];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url, is_elite")
    .in("id", ids);
  const byId = Object.fromEntries((profiles || []).map((p) => [p.id, p]));
  return rows.map((r) => ({ ...r, profile: byId[r.user_id] || null }));
}

function validateMedia(file, kind) {
  if (kind === "image") {
    if (!file.type.startsWith("image/")) return "يُسمح بملفات الصور فقط";
    if (file.size > MAX_IMAGE_BYTES) return "حجم الصورة يجب أن يكون أقل من 5 ميجابايت";
  } else {
    if (!file.type.startsWith("video/")) return "يُسمح بملفات الفيديو فقط";
    if (file.size > MAX_VIDEO_BYTES) return "حجم الفيديو يجب أن يكون أقل من 50 ميجابايت";
  }
  return null;
}

// Reads video metadata and resolves the duration (seconds) or rejects.
function readVideoDuration(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(v.duration); };
    v.onerror = () => { URL.revokeObjectURL(url); reject(new Error("metadata")); };
    v.src = url;
  });
}

// ── Avatar (with optional click-to-preview) ─────────────────────────────────
function Avatar({ name, src, size = 44, onClick }) {
  const cls = "rounded-full object-cover ring-2 ring-champagne-300 flex-shrink-0";
  if (src) {
    return (
      <img
        src={src} alt="" width={size} height={size}
        onClick={onClick}
        className={`${cls} ${onClick ? "cursor-pointer" : ""}`}
        style={{ width: size, height: size }}
      />
    );
  }
  const initial = (name || "م").trim().charAt(0);
  return (
    <span
      className="flex items-center justify-center rounded-full bg-gold-gradient text-base font-extrabold text-white shadow-gold flex-shrink-0"
      style={{ width: size, height: size }}
    >
      {initial}
    </span>
  );
}

// ── PostComposer ────────────────────────────────────────────────────────────
function PostComposer({ onPublish, authorName, authorAvatar }) {
  const [text, setText] = useState("");
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaType, setMediaType] = useState(null);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const imgRef = useRef(null);
  const vidRef = useRef(null);

  const clearMedia = () => {
    setMediaFile(null); setMediaType(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null); setError("");
  };

  const handleImage = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const err = validateMedia(file, "image");
    if (err) { setError(err); return; }
    clearMedia();
    setMediaFile(file); setMediaType("image");
    setPreview(URL.createObjectURL(file));
  };

  const handleVideo = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const err = validateMedia(file, "video");
    if (err) { setError(err); return; }
    try {
      const duration = await readVideoDuration(file);
      if (duration > MAX_VIDEO_SECONDS) { setError("يجب أن يكون الفيديو 30 ثانية أو أقل"); return; }
    } catch {
      setError("تعذّر قراءة الفيديو، جرّب ملفاً آخر"); return;
    }
    clearMedia();
    setMediaFile(file); setMediaType("video");
    setPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!text.trim() && !mediaFile) { setError("أضف نصاً أو صورة أو فيديو للنشر"); return; }
    setBusy(true); setError("");
    try {
      setProgress(mediaFile ? "جارٍ رفع الوسائط..." : "جارٍ النشر...");
      await onPublish({ text: text.trim(), mediaFile, mediaType });
      setText(""); clearMedia();
    } catch {
      setError("حدث خطأ أثناء النشر. حاول مجدداً.");
    } finally {
      setBusy(false); setProgress("");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="glass-strong rounded-3xl p-4 mb-2">
      <div className="flex items-center gap-3 mb-3">
        <Avatar name={authorName} src={authorAvatar} />
        <span className="font-semibold text-ink">{authorName}</span>
      </div>

      <textarea
        value={text} onChange={(e) => setText(e.target.value)}
        placeholder="شارك إنجازك أو نتيجتك مع المجتمع..." rows={2}
        className="w-full resize-none rounded-2xl bg-white/70 px-4 py-3 text-ink outline-none placeholder:text-ink-muted focus:ring-2 focus:ring-champagne-400"
        style={{ border: "1px solid rgba(201,168,106,0.3)" }}
      />

      {error && (
        <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600 border border-red-200">{error}</p>
      )}

      {preview && (
        <div className="relative mt-3">
          {mediaType === "image"
            ? <img src={preview} alt="معاينة" className="max-h-60 w-full rounded-2xl object-cover" />
            : <video src={preview} controls className="max-h-60 w-full rounded-2xl" />}
          <button type="button" onClick={clearMedia} className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white">
            <X size={14} />
          </button>
        </div>
      )}

      <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-2">
          <button type="button" onClick={() => imgRef.current?.click()} className="flex items-center gap-1.5 rounded-xl border border-champagne-200 bg-white/60 px-3 py-2 text-sm font-medium text-ink-soft hover:bg-champagne-100 transition">
            <ImageIcon size={15} /> صورة
          </button>
          <input ref={imgRef} type="file" accept="image/*" onChange={handleImage} hidden />
          <button type="button" onClick={() => vidRef.current?.click()} className="flex items-center gap-1.5 rounded-xl border border-champagne-200 bg-white/60 px-3 py-2 text-sm font-medium text-ink-soft hover:bg-champagne-100 transition">
            <Video size={15} /> فيديو
          </button>
          <input ref={vidRef} type="file" accept="video/*" onChange={handleVideo} hidden />
        </div>

        <button type="submit" disabled={busy || (!text.trim() && !mediaFile)} className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-gold to-champagne px-4 py-2 font-semibold text-white shadow-gold transition hover:opacity-90 disabled:opacity-40">
          {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Send size={15} className="-scale-x-100" />}
          {progress || "نشر"}
        </button>
      </div>
    </form>
  );
}

// ── PostCard ────────────────────────────────────────────────────────────────
function PostCard({ post, currentUserId, reaction, onDelete, onEdit, onImage, onAvatar }) {
  const [showMenu, setShowMenu] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [comments, setComments] = useState([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [liked, setLiked] = useState(reaction?.liked || false);
  const [disliked, setDisliked] = useState(reaction?.disliked || false);
  const [reposted, setReposted] = useState(reaction?.reposted || false);
  const [counts, setCounts] = useState({
    likes: post.likes_count ?? 0,
    dislikes: post.dislikes_count ?? 0,
    comments: post.comments_count ?? 0,
    reposts: post.reposts_count ?? 0,
  });

  useEffect(() => {
    setCounts({
      likes: post.likes_count ?? 0, dislikes: post.dislikes_count ?? 0,
      comments: post.comments_count ?? 0, reposts: post.reposts_count ?? 0,
    });
  }, [post.likes_count, post.dislikes_count, post.comments_count, post.reposts_count]);

  const isOwner = currentUserId && post.user_id === currentUserId;
  const authorName = post.profile?.full_name || "مستخدم";
  const authorAvatar = post.profile?.avatar_url || null;
  const authorElite = !!post.profile?.is_elite;

  const supa = () => createClient();

  // Reconcile from authoritative DB-derived counts (works with or without the
  // count triggers — counts the interaction rows directly).
  const reconcile = useCallback(async () => {
    const supabase = supa();
    const head = (table) => supabase.from(table).select("id", { count: "exact", head: true }).eq("post_id", post.id);
    const [l, d, c, r] = await Promise.all([
      head("post_likes"), head("post_dislikes"), head("post_comments"), head("post_reposts"),
    ]);
    setCounts({
      likes: l.count ?? 0, dislikes: d.count ?? 0,
      comments: c.count ?? 0, reposts: r.count ?? 0,
    });
  }, [post.id]);

  const fetchComments = useCallback(async () => {
    setLoadingComments(true);
    const supabase = supa();
    const { data } = await supabase
      .from("post_comments")
      .select("id, content, created_at, user_id")
      .eq("post_id", post.id)
      .order("created_at", { ascending: true });
    setComments(await attachProfiles(supabase, data || []));
    setLoadingComments(false);
  }, [post.id]);

  useEffect(() => { if (showComments) fetchComments(); }, [showComments, fetchComments]);

  const handleLike = async () => {
    if (!currentUserId) return;
    const supabase = supa();
    if (liked) {
      setLiked(false); setCounts((c) => ({ ...c, likes: Math.max(0, c.likes - 1) }));
      await supabase.from("post_likes").delete().match({ post_id: post.id, user_id: currentUserId });
    } else {
      setLiked(true); setCounts((c) => ({ ...c, likes: c.likes + 1 }));
      if (disliked) {
        setDisliked(false); setCounts((c) => ({ ...c, dislikes: Math.max(0, c.dislikes - 1) }));
        await supabase.from("post_dislikes").delete().match({ post_id: post.id, user_id: currentUserId });
      }
      await supabase.from("post_likes").upsert({ post_id: post.id, user_id: currentUserId }, { onConflict: "post_id,user_id" });
    }
    reconcile();
  };

  const handleDislike = async () => {
    if (!currentUserId) return;
    const supabase = supa();
    if (disliked) {
      setDisliked(false); setCounts((c) => ({ ...c, dislikes: Math.max(0, c.dislikes - 1) }));
      await supabase.from("post_dislikes").delete().match({ post_id: post.id, user_id: currentUserId });
    } else {
      setDisliked(true); setCounts((c) => ({ ...c, dislikes: c.dislikes + 1 }));
      if (liked) {
        setLiked(false); setCounts((c) => ({ ...c, likes: Math.max(0, c.likes - 1) }));
        await supabase.from("post_likes").delete().match({ post_id: post.id, user_id: currentUserId });
      }
      await supabase.from("post_dislikes").upsert({ post_id: post.id, user_id: currentUserId }, { onConflict: "post_id,user_id" });
    }
    reconcile();
  };

  const handleRepost = async () => {
    if (!currentUserId) return;
    const supabase = supa();
    if (reposted) {
      setReposted(false); setCounts((c) => ({ ...c, reposts: Math.max(0, c.reposts - 1) }));
      await supabase.from("post_reposts").delete().match({ post_id: post.id, user_id: currentUserId });
    } else {
      setReposted(true); setCounts((c) => ({ ...c, reposts: c.reposts + 1 }));
      await supabase.from("post_reposts").upsert({ post_id: post.id, user_id: currentUserId }, { onConflict: "post_id,user_id" });
    }
    reconcile();
  };

  const handleComment = async (e) => {
    e.preventDefault();
    if (!commentText.trim() || !currentUserId) return;
    const supabase = supa();
    const { data } = await supabase
      .from("post_comments")
      .insert({ post_id: post.id, user_id: currentUserId, content: commentText.trim() })
      .select("id, content, created_at, user_id")
      .single();
    if (data) {
      const [withProfile] = await attachProfiles(supabase, [data]);
      setComments((prev) => [...prev, withProfile]);
      setCounts((c) => ({ ...c, comments: c.comments + 1 }));
    }
    setCommentText("");
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-strong rounded-3xl p-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Avatar name={authorName} src={authorAvatar} onClick={authorAvatar ? () => onAvatar(authorAvatar) : undefined} />
          <div>
            <span className="flex items-center gap-1.5 font-bold text-ink">
              {authorName} {authorElite && <GoldBadge />}
            </span>
            <p className="text-xs text-ink-soft">{new Date(post.created_at).toLocaleDateString("ar-SA")}</p>
          </div>
        </div>

        {/* Owner-only three-dot menu (RLS also enforces ownership on the server) */}
        {isOwner && (
          <div className="relative">
            <button onClick={() => setShowMenu((v) => !v)} className="rounded-xl p-2 text-ink-muted hover:bg-champagne-100 transition">
              <MoreVertical size={18} />
            </button>
            <AnimatePresence>
              {showMenu && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.92, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.92, y: -4 }}
                  className="absolute left-0 top-10 z-20 min-w-[180px] overflow-hidden rounded-2xl bg-white shadow-glass-lg"
                  style={{ border: "1px solid rgba(201,168,106,0.3)" }}
                >
                  <button onClick={() => { onEdit(post); setShowMenu(false); }} className="flex w-full items-center gap-2 px-4 py-3 text-right text-sm text-ink hover:bg-champagne-50 transition">
                    <Edit3 size={15} /> تعديل المنشور
                  </button>
                  {post.media_url && (
                    <button onClick={() => { onEdit(post, "replace"); setShowMenu(false); }} className="flex w-full items-center gap-2 px-4 py-3 text-right text-sm text-ink hover:bg-champagne-50 transition">
                      <RefreshCw size={15} /> استبدال الوسائط
                    </button>
                  )}
                  {post.media_url && (
                    <button onClick={() => { onEdit(post, "removeMedia"); setShowMenu(false); }} className="flex w-full items-center gap-2 px-4 py-3 text-right text-sm text-ink hover:bg-champagne-50 transition">
                      <ImageOff size={15} /> إزالة الوسائط
                    </button>
                  )}
                  <button onClick={() => { onDelete(post); setShowMenu(false); }} className="flex w-full items-center gap-2 px-4 py-3 text-right text-sm text-red-600 hover:bg-red-50 transition">
                    <Trash2 size={15} /> حذف المنشور
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {post.content && <p className="mt-4 leading-relaxed text-ink whitespace-pre-wrap">{post.content}</p>}

      {/* Media */}
      {post.media_url && (
        <div className="mt-4">
          {post.media_type === "video" ? (
            <video src={post.media_url} controls className="max-h-96 w-full rounded-2xl" />
          ) : (
            <img src={post.media_url} alt="" onClick={() => onImage(post.media_url)} className="max-h-96 w-full cursor-zoom-in rounded-2xl object-cover" />
          )}
        </div>
      )}

      {/* Interaction bar */}
      <div className="mt-4 flex items-center gap-5 text-sm text-ink-soft border-t border-champagne-200/50 pt-3">
        <button onClick={handleLike} disabled={!currentUserId} className={`flex items-center gap-1.5 transition ${liked ? "text-red-500 font-semibold" : "hover:text-red-400"}`} title="إعجاب">
          <Heart size={17} fill={liked ? "currentColor" : "none"} /><span>{counts.likes}</span>
        </button>
        <button onClick={handleDislike} disabled={!currentUserId} className={`flex items-center gap-1.5 transition ${disliked ? "text-blue-500 font-semibold" : "hover:text-blue-400"}`} title="عدم إعجاب">
          <ThumbsDown size={17} fill={disliked ? "currentColor" : "none"} /><span>{counts.dislikes}</span>
        </button>
        <button onClick={() => setShowComments((v) => !v)} className={`flex items-center gap-1.5 transition ${showComments ? "text-gold font-semibold" : "hover:text-gold"}`} title="تعليقات">
          <MessageCircle size={17} /><span>{counts.comments}</span>
        </button>
        <button onClick={handleRepost} disabled={!currentUserId} className={`flex items-center gap-1.5 transition ${reposted ? "text-green-600 font-semibold" : "hover:text-green-500"}`} title="إعادة نشر">
          <Repeat2 size={17} /><span>{counts.reposts}</span>
        </button>
      </div>

      {/* Comments */}
      <AnimatePresence>
        {showComments && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="mt-4 space-y-3">
              {loadingComments && <p className="text-sm text-ink-muted text-center py-2">جاري التحميل...</p>}
              {!loadingComments && comments.length === 0 && <p className="text-sm text-ink-muted text-center py-2">لا توجد تعليقات بعد</p>}
              {comments.map((c) => (
                <div key={c.id} className="flex items-start gap-2">
                  <Avatar name={c.profile?.full_name} src={c.profile?.avatar_url} size={32} />
                  <div className="flex-1 rounded-2xl bg-white/60 px-3 py-2" style={{ border: "1px solid rgba(201,168,106,0.2)" }}>
                    <p className="flex items-center gap-1 text-xs font-bold text-ink mb-0.5">
                      {c.profile?.full_name || "مستخدم"} {c.profile?.is_elite && <GoldBadge />}
                    </p>
                    <p className="text-sm text-ink-soft">{c.content}</p>
                  </div>
                </div>
              ))}
            </div>

            {currentUserId && (
              <form onSubmit={handleComment} className="mt-3 flex gap-2">
                <input value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="أضف تعليقاً..." className="flex-1 rounded-2xl bg-white/70 px-3 py-2 text-sm text-ink outline-none focus:ring-2 focus:ring-champagne-400" style={{ border: "1px solid rgba(201,168,106,0.3)" }} />
                <button type="submit" disabled={!commentText.trim()} className="rounded-2xl bg-gradient-to-r from-gold to-champagne px-3 py-2 text-white disabled:opacity-40">
                  <Send size={14} className="-scale-x-100" />
                </button>
              </form>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Main ────────────────────────────────────────────────────────────────────
export default function CommunityFeed() {
  const { userId, isSignedIn, name, imageUrl, isElite, isLoaded } = useAuthUser();
  const [posts, setPosts] = useState([]);
  const [reactions, setReactions] = useState({}); // postId → {liked,disliked,reposted}
  const [loading, setLoading] = useState(true);
  const [editPost, setEditPost] = useState(null);
  const [editText, setEditText] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [lightbox, setLightbox] = useState(null);   // image url for full-screen viewer
  const replaceRef = useRef(null);

  const fetchPosts = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("community_posts")
      .select(POST_COLS)
      .order("created_at", { ascending: false })
      .limit(40);
    const withProfiles = await attachProfiles(supabase, data || []);
    setPosts(withProfiles);

    // Load the current user's reactions for these posts (so state survives reload).
    if (userId && withProfiles.length) {
      const ids = withProfiles.map((p) => p.id);
      const [likes, dislikes, reposts] = await Promise.all([
        supabase.from("post_likes").select("post_id").eq("user_id", userId).in("post_id", ids),
        supabase.from("post_dislikes").select("post_id").eq("user_id", userId).in("post_id", ids),
        supabase.from("post_reposts").select("post_id").eq("user_id", userId).in("post_id", ids),
      ]);
      const map = {};
      (likes.data || []).forEach((r) => { map[r.post_id] = { ...(map[r.post_id] || {}), liked: true }; });
      (dislikes.data || []).forEach((r) => { map[r.post_id] = { ...(map[r.post_id] || {}), disliked: true }; });
      (reposts.data || []).forEach((r) => { map[r.post_id] = { ...(map[r.post_id] || {}), reposted: true }; });
      setReactions(map);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  // Realtime: new posts + live count updates from other users.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("community-feed")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "community_posts" }, async (payload) => {
        const row = payload.new;
        if (!row) return;
        setPosts((prev) => {
          if (prev.some((p) => p.id === row.id)) return prev; // dedupe (our own optimistic insert)
          return prev; // placeholder; profile attached below
        });
        // attach author profile then prepend if new
        const [withProfile] = await attachProfiles(supabase, [row]);
        setPosts((prev) => prev.some((p) => p.id === row.id) ? prev : [withProfile, ...prev]);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "community_posts" }, (payload) => {
        const row = payload.new;
        if (!row) return;
        setPosts((prev) => prev.map((p) => p.id === row.id ? { ...p, ...row } : p));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const handlePublish = useCallback(async ({ text, mediaFile, mediaType }) => {
    const supabase = createClient();
    let media_url = null, media_path = null;

    if (mediaFile) {
      const ext = (mediaFile.name.split(".").pop() || (mediaType === "video" ? "mp4" : "jpg")).toLowerCase();
      const path = `${userId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, mediaFile, { cacheControl: "3600", contentType: mediaFile.type, upsert: false });
      if (upErr) throw upErr;
      media_path = path;
      media_url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    }

    const { data: newPost, error } = await supabase
      .from("community_posts")
      .insert({ user_id: userId, content: text || null, media_url, media_type: mediaType || null, media_path })
      .select(POST_COLS)
      .single();
    if (error) throw error;

    // Attach our own profile (DB-verified elite) and show immediately.
    const mine = { ...newPost, profile: { id: userId, full_name: name, avatar_url: imageUrl, is_elite: isElite } };
    setPosts((prev) => prev.some((p) => p.id === mine.id) ? prev : [mine, ...prev]);
  }, [userId, name, imageUrl, isElite]);

  const removeMediaObject = async (supabase, path) => {
    if (path) { try { await supabase.storage.from(BUCKET).remove([path]); } catch {} }
  };

  const handleDelete = useCallback(async (post) => {
    if (!confirm("هل تريد حذف هذا المنشور؟")) return;
    const supabase = createClient();
    const { error } = await supabase.from("community_posts").delete().eq("id", post.id);
    if (!error) {
      await removeMediaObject(supabase, post.media_path);
      setPosts((prev) => prev.filter((p) => p.id !== post.id));
    }
  }, []);

  const openEdit = useCallback((post, mode) => {
    if (mode === "removeMedia") {
      (async () => {
        const supabase = createClient();
        const { error } = await supabase.from("community_posts")
          .update({ media_url: null, media_type: null, media_path: null }).eq("id", post.id);
        if (!error) {
          await removeMediaObject(supabase, post.media_path);
          setPosts((prev) => prev.map((p) => p.id === post.id ? { ...p, media_url: null, media_type: null, media_path: null } : p));
        }
      })();
      return;
    }
    setEditPost({ ...post, mode });
    setEditText(post.content || "");
    if (mode === "replace") setTimeout(() => replaceRef.current?.click(), 50);
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editPost) return;
    setEditBusy(true);
    const supabase = createClient();
    const { error } = await supabase.from("community_posts").update({ content: editText }).eq("id", editPost.id);
    if (!error) setPosts((prev) => prev.map((p) => p.id === editPost.id ? { ...p, content: editText } : p));
    setEditBusy(false);
    setEditPost(null);
  }, [editPost, editText]);

  const handleReplaceMedia = useCallback(async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !editPost) return;
    const kind = file.type.startsWith("video/") ? "video" : "image";
    const err = validateMedia(file, kind);
    if (err) { alert(err); return; }
    if (kind === "video") {
      try { if (await readVideoDuration(file) > MAX_VIDEO_SECONDS) { alert("يجب أن يكون الفيديو 30 ثانية أو أقل"); return; } }
      catch { alert("تعذّر قراءة الفيديو"); return; }
    }
    setEditBusy(true);
    const supabase = createClient();
    const ext = (file.name.split(".").pop() || "bin").toLowerCase();
    const path = `${userId}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
    if (!upErr) {
      const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      const { error } = await supabase.from("community_posts")
        .update({ media_url: url, media_type: kind, media_path: path }).eq("id", editPost.id);
      if (!error) {
        await removeMediaObject(supabase, editPost.media_path);
        setPosts((prev) => prev.map((p) => p.id === editPost.id ? { ...p, media_url: url, media_type: kind, media_path: path } : p));
        setEditPost((ep) => ep ? { ...ep, media_url: url, media_type: kind, media_path: path } : ep);
      }
    }
    setEditBusy(false);
  }, [editPost, userId]);

  if (loading) {
    return (
      <div className="glass-strong rounded-3xl p-12 text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-b-2 border-gold" />
        <p className="mt-4 text-ink-soft">جاري التحميل...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {isLoaded && (
        isSignedIn ? (
          <PostComposer onPublish={handlePublish} authorName={name || "مستخدم"} authorAvatar={imageUrl || null} />
        ) : (
          <div className="glass-strong rounded-3xl p-6 text-center">
            <p className="font-semibold text-ink">سجّل الدخول لتشارك في المجتمع</p>
            <a href="/sign-in" className="mt-3 inline-block rounded-xl bg-gradient-to-r from-gold to-champagne px-4 py-2 text-sm font-semibold text-white shadow-gold">تسجيل الدخول</a>
          </div>
        )
      )}

      {/* Empty state only AFTER loading completes and the feed is truly empty */}
      {posts.length === 0 ? (
        <div className="glass-strong rounded-3xl p-12 text-center">
          <span className="text-5xl">🌴</span>
          <h3 className="mt-4 text-lg font-bold text-ink">لا توجد منشورات بعد</h3>
          <p className="mt-2 text-sm text-ink-soft">كن أول من يشارك في المجتمع التعليمي</p>
        </div>
      ) : (
        <AnimatePresence>
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              currentUserId={userId}
              reaction={reactions[post.id]}
              onDelete={handleDelete}
              onEdit={openEdit}
              onImage={(url) => setLightbox(url)}
              onAvatar={(url) => setLightbox(url)}
            />
          ))}
        </AnimatePresence>
      )}

      {/* hidden input for media replacement */}
      <input ref={replaceRef} type="file" accept="image/*,video/*" onChange={handleReplaceMedia} hidden />

      {/* Edit modal */}
      <AnimatePresence>
        {editPost && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setEditPost(null)}>
            <motion.div initial={{ scale: 0.92 }} animate={{ scale: 1 }} exit={{ scale: 0.92 }} onClick={(e) => e.stopPropagation()} className="glass-strong w-full max-w-md rounded-3xl p-6">
              <h3 className="mb-3 text-lg font-extrabold text-ink">تعديل المنشور</h3>
              <textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={4} className="w-full resize-none rounded-2xl bg-white/70 px-4 py-3 text-ink outline-none focus:ring-2 focus:ring-champagne-400" style={{ border: "1px solid rgba(201,168,106,0.3)" }} />
              {editPost.media_url && (
                <button onClick={() => replaceRef.current?.click()} disabled={editBusy} className="btn-ghost mt-3 flex w-full items-center justify-center gap-2 text-sm">
                  <RefreshCw size={15} /> استبدال الوسائط
                </button>
              )}
              <div className="mt-4 flex gap-3">
                <button onClick={handleSaveEdit} disabled={editBusy} className="flex-1 rounded-xl bg-gradient-to-r from-gold to-champagne py-2.5 font-semibold text-white hover:opacity-90 transition disabled:opacity-50">
                  {editBusy ? "جارٍ الحفظ..." : "حفظ التعديل"}
                </button>
                <button onClick={() => setEditPost(null)} className="flex-1 rounded-xl border border-champagne-300 py-2.5 font-semibold text-ink hover:bg-champagne-50 transition">إلغاء</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Full-screen image viewer */}
      <AnimatePresence>
        {lightbox && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-4" onClick={() => setLightbox(null)}>
            <button className="absolute right-4 top-4 rounded-full bg-white/15 p-2 text-white" onClick={() => setLightbox(null)}><X size={22} /></button>
            <motion.img initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} src={lightbox} alt="" className="max-h-[90vh] max-w-[92vw] rounded-2xl object-contain" onClick={(e) => e.stopPropagation()} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
