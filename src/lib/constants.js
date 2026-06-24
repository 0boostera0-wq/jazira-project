// Shared constants & Arabic copy for منصة جزيرة.

export const BRAND = {
  name: "منصة جزيرة",
  tagline: "بيئة تعليمية فاخرة للنخبة",
  emoji: "🏝️",
};

// Elite subscription
export const ELITE = {
  name: "باقة النخبة",
  priceSAR: 19,
  perks: [
    "وصول غير محدود لجميع اختبارات القدرات والتحصيلي",
    "محادثة غير محدودة مع المساعد الذكي",
    "وسام ذهبي مميّز بجانب اسمك في المجتمع",
    "أولوية الدعم الفني الفاخر",
    "إحصائيات أداء متقدمة وتحليل نقاط الضعف",
  ],
};

// Referral system
export const REFERRAL_TARGET = 5; // friends needed to unlock premium without paying

// AI Assistant usage limits (free users)
export const AI_FREE_LIMIT = 5; // messages (Elite = unlimited)
export const AI_WINDOW_MS = 8 * 60 * 60 * 1000; // 8 hours

// Live support (WhatsApp)
export const SUPPORT_WHATSAPP =
  process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP || "966573902089";
export const SUPPORT_MESSAGE = "مرحبا احتاج مساعده";
export const supportWhatsAppUrl = () =>
  `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(SUPPORT_MESSAGE)}`;

// Qudurat test engine
export const QUDURAT_SECONDS_PER_QUESTION = 40;
export const QUDURAT_QUESTIONS_PER_TEST = 10;

// Competitions prize tiers
export const PRIZES = [
  { rank: 1, label: "المركز الأول", prize: "PlayStation 5", icon: "🎮", color: "#C9A227" },
  { rank: 2, label: "المركز الثاني", prize: "500 ريال", icon: "💵", color: "#B9B9B9" },
  { rank: 3, label: "المركز الثالث", prize: "iPad", icon: "📱", color: "#CD7F32" },
];

// Sidebar navigation
export const NAV_SECTIONS = [
  {
    title: "القائمة الرئيسية",
    items: [
      { key: "home", label: "الرئيسية", href: "/dashboard", icon: "Home" },
      {
        key: "tracks",
        label: "المسارات الدراسية",
        icon: "BookOpen",
        accordion: [
          { label: "ابتدائي", href: "/elementary" },
          { label: "متوسط", href: "/middle" },
          { label: "ثانوي", href: "/high-school" },
        ],
      },
      {
        key: "qudurat",
        label: "اختبارات القدرات والتحصيلي",
        href: "/high-school",
        icon: "GraduationCap",
      },
      { key: "community", label: "المجتمع التعليمي", href: "/community", icon: "Users" },
      {
        key: "achievements",
        label: "الإنجازات والأوسمة والسلاسل اليومية",
        href: "/achievements",
        icon: "Trophy",
      },
    ],
  },
  {
    title: "الدعم والمعلومات",
    items: [
      { key: "about", label: "عن جزيرة", href: "/about", icon: "Info" },
      { key: "reviews", label: "آراء الطلبة", href: "/reviews", icon: "Star" },
      { key: "faq", label: "الأسئلة الشائعة", href: "/faq", icon: "HelpCircle" },
      { key: "support", label: "الدعم الفني", href: "/support", icon: "Headphones" },
      { key: "settings", label: "الإعدادات", href: "/settings", icon: "Settings" },
    ],
  },
];

// Storage keys (localStorage)
export const STORAGE = {
  aiUsage: "jazira_ai_usage_v1",
  subscription: "jazira_subscription_v1",
  xp: "jazira_xp_v1",
  freeTrialUsed: "jazira_free_trial_used_v1",
  referrals: "jazira_referrals_v1",
  referralCode: "jazira_referral_code_v1",
  chats: "jazira_chats_v1", // prefix; actual key is per-user
  theme: "jazira_theme_v1", // "light" | "dark"
};
