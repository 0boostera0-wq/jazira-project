'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, MessageCircle, Share2, Send, TrendingUp, Award } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { usePosts } from '@/hooks/useSupabase';
import GoldBadge from './GoldBadge';

function Avatar({ name }) {
  const initial = (name || '؟').trim().charAt(0);
  return (
    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gold-gradient text-lg font-extrabold text-white shadow-gold">
      {initial}
    </span>
  );
}

function EmptyState() {
  return (
    <div className="glass-strong rounded-3xl p-12 text-center">
      <span className="text-5xl">🌴</span>
      <h3 className="mt-4 text-lg font-bold text-ink">لا توجد منشورات بعد</h3>
      <p className="mt-2 text-sm text-ink-soft">
        كن أول من يشارك في المجتمع التعليمي
      </p>
    </div>
  );
}

export default function CommunityFeed() {
  const { profile, isElite } = useAuth();
  const { posts, loading } = usePosts(20);
  const [draft, setDraft] = useState('');

  const myName = profile?.full_name || 'مستخدم';

  if (loading) {
    return (
      <div className="glass-strong rounded-3xl p-12 text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gold"></div>
        <p className="mt-4 text-ink-soft">جاري التحميل...</p>
      </div>
    );
  }

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
          style={{ border: '1px solid rgba(201,168,106,0.3)' }}
        />
        <div className="mt-2 flex justify-end">
          <button
            onClick={() => setDraft('')}
            disabled={!draft.trim()}
            className="btn-gold flex items-center gap-2 px-5 py-2 text-sm disabled:opacity-50"
          >
            <Send size={16} className="-scale-x-100" /> نشر
          </button>
        </div>
      </div>

      {/* Feed */}
      {posts.length === 0 ? (
        <EmptyState />
      ) : (
        <AnimatePresence>
          {posts.map((post) => (
            <motion.div
              key={post.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-strong rounded-3xl p-5"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Avatar name={post.profiles?.full_name || post.user_id} />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-ink">
                        {post.profiles?.full_name || 'مستخدم'}
                      </span>
                      {post.profiles?.is_elite && <GoldBadge />}
                    </div>
                    <p className="text-xs text-ink-soft">
                      {new Date(post.created_at).toLocaleDateString('ar-SA')}
                    </p>
                  </div>
                </div>
              </div>

              <p className="mt-4 text-ink">{post.content}</p>

              {post.image_url && (
                <img
                  src={post.image_url}
                  alt="post"
                  className="mt-4 rounded-2xl max-h-96 w-full object-cover"
                />
              )}

              <div className="mt-4 flex items-center gap-4 text-sm text-ink-soft">
                <button className="flex items-center gap-1 transition hover:text-red-500">
                  <Heart size={16} />
                  {post.likes_count || 0}
                </button>
                <button className="flex items-center gap-1 transition hover:text-gold">
                  <MessageCircle size={16} />
                  {post.comments_count || 0}
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      )}
    </div>
  );
}
