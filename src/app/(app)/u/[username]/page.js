"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { MessageSquare, UserX, Sparkles, Flame, Calendar } from "lucide-react";
import { createClient } from "@/lib/supabase-client";
import { useAuthUser } from "@/context/AuthProvider";
import Avatar from "@/components/Avatar";
import GoldBadge from "@/components/GoldBadge";
import FollowButton from "@/components/social/FollowButton";
import PostCard from "@/components/social/PostCard";
import { fetchProfileMap } from "@/lib/profileJoin";
import { getProfileStats, getSocialSettings } from "@/lib/social";
import { timeAgo } from "@/lib/timeAgo";

const TABS = [
  { id: "posts", label: "المنشورات" },
  { id: "reposts", label: "إعادة النشر" },
  { id: "likes", label: "الإعجابات" },
  { id: "about", label: "حول" },
];

function Stat({ value, label }) {
  return (
    <div className="text-center">
      <p className="text-lg font-extrabold text-ink ltr-nums">{value ?? 0}</p>
      <p className="text-[11px] text-ink-muted">{label}</p>
    </div>
  );
}

export default function ProfilePage() {
  const { username } = useParams();
  const supabase = createClient();
  const { userId } = useAuthUser();

  const [profile, setProfile] = useState(undefined); // undefined=loading, null=not found
  const [stats, setStats] = useState(null);
  const [social, setSocial] = useState(null);
  const [tab, setTab] = useState("posts");
  const [items, setItems] = useState([]);
  const [authors, setAuthors] = useState({});
  const [loadingTab, setLoadingTab] = useState(false);

  // load profile by username
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const cols = "id, username, full_name, avatar_url, is_elite, show_elite_badge, anonymous_community, bio, xp, created_at";
        let res = await supabase.from("profiles").select(cols).eq("username", username).maybeSingle();
        if (res.error) res = await supabase.from("profiles").select("id, username, full_name, avatar_url, is_elite").eq("username", username).maybeSingle();
        if (!alive) return;
        setProfile(res.data || null);
        if (res.data) {
          getProfileStats(res.data.id).then((s) => alive && setStats(s));
          getSocialSettings(res.data.id).then((s) => alive && setSocial(s));
        }
      } catch { if (alive) setProfile(null); }
    })();
    return () => { alive = false; };
  }, [username, supabase]);

  const loadTab = useCallback(async (t, pid) => {
    if (!pid) return;
    setLoadingTab(true);
    try {
      if (t === "posts") {
        const { data } = await supabase.from("community_posts").select("*").eq("user_id", pid).order("created_at", { ascending: false }).limit(30);
        setItems(data || []);
        setAuthors({ [pid]: profile });
      } else if (t === "reposts" || t === "likes") {
        const table = t === "reposts" ? "post_reposts" : "post_likes";
        const { data: rows } = await supabase.from(table).select("post_id, created_at").eq("user_id", pid).order("created_at", { ascending: false }).limit(30);
        const ids = (rows || []).map((r) => r.post_id);
        if (!ids.length) { setItems([]); }
        else {
          const { data: posts } = await supabase.from("community_posts").select("*").in("id", ids);
          const map = await fetchProfileMap(supabase, (posts || []).map((p) => p.user_id));
          // need usernames too for links
          const { data: unames } = await supabase.from("profiles").select("id, username").in("id", (posts || []).map((p) => p.user_id));
          const uMap = Object.fromEntries((unames || []).map((u) => [u.id, u.username]));
          const merged = Object.fromEntries(Object.entries(map).map(([id, p]) => [id, { ...p, id, username: uMap[id] }]));
          setAuthors(merged);
          // preserve repost/like order
          const byId = Object.fromEntries((posts || []).map((p) => [p.id, p]));
          setItems(ids.map((id) => byId[id]).filter(Boolean));
        }
      }
    } catch { setItems([]); }
    setLoadingTab(false);
  }, [supabase, profile]);

  useEffect(() => { if (profile?.id) loadTab(tab, profile.id); }, [tab, profile, loadTab]);

  if (profile === undefined) {
    return <div className="mx-auto max-w-2xl space-y-4"><div className="h-40 animate-pulse rounded-3xl bg-champagne-100/70" /><div className="h-24 animate-pulse rounded-3xl bg-champagne-100/70" /></div>;
  }
  if (profile === null) {
    return (
      <div className="mx-auto grid max-w-md place-items-center py-24 text-center">
        <span className="mb-4 grid h-16 w-16 place-items-center rounded-3xl bg-champagne-100 text-gold"><UserX size={30} /></span>
        <h1 className="text-xl font-extrabold text-ink">الحساب غير موجود</h1>
        <p className="mt-2 text-ink-soft">تعذّر العثور على هذا المستخدم.</p>
        <Link href="/community" className="cta-ghost mt-6">العودة للمجتمع</Link>
      </div>
    );
  }

  const anon = !!profile.anonymous_community;
  const name = anon ? "مجهول" : profile.full_name || "مستخدم";
  const showBadge = !anon && !!profile.is_elite && profile.show_elite_badge !== false;
  const isSelf = userId === profile.id;
  const likesHidden = social && social.show_likes_on_profile === false && !isSelf;
  const repostsHidden = social && social.show_reposts_on_profile === false && !isSelf;
  const visibleTabs = TABS.filter((t) => !(t.id === "likes" && likesHidden) && !(t.id === "reposts" && repostsHidden));

  return (
    <div className="mx-auto max-w-2xl">
      {/* header card */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bezel">
        <div className="bezel-core glass-strong p-6">
          <div className="flex items-start gap-4">
            <Avatar src={anon ? null : profile.avatar_url} name={name} size={84} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-extrabold text-ink">{name}</h1>
                {showBadge && <GoldBadge />}
              </div>
              {profile.username && <p className="text-sm text-ink-muted" dir="ltr">@{profile.username}</p>}
              {profile.bio && <p className="mt-2 text-sm leading-relaxed text-ink-soft">{profile.bio}</p>}
            </div>
          </div>

          {/* stats */}
          <div className="mt-5 grid grid-cols-4 gap-2 rounded-2xl bg-white/50 p-3">
            <Stat value={stats?.posts} label="منشور" />
            <Stat value={stats?.followers} label="متابِع" />
            <Stat value={stats?.following} label="يتابع" />
            <Stat value={stats?.likesReceived} label="إعجاب" />
          </div>

          {/* actions */}
          {!isSelf ? (
            <div className="mt-4 flex items-center gap-2">
              <FollowButton authorId={profile.id} />
              <Link href={`/chat?to=${profile.id}`} className="inline-flex items-center gap-1.5 rounded-full glass px-4 py-2 text-sm font-bold text-ink transition hover:bg-white/70">
                <MessageSquare size={15} /> رسالة
              </Link>
            </div>
          ) : (
            <div className="mt-4"><Link href="/settings" className="cta-ghost text-sm">تعديل الملف الشخصي</Link></div>
          )}
        </div>
      </motion.div>

      {/* tabs */}
      <div className="sticky top-16 z-10 my-4 flex gap-1.5 rounded-2xl glass-strong p-1.5">
        {visibleTabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 rounded-xl px-3 py-2 text-sm font-bold transition ${tab === t.id ? "bg-gold-gradient text-white shadow-gold" : "text-ink-soft hover:text-ink"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* tab content */}
      {tab === "about" ? (
        <div className="bezel"><div className="bezel-core glass p-6">
          <h3 className="mb-3 text-base font-extrabold text-ink">حول</h3>
          {profile.bio ? <p className="leading-relaxed text-ink-soft">{profile.bio}</p> : <p className="text-ink-muted">لا توجد نبذة بعد.</p>}
          <div className="mt-5 grid grid-cols-3 gap-3">
            <div className="rounded-2xl bg-white/50 p-3 text-center"><Sparkles size={18} className="mx-auto text-gold" /><p className="mt-1 text-base font-extrabold text-ink ltr-nums">{profile.xp ?? 0}</p><p className="text-[11px] text-ink-muted">نقطة خبرة</p></div>
            <div className="rounded-2xl bg-white/50 p-3 text-center"><Flame size={18} className="mx-auto text-orange-500" /><p className="mt-1 text-base font-extrabold text-ink ltr-nums">{stats?.reposts ?? 0}</p><p className="text-[11px] text-ink-muted">إعادة نشر</p></div>
            <div className="rounded-2xl bg-white/50 p-3 text-center"><Calendar size={18} className="mx-auto text-gold" /><p className="mt-1 text-xs font-bold text-ink">{profile.created_at ? timeAgo(profile.created_at) : "—"}</p><p className="text-[11px] text-ink-muted">انضمّ</p></div>
          </div>
        </div></div>
      ) : loadingTab ? (
        <div className="space-y-4">{[0, 1].map((i) => <div key={i} className="h-40 animate-pulse rounded-3xl bg-champagne-100/70" />)}</div>
      ) : items.length === 0 ? (
        <div className="bezel"><div className="bezel-core glass p-10 text-center text-ink-soft">
          {tab === "posts" ? "لا توجد منشورات بعد." : tab === "reposts" ? "لا توجد إعادات نشر." : "لا توجد إعجابات."}
        </div></div>
      ) : (
        <div className="space-y-4">
          {items.map((p) => <PostCard key={p.id} post={p} author={authors[p.user_id] || profile} />)}
        </div>
      )}
    </div>
  );
}
