// Information architecture — single source of truth for every navigation
// surface (desktop sidebar, mobile bottom bar + "more" sheet, marketing header,
// footer, command search). Labels are message keys in the `nav` namespace;
// icons are lucide-react names resolved by the shell components.

export const APP_NAV = [
  {
    section: "learn",
    items: [
      { key: "dashboard", href: "/dashboard", icon: "LayoutDashboard", auth: true },
      { key: "curriculum", href: "/curriculum", icon: "Library" },
      { key: "elementary", href: "/elementary", icon: "Backpack" },
      { key: "middle", href: "/middle", icon: "BookOpen" },
      { key: "highSchool", href: "/high-school", icon: "GraduationCap" },
    ],
  },
  {
    section: "practice",
    items: [
      { key: "exams", href: "/exams", icon: "ClipboardCheck", exact: true },
      { key: "aptitude", href: "/exams/aptitude", icon: "Brain" },
      { key: "achievement", href: "/exams/achievement", icon: "FlaskConical" },
      { key: "assistant", href: "/assistant", icon: "Sparkles" },
    ],
  },
  {
    section: "community",
    items: [
      { key: "community", href: "/community", icon: "Users" },
      { key: "messages", href: "/chat", icon: "MessageCircle", auth: true, badge: "messages" },
      { key: "achievements", href: "/achievements", icon: "Trophy" },
      { key: "competitions", href: "/competitions", icon: "Medal" },
    ],
  },
  {
    section: "account",
    items: [
      { key: "subscription", href: "/subscriptions", icon: "Crown", accent: "gold" },
      { key: "settings", href: "/settings", icon: "Settings", auth: true },
    ],
  },
  {
    section: "help",
    items: [
      { key: "support", href: "/support", icon: "LifeBuoy" },
      { key: "faq", href: "/faq", icon: "HelpCircle" },
      { key: "contact", href: "/contact", icon: "Mail" },
    ],
  },
];

// Mobile bottom bar (max 5). "more" opens a sheet with the full APP_NAV.
export const BOTTOM_TABS = [
  { key: "home", href: "/dashboard", guestHref: "/", icon: "Home" },
  { key: "learn", href: "/curriculum", icon: "Library" },
  { key: "exams", href: "/exams", icon: "ClipboardCheck" },
  { key: "community", href: "/community", icon: "Users" },
  { key: "more", icon: "Menu" },
];

// Public marketing header.
export const MARKETING_NAV = [
  { key: "curriculum", href: "/curriculum" },
  { key: "exams", href: "/exams" },
  { key: "assistant", href: "/#assistant" },
  { key: "pricing", href: "/subscriptions" },
  { key: "faq", href: "/faq" },
];

// Footer columns (labels from nav.items / nav.footer).
export const FOOTER_NAV = [
  { group: "learn", links: [["items.curriculum", "/curriculum"], ["items.elementary", "/elementary"], ["items.middle", "/middle"], ["items.highSchool", "/high-school"]] },
  { group: "platform", links: [["items.exams", "/exams"], ["items.aptitude", "/exams/aptitude"], ["items.achievement", "/exams/achievement"], ["items.community", "/community"], ["items.subscription", "/subscriptions"]] },
  { group: "help", links: [["items.about", "/about"], ["items.support", "/support"], ["items.faq", "/faq"], ["items.contact", "/contact"], ["items.reviews", "/reviews"]] },
  { group: "legal", links: [["footer.privacy", "/privacy"], ["footer.terms", "/terms"], ["footer.refund", "/refund"], ["footer.acceptableUse", "/acceptable-use"], ["footer.guidelines", "/community-guidelines"]] },
];

/** Is `href` active for the current (unprefixed) pathname? */
export function isActive(pathname, href, exact = false) {
  if (!href) return false;
  if (exact || href === "/") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
