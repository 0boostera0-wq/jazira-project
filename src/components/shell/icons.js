// Explicit icon registry for navigation (keeps lucide tree-shaking intact —
// never `import * as Icons`). Keys match the `icon` names in src/lib/nav.js.
import {
  Backpack, BookOpen, Brain, ClipboardCheck, Crown, FlaskConical, GraduationCap, HelpCircle,
  Home, LayoutDashboard, Library, LifeBuoy, Mail, Medal, Menu, MessageCircle, Settings,
  Sparkles, Trophy, Users,
} from "lucide-react";

export const NAV_ICONS = {
  Backpack, BookOpen, Brain, ClipboardCheck, Crown, FlaskConical, GraduationCap, HelpCircle,
  Home, LayoutDashboard, Library, LifeBuoy, Mail, Medal, Menu, MessageCircle, Settings,
  Sparkles, Trophy, Users,
};
