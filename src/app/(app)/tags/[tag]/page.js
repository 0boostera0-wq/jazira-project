"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Hash } from "lucide-react";
import { createClient } from "@/lib/supabase-client";
import PostCard from "@/components/social/PostCard";
import { fetchProfileMap } from "@/lib/profileJoin";

export default function HashtagPage() {
  const { tag } = useParams();
  const supabase = createClient();
  const decoded = decodeURIComponent(tag || "").toLowerCase();
  const [posts, setPosts] = useState(null);
  const [authors, setAuthors] = useState({});
  const [count, setCount] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      let rows = [];
      try {
        // preferred: indexed hashtag → post_hashtags → posts
        const { data: h } = await supabase.from("hashtags").select("id, post_count").eq("tag", decoded).maybeSingle();
        if (h?.id) {
          setCount(h.post_count || 0);
          const { data: links } = await supabase.from("post_hashtags").select("post_id").eq("hashtag_id", h.id).limit(50);
          const ids = (links || []).map((l) => l.post_id);
          if (ids.length) {
            const { data } = await supabase.from("community_posts").select("*").in("id", ids).order("created_at", { ascending: false });
            rows = data || [];
          }
        }
      } catch {}
      // fallback: search post content for the literal #tag (works before indexing)
      if (!rows.length) {
        try {
          const { data } = await supabase.from("community_posts").select("*")
            .ilike("content", `%#${decoded}%`).order("created_at", { ascending: false }).limit(50);
          rows = data || [];
          setCount(rows.length);
        } catch {}
      }
      if (!alive) return;
      const map = await fetchProfileMap(supabase, rows.map((p) => p.user_id));
      const { data: unames } = await supabase.from("profiles").select("id, username").in("id", rows.map((p) => p.user_id));
      const uMap = Object.fromEntries((unames || []).map((u) => [u.id, u.username]));
      setAuthors(Object.fromEntries(Object.entries(map).map(([id, p]) => [id, { ...p, id, username: uMap[id] }])));
      setPosts(rows);
    })();
    return () => { alive = false; };
  }, [decoded, supabase]);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="bezel mb-5">
        <div className="bezel-core glass-strong flex items-center gap-4 p-6">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gold-gradient text-white shadow-gold"><Hash size={26} /></span>
          <div>
            <h1 className="text-xl font-extrabold text-ink" dir="ltr">#{decoded}</h1>
            <p className="text-sm text-ink-muted ltr-nums">{count} منشور</p>
          </div>
        </div>
      </div>

      {posts === null ? (
        <div className="space-y-4">{[0, 1].map((i) => <div key={i} className="h-40 animate-pulse rounded-3xl bg-champagne-100/70" />)}</div>
      ) : posts.length === 0 ? (
        <div className="bezel"><div className="bezel-core glass p-10 text-center text-ink-soft">
          لا توجد منشورات بهذا الوسم بعد. <Link href="/community" className="font-bold text-gold hover:underline">اكتب أول منشور</Link>
        </div></div>
      ) : (
        <div className="space-y-4">{posts.map((p) => <PostCard key={p.id} post={p} author={authors[p.user_id]} />)}</div>
      )}
    </div>
  );
}
