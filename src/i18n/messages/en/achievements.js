// Owned by the achievements feature. Keep keys identical in ar/achievements.js and en/achievements.js.
// Badge goals in `badges.items.*.goal` must match src/components/achievements/badges.js.
// XP facts (`badges.groups.xp.body`, `competitions.climb.*`) must match the award rule in
// supabase/migrations/0010 (_exam_finalize: 2 XP per correct answer) and levelFor() in progress.js.
const achievements = {
  units: {
    // Unit label shown after a large figure ("740 XP").
    points: "XP",
    // Full phrase inside sentences.
    pointsCount: "{count} XP",
    days: { zero: "0 days", one: "{count} day", other: "{count} days" },
  },
  level: {
    short: "Level {level}",
    word: "Level",
    toNext: "{count} XP to level {level}",
    ringAria: "Level {level}, {pct} of the way to the next level",
  },

  // ── /achievements ────────────────────────────────────────────────────────
  page: {
    eyebrow: "Level, streak & badges",
    title: "Your achievements",
    lead: "Track your level, XP and daily streak in one place. Every badge has a clear goal, counted from what you actually do on Jazira.",
  },
  summary: {
    totalXp: "Total XP",
    currentStreak: "Current streak",
    longestStreak: "Longest streak",
    badges: "Badges",
    badgesValue: "{unlocked} of {total}",
    exams: "Exams completed",
    notTracked: "Not available yet",
    startTitle: "Start here",
    startBody: "Finish your first exam to unlock your first badge and start earning XP, then come back tomorrow to start your streak.",
    startCta: "Start your first exam",
  },
  guest: {
    title: "Sign in to track your progress",
    body: "Create a free account to save your XP and daily streak. Badges unlock automatically as you reach their goals.",
    signUp: "Create a free account",
    signIn: "Sign in",
  },
  states: {
    unavailableTitle: "We couldn't load your progress",
    unavailableBody: "Your data isn't reachable right now. Please try again in a moment.",
    retry: "Try again",
  },

  streak: {
    title: "Daily streak",
    current: "Current streak",
    longest: "Longest: {days}",
    status: {
      startTomorrow: "Today is logged. Come back tomorrow to start your streak.",
      keepGoing: "Today counts. Come back tomorrow to keep it going.",
      visitToday: "Nothing logged today yet. Being active today keeps your streak alive.",
      none: "Your streak starts on your first active day and grows with each consecutive day you return.",
    },
    calendar: {
      title: "Last 4 weeks",
      legendStreak: "Consecutive active days",
      legendExam: "Exam completed",
      legendToday: "Today",
      summary: "Calendar of the last 4 weeks. Consecutive active days: {days}.",
      summaryExams: "Days with a completed exam: {days}.",
      examsOn: { one: "{count} exam completed", other: "{count} exams completed" },
    },
    rule: "Days follow Saudi time. Missing a full day starts the count again.",
    guestTitle: "Your streak starts once you sign in",
    guestBody: "Each consecutive day you're active on Jazira adds a day to your streak.",
    unavailable: "Your streak isn't available right now.",
  },

  badges: {
    title: "Badges",
    lead: "{unlocked} of {total} unlocked. Each badge unlocks automatically when you reach its goal.",
    leadGuest: {
      one: "{count} badge with a clear goal. Sign in to start earning it.",
      other: "{count} badges, each with a clear goal. Sign in to start earning them.",
    },
    tabsLabel: "Badge categories",
    groupCount: "{unlocked} of {total}",
    groups: {
      exams: { title: "Exams", body: "Counted from the exams you finish." },
      streak: { title: "Streaks", body: "Counted from your longest streak, so a badge stays yours even if a streak ends." },
      xp: { title: "XP", body: "Earned in exams: 2 XP for every correct answer." },
      community: { title: "Community", body: "Counted from your posts and comments in the Jazira community." },
    },
    items: {
      firstExam: { name: "First step", goal: "Complete your first exam" },
      exams10: { name: "Regular", goal: "Complete 10 exams" },
      exams50: { name: "Exam expert", goal: "Complete 50 exams" },
      streak3: { name: "Warming up", goal: "Reach a 3-day streak" },
      streak7: { name: "Full week", goal: "Reach a 7-day streak" },
      streak30: { name: "Month strong", goal: "Reach a 30-day streak" },
      xp100: { name: "First hundred", goal: "Earn 100 XP" },
      xp500: { name: "Rising", goal: "Earn 500 XP" },
      xp1000: { name: "Thousand club", goal: "Earn 1,000 XP" },
      firstPost: { name: "First post", goal: "Publish your first community post" },
      posts10: { name: "Community voice", goal: "Publish 10 posts" },
      comments10: { name: "Helpful peer", goal: "Write 10 comments" },
    },
    state: {
      unlocked: "Unlocked",
      locked: "Locked",
      progress: "{value} of {goal}",
      notTracked: "Not tracked yet",
    },
  },

  next: {
    title: "Closest to unlock",
    lead: "Badges you're nearly there on.",
    remaining: {
      exams: { one: "{count} exam to go", other: "{count} exams to go" },
      streak: { one: "{count} day to go", other: "{count} days to go" },
      xp: "{count} XP to go",
      posts: { one: "{count} post to go", other: "{count} posts to go" },
      comments: { one: "{count} comment to go", other: "{count} comments to go" },
    },
    cta: {
      exams: "Start an exam",
      xp: "Earn XP in an exam",
      community: "Go to the community",
    },
    guestTitle: "Good first badges",
    guestLead: "Close goals you can unlock in your first days on Jazira.",
    done: "Well done. You've unlocked every badge available.",
    empty: "Your closest badges will appear here once your activity is being counted.",
  },

  // ── /competitions ────────────────────────────────────────────────────────
  competitions: {
    eyebrow: "Leaderboard",
    title: "Competitions",
    lead: "Jazira students ranked by total XP. See where you stand and keep climbing, one step at a time.",
    rules: {
      xp: { title: "Total XP", body: "Ranked by each profile's total XP since joining." },
      ties: { title: "Fair ties", body: "Students with equal XP share the same rank." },
      privacy: { title: "Your privacy, respected", body: "Students who chose to stay anonymous in the community appear without a name or photo." },
    },
    board: {
      title: "All-time ranking",
      allTime: "All time",
      ranked: {
        zero: "No one ranked yet",
        one: "{count} ranked student",
        other: "{count} ranked students",
      },
      columns: { rank: "Rank", student: "Student", xp: "XP" },
      you: "You",
      anonymous: "Anonymous",
      unnamed: "Jazira student",
      rankAria: "Rank {rank}",
      podiumLabel: "Top three",
      listLabel: "Ranking",
      yourPlace: "Your place in the ranking",
      limitNote: {
        one: "Showing the top student.",
        other: "Showing the top {count} students.",
      },
      emptyTitle: "No one on the board yet",
      emptyBody: "Names appear here once students earn their first XP.",
      errorTitle: "We couldn't load the leaderboard",
      errorBody: "The ranking isn't reachable right now. Please try again in a moment.",
    },
    standing: {
      title: "Your standing",
      rank: "Rank {rank}",
      of: {
        one: "of {count} ranked student",
        other: "of {count} ranked students",
      },
      gap: "{points} behind rank {rank}",
      top: "You're in first place. Hold on to it.",
      notRankedTitle: "You're not on the board yet",
      notRankedBody: "Everyone with at least 1 XP is ranked.",
      anonymousNote: "Your name is hidden on the board because you chose to appear anonymously in the community.",
      privacyLink: "Privacy settings",
      achievementsLink: "Your achievements",
      guestTitle: "Sign in to see your rank",
      guestBody: "Once you're signed in, this card shows:",
      guestPoints: {
        rank: "Your rank among ranked students",
        xp: "Your XP and current level",
        gap: "How far you are from the next place",
      },
    },
    climb: {
      title: "How to climb the ranking",
      steps: {
        exam: "Finish a Qudurat or Tahsili exam while signed in.",
        correct: "Every correct answer adds 2 XP to your total.",
        level: "Each level needs 100 XP more than the one before it.",
      },
      cta: "Start an exam",
    },
    season: {
      title: "Seasons",
      status: "No active season",
      body: "There's no prize competition running right now, so this ranking is for motivation only. If a season launches, its rules, dates and prizes will be announced on this page first.",
    },
  },

  // ── shared rail links ──────────────────────────────────────────────────────
  related: {
    title: "Related",
    competitions: { title: "Leaderboard", body: "Where you rank on the all-time XP board." },
    community: { title: "Jazira community", body: "Your posts and comments count toward community badges." },
    achievements: { title: "Your achievements", body: "Level, daily streak and badges." },
    privacy: { title: "How others see you", body: "Appear by name or anonymously in the community and the ranking." },
  },
};

export default achievements;
