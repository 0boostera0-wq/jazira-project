"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Heart,
  ThumbsDown,
  MessageCircle,
  Repeat2,
  MoreVertical,
  Send,
  ImageIcon,
  Video,
  X,
  Edit3,
  Trash2,
} from "lucide-react";
import { createClient } from "@/lib/supabase-client";
import { useAuthUser } from "@/context/AuthProvider";

const BUCKET = "post-media";
const MAX_VIDEO_SECONDS = 30;

// ── Avatar ───────────────────────────────────────────────────────────────────
function Avatar({ name, src, size = 44 }) {
  if (src) {
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        className="rounded-full object-cover ring-2 ring-champagne-300 flex-shrink-0"
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

// ── PostComposer ─────────────────────────────────────────────────────────────
function PostComposer({ onPublish, authorName, authorAvatar }) {
  const [text, setText] = useState("");
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaType, setMediaType] = useState(null);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const imgRef = useRef(null);
  const vidRef = useRef(null);

  const clearMedia = () => {
    setMediaFile(null);
    setMediaType(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setError("");
  };

  const handleImage = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    clearMedia();
    setMediaFile(file);
    setMediaType("image");
    setPreview(URL.createObjectURL(file));
    e.target.value = "";
  };

  const handleVideo = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const tempUrl = URL.createObjectURL(file);
    const valid = await new Promise((resolve) => {
      const v = document.createElement("video");
      v.onloadedmetadata = () => {
        URL.revokeObjectURL(tempUrl);
        if (v.duration > MAX_VIDEO_SECONDS) {
          setError("يجب أن يكون الفيديو 30 ثانية أو أقل");
          resolve(false);
        } else {
          resolve(true);
        }
      };
      v.onerror = () => { URL.revokeObjectURL(tempUrl); resolve(false); };
      v.src = tempUrl;
    });
    if (!valid) return;
    clearMedia();
    setMediaFile(file);
    setMediaType("video");
    setPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!text.trim() && !mediaFile) { setError("أضف نصاً أو وسائط للنشر"); return; }
    setBusy(true);
    setError("");
    try {
      await onPublish({ text: text.trim(), mediaFile, mediaType });
      setText("");
      clearMedia();
    } catch {
      setError("حدث خطأ أثناء النشر. حاول مجدداً.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="glass-strong rounded-3xl p-4 mb-2">
      <div className="flex items-center gap-3 mb-3">
        <Avatar name={authorName} src={authorAvatar} />
        <span className="font-semibold text-ink">{authorName}</span>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="شارك إنجازك أو نتيجتك مع المجتمع..."
        rows={2}
        className="w-full resize-none rounded-2xl bg-white/70 px-4 py-3 text-ink outline-none placeholder:text-ink-muted focus:ring-2 focus:ring-champagne-400"
        style={{ border: "1px solid rgba(201,168,106,0.3)" }}
      />

      {error && (
        <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600 border border-red-200">
          {error}
        </p>
      )}

      {preview && (
        <div className="relative mt-3">
          {mediaType === "image" ? (
            <img src={preview} alt="معاينة" className="max-h-60 w-full rounded-2xl object-cover" />
          ) : (
            <video src={preview} controls className="max-h-60 w-full rounded-2xl" />
          )}
          <button
            type="button"
            onClick={clearMedia}
            className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => imgRef.current?.click()}
            className="flex items-center gap-1.5 rounded-xl border border-champagne-200 bg-white/60 px-3 py-2 text-sm font-medium text-ink-soft hover:bg-champagne-100 transition"
          >
            <ImageIcon size={15} /> صورة
          </button>
          <input ref={imgRef} type="file" accept="image/*" onChange={handleImage} hidden />

          <button
            type="button"
            onClick={() => vidRef.current?.click()}
            className="flex items-center gap-1.5 rounded-xl border border-champagne-200 bg-white/60 px-3 py-2 text-sm font-medium text-ink-soft hover:bg-champagne-100 transition"
          >
            <Video size={15} /> فيديو
          </button>
          <input ref={vidRef} type="file" accept="video/*" onChange={handleVideo} hidden />
        </div>

        <button
          type="submit"
          disabled={busy || (!text.trim() && !mediaFile)}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-gold to-champagne px-4 py-2 font-semibold text-white shadow-gold transition hover:opacity-90 disabled:opacity-40"
        >
          {busy ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <Send size={15} className="-scale-x-100" />
          )}
          نشر
        </button>
      </div>
    </form>
  );
}

// ── PostCard ─────────────────────────────────────────────────────────────────
function PostCard({ post, currentUserId, onDelete, onEdit }) {
  const [showMenu, setShowMenu] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [comments, setComments] = useState([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [liked, setLiked] = useState(false);
  const [disliked, setDisliked] = useState(false);
  const [reposted, setReposted] = useState(false);
  const [localLikes, setLocalLikes] = useState(post.likes_count ?? 0);
  const [localDislikes, setLocalDislikes] = useState(post.dislikes_count ?? 0);
  const [localReposts, setLocalReposts] = useState(post.reposts_count ?? 0);
  const [localComments, setLocalComments] = useState(post.comments_count ?? 0);

  const isOwner = currentUserId && post.user_id === currentUserId;
  const authorName = post.profiles?.full_name || "مستخدم";
  const authorAvatar = post.profiles?.avatar_url || null;

  const fetchComments = useCallback(async () => {
    setLoadingComments(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("post_comments")
      .select("id, content, created_at, user_id, profiles(full_name, avatar_url)")
      .eq("post_id", post.id)
      .order("created_at", { ascending: true });
    setComments(data || []);
    setLoadingComments(false);
  }, [post.id]);

  useEffect(() => {
    if (showComments) fetchComments();
  }, [showComments, fetchComments]);

  const handleLike = async () => {
    if (!currentUserId) return;
    const supabase = createClient();
    if (liked) {
      setLiked(false);
      setLocalLikes((n) => Math.max(0, n - 1));
      await supabase.from("post_likes").delete().match({ post_id: post.id, user_id: currentUserId });
    } else {
      setLiked(true);
      setLocalLikes((n) => n + 1);
      if (disliked) {
        setDisliked(false);
        setLocalDislikes((n) => Math.max(0, n - 1));
        await supabase.from("post_dislikes").delete().match({ post_id: post.id, user_id: currentUserId });
      }
      await supabase.from("post_likes").upsert({ post_id: post.id, user_id: currentUserId });
    }
  };

  const handleDislike = async () => {
    if (!currentUserId) return;
    const supabase = createClient();
    if (disliked) {
      setDisliked(false);
      setLocalDislikes((n) => Math.max(0, n - 1));
      await supabase.from("post_dislikes").delete().match({ post_id: post.id, user_id: currentUserId });
    } else {
      setDisliked(true);
      setLocalDislikes((n) => n + 1);
      if (liked) {
        setLiked(false);
        setLocalLikes((n) => Math.max(0, n - 1));
        await supabase.from("post_likes").delete().match({ post_id: post.id, user_id: currentUserId });
      }
      await supabase.from("post_dislikes").upsert({ post_id: post.id, user_id: currentUserId });
    }
  };

  const handleRepost = async () => {
    if (!currentUserId) return;
    const supabase = createClient();
    if (reposted) {
      setReposted(false);
      setLocalReposts((n) => Math.max(0, n - 1));
      await supabase.from("post_reposts").delete().match({ post_id: post.id, user_id: currentUserId });
    } else {
      setReposted(true);
      setLocalReposts((n) => n + 1);
      await supabase.from("post_reposts").upsert({ post_id: post.id, user_id: currentUserId });
    }
  };

  const handleComment = async (e) => {
    e.preventDefault();
    if (!commentText.trim() || !currentUserId) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("post_comments")
      .insert({ post_id: post.id, user_id: currentUserId, content: commentText.trim() })
      .select("id, content, created_at, user_id, profiles(full_name, avatar_url)")
      .single();
    if (data) {
      setComments((prev) => [...prev, data]);
      setLocalComments((n) => n + 1);
    }
    setCommentText("");
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-strong rounded-3xl p-5"
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Avatar name={authorName} src={authorAvatar} />
          <div>
            <span className="font-bold text-ink">{authorName}</span>
            <p className="text-xs text-ink-soft">
              {new Date(post.created_at).toLocaleDateString("ar-SA")}
            </p>
          </div>
        </div>

        {/* Three-dot menu — owner only */}
        {isOwner && (
          <div className="relative">
            <button
              onClick={() => setShowMenu((v) => !v)}
              className="rounded-xl p-2 text-ink-muted hover:bg-champagne-100 transition"
            >
              <MoreVertical size={18} />
            </button>
            <AnimatePresence>
              {showMenu && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.92, y: -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.92, y: -4 }}
                  className="absolute left-0 top-10 z-20 min-w-[160px] overflow-hidden rounded-2xl bg-white shadow-glass-lg"
                  style={{ border: "1px solid rgba(201,168,106,0.3)" }}
                >
                  <button
                    onClick={() => { onEdit(post); setShowMenu(false); }}
                    className="flex w-full items-center gap-2 px-4 py-3 text-right text-sm text-ink hover:bg-champagne-50 transition"
                  >
                    <Edit3 size={15} /> تعديل المنشور
                  </button>
                  <button
                    onClick={() => { onDelete(post.id); setShowMenu(false); }}
                    className="flex w-full items-center gap-2 px-4 py-3 text-right text-sm text-red-600 hover:bg-red-50 transition"
                  >
                    <Trash2 size={15} /> حذف المنشور
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Content */}
      {post.content && (
        <p className="mt-4 leading-relaxed text-ink whitespace-pre-wrap">{post.content}</p>
      )}

      {/* Media */}
      {post.media_url && (
        <div className="mt-4">
          {post.media_type === "video" ? (
            <video
              src={post.media_url}
              controls
              className="max-h-96 w-full rounded-2xl"
            />
          ) : (
            <img
              src={post.media_url}
              alt=""
              className="max-h-96 w-full rounded-2xl object-cover"
            />
          )}
        </div>
      )}

      {/* Interaction bar */}
      <div className="mt-4 flex items-center gap-5 text-sm text-ink-soft border-t border-champagne-200/50 pt-3">
        <button
          onClick={handleLike}
          className={`flex items-center gap-1.5 transition ${
            liked ? "text-red-500 font-semibold" : "hover:text-red-400"
          }`}
          title="إعجاب"
        >
          <Heart size={17} fill={liked ? "currentColor" : "none"} />
          <span>{localLikes}</span>
        </button>

        <button
          onClick={handleDislike}
          className={`flex items-center gap-1.5 transition ${
            disliked ? "text-blue-500 font-semibold" : "hover:text-blue-400"
          }`}
          title="عدم إعجاب"
        >
          <ThumbsDown size={17} fill={disliked ? "currentColor" : "none"} />
          <span>{localDislikes}</span>
        </button>

        <button
          onClick={() => setShowComments((v) => !v)}
          className={`flex items-center gap-1.5 transition ${
            showComments ? "text-gold font-semibold" : "hover:text-gold"
          }`}
          title="تعليقات"
        >
          <MessageCircle size={17} />
          <span>{localComments}</span>
        </button>

        <button
          onClick={handleRepost}
          className={`flex items-center gap-1.5 transition ${
            reposted ? "text-green-600 font-semibold" : "hover:text-green-500"
          }`}
          title="إعادة نشر"
        >
          <Repeat2 size={17} />
          <span>{localReposts}</span>
        </button>
      </div>

      {/* Comments section */}
      <AnimatePresence>
        {showComments && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-4 space-y-3">
              {loadingComments && (
                <p className="text-sm text-ink-muted text-center py-2">جاري التحميل...</p>
              )}
              {comments.map((c) => (
                <div key={c.id} className="flex items-start gap-2">
                  <Avatar
                    name={c.profiles?.full_name}
                    src={c.profiles?.avatar_url}
                    size={32}
                  />
                  <div
                    className="flex-1 rounded-2xl bg-white/60 px-3 py-2"
                    style={{ border: "1px solid rgba(201,168,106,0.2)" }}
                  >
                    <p className="text-xs font-bold text-ink mb-0.5">
                      {c.profiles?.full_name || "مستخدم"}
                    </p>
                    <p className="text-sm text-ink-soft">{c.content}</p>
                  </div>
                </div>
              ))}
            </div>

            {currentUserId && (
              <form onSubmit={handleComment} className="mt-3 flex gap-2">
                <input
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="أضف تعليقاً..."
                  className="flex-1 rounded-2xl bg-white/70 px-3 py-2 text-sm text-ink outline-none focus:ring-2 focus:ring-champagne-400"
                  style={{ border: "1px solid rgba(201,168,106,0.3)" }}
                />
                <button
                  type="submit"
                  disabled={!commentText.trim()}
                  className="rounded-2xl bg-gradient-to-r from-gold to-champagne px-3 py-2 text-white disabled:opacity-40"
                >
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

// ── Main Component ────────────────────────────────────────────────────────────
export default function CommunityFeed() {
  const { userId, isSignedIn, name, imageUrl, isLoaded } = useAuthUser();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editPost, setEditPost] = useState(null);
  const [editText, setEditText] = useState("");

  const fetchPosts = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("community_posts")
      .select("id, user_id, content, media_url, media_type, likes_count, dislikes_count, comments_count, reposts_count, created_at, profiles(full_name, avatar_url)")
      .order("created_at", { ascending: false })
      .limit(30);
    setPosts(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  const handlePublish = useCallback(async ({ text, mediaFile, mediaType }) => {
    const supabase = createClient();
    let media_url = null;

    if (mediaFile) {
      const ext = mediaFile.name.split(".").pop();
      const path = `${userId}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, mediaFile, { cacheControl: "3600" });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);
      media_url = publicUrl;
    }

    const { data: newPost, error } = await supabase
      .from("community_posts")
      .insert({
        user_id: userId,
        content: text || null,
        media_url,
        media_type: mediaType || null,
        likes_count: 0,
        dislikes_count: 0,
        comments_count: 0,
        reposts_count: 0,
      })
      .select("id, user_id, content, media_url, media_type, likes_count, dislikes_count, comments_count, reposts_count, created_at, profiles(full_name, avatar_url)")
      .single();

    if (error) throw error;
    setPosts((prev) => [newPost, ...prev]);
  }, [userId]);

  const handleDelete = useCallback(async (postId) => {
    if (!confirm("هل تريد حذف هذا المنشور؟")) return;
    const supabase = createClient();
    const { error } = await supabase.from("community_posts").delete().eq("id", postId);
    if (!error) setPosts((prev) => prev.filter((p) => p.id !== postId));
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editPost) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("community_posts")
      .update({ content: editText })
      .eq("id", editPost.id);
    if (!error) {
      setPosts((prev) =>
        prev.map((p) => p.id === editPost.id ? { ...p, content: editText } : p)
      );
      setEditPost(null);
    }
  }, [editPost, editText]);

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
      {/* Composer — signed-in users only */}
      {isLoaded && (
        isSignedIn ? (
          <PostComposer
            onPublish={handlePublish}
            authorName={name || "مستخدم"}
            authorAvatar={imageUrl || null}
          />
        ) : (
          <div className="glass-strong rounded-3xl p-6 text-center">
            <p className="font-semibold text-ink">سجّل الدخول لتشارك في المجتمع</p>
            <a
              href="/sign-in"
              className="mt-3 inline-block rounded-xl bg-gradient-to-r from-gold to-champagne px-4 py-2 text-sm font-semibold text-white shadow-gold"
            >
              تسجيل الدخول
            </a>
          </div>
        )
      )}

      {/* Feed */}
      {posts.length === 0 ? (
        <div className="glass-strong rounded-3xl p-12 text-center">
          <span className="text-5xl">🌴</span>
          <h3 className="mt-4 text-lg font-bold text-ink">لا توجد منشورات بعد</h3>
          <p className="mt-2 text-sm text-ink-soft">
            كن أول من يشارك في المجتمع التعليمي
          </p>
        </div>
      ) : (
        <AnimatePresence>
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              currentUserId={userId}
              onDelete={handleDelete}
              onEdit={(p) => { setEditPost(p); setEditText(p.content || ""); }}
            />
          ))}
        </AnimatePresence>
      )}

      {/* Edit modal */}
      <AnimatePresence>
        {editPost && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
            onClick={() => setEditPost(null)}
          >
            <motion.div
              initial={{ scale: 0.92 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.92 }}
              onClick={(e) => e.stopPropagation()}
              className="glass-strong w-full max-w-md rounded-3xl p-6"
            >
              <h3 className="mb-3 text-lg font-extrabold text-ink">تعديل المنشور</h3>
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                rows={4}
                className="w-full resize-none rounded-2xl bg-white/70 px-4 py-3 text-ink outline-none focus:ring-2 focus:ring-champagne-400"
                style={{ border: "1px solid rgba(201,168,106,0.3)" }}
              />
              <div className="mt-4 flex gap-3">
                <button
                  onClick={handleSaveEdit}
                  className="flex-1 rounded-xl bg-gradient-to-r from-gold to-champagne py-2.5 font-semibold text-white hover:opacity-90 transition"
                >
                  حفظ التعديل
                </button>
                <button
                  onClick={() => setEditPost(null)}
                  className="flex-1 rounded-xl border border-champagne-300 py-2.5 font-semibold text-ink hover:bg-champagne-50 transition"
                >
                  إلغاء
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
