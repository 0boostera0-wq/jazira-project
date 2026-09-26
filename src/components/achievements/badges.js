import {
  CalendarCheck,
  ClipboardCheck,
  Flame,
  Footprints,
  Gem,
  GraduationCap,
  MessageCircleHeart,
  MessagesSquare,
  Mountain,
  PenLine,
  Sparkles,
  Star,
} from "lucide-react";

// Badge catalogue. Every badge is a single measurable goal on REAL data:
//   exams    completed exam attempts   (get_exam_stats RPC)
//   streak   longest daily streak      (streaks table — longest, so a badge
//                                        is never lost when a streak ends)
//   xp       profiles.xp
//   posts    community_posts by the user
//   comments post_comments by the user
// Names and goal text live in messages: achievements.badges.items.<id>.
export const BADGE_GROUPS = [
  {
    key: "exams",
    href: "/exams",
    items: [
      { id: "firstExam", metric: "exams", goal: 1, icon: Footprints },
      { id: "exams10", metric: "exams", goal: 10, icon: ClipboardCheck },
      { id: "exams50", metric: "exams", goal: 50, icon: GraduationCap },
    ],
  },
  {
    key: "streak",
    href: null,
    items: [
      { id: "streak3", metric: "streak", goal: 3, icon: Flame },
      { id: "streak7", metric: "streak", goal: 7, icon: CalendarCheck },
      { id: "streak30", metric: "streak", goal: 30, icon: Mountain },
    ],
  },
  {
    // XP is awarded server-side when an exam is graded (+2 per correct
    // answer, _exam_finalize in supabase/migrations/0010). If that rule
    // changes, update achievements.badges.groups.xp.body and
    // achievements.competitions.climb.* in both locales.
    key: "xp",
    href: "/exams",
    items: [
      { id: "xp100", metric: "xp", goal: 100, icon: Star },
      { id: "xp500", metric: "xp", goal: 500, icon: Sparkles },
      { id: "xp1000", metric: "xp", goal: 1000, icon: Gem },
    ],
  },
  {
    key: "community",
    href: "/community",
    items: [
      { id: "firstPost", metric: "posts", goal: 1, icon: PenLine },
      { id: "posts10", metric: "posts", goal: 10, icon: MessagesSquare },
      { id: "comments10", metric: "comments", goal: 10, icon: MessageCircleHeart },
    ],
  },
];

export const BADGE_TOTAL = BADGE_GROUPS.reduce((n, g) => n + g.items.length, 0);

/**
 * metrics: { exams, streak, xp, posts, comments } — a metric is `null` when it
 * can't be measured (feature/RPC not deployed yet, or a guest).
 * Returns groups with each badge's { value, unlocked, available, pct }.
 */
export function evaluateBadges(metrics = {}) {
  const groups = BADGE_GROUPS.map((g) => ({
    ...g,
    items: g.items.map((b) => {
      const raw = metrics[b.metric];
      const available = typeof raw === "number" && Number.isFinite(raw);
      const value = available ? Math.max(0, raw) : 0;
      const unlocked = available && value >= b.goal;
      return { ...b, group: g.key, href: g.href, value: Math.min(value, b.goal), available, unlocked, pct: available ? Math.min(100, (value / b.goal) * 100) : 0 };
    }),
  }));
  const all = groups.flatMap((g) => g.items);
  const unlocked = all.filter((b) => b.unlocked).length;
  // Closest locked badges the user can actually progress on (highest % first),
  // one per metric before any metric repeats, so the three suggestions point
  // at different kinds of activity.
  const candidates = all
    .filter((b) => b.available && !b.unlocked)
    .sort((a, b) => b.pct - a.pct || a.goal - b.goal);
  const seen = new Set();
  const firstPerMetric = candidates.filter((b) => !seen.has(b.metric) && seen.add(b.metric));
  const next = [...firstPerMetric, ...candidates.filter((b) => !firstPerMetric.includes(b))].slice(0, 3);
  return { groups, unlocked, total: all.length, next };
}
