import { FileText, ShieldCheck, ReceiptText, Scale, UsersRound } from "lucide-react";

// Registry of the legal documents. `key` is both the message key in the
// `legal` namespace (legal.<key>, legal.docs.<key>) and the SEO key in
// meta.pages.<key>. Order = order in the document switcher.
export const LEGAL_DOCS = [
  { key: "terms", href: "/terms", icon: FileText },
  { key: "privacy", href: "/privacy", icon: ShieldCheck },
  { key: "refund", href: "/refund", icon: ReceiptText },
  { key: "acceptableUse", href: "/acceptable-use", icon: Scale },
  { key: "communityGuidelines", href: "/community-guidelines", icon: UsersRound },
];

// Date of the current revision of ALL legal documents (ISO, shown as "last
// updated"). Change it whenever any document's substance changes.
export const LEGAL_UPDATED = "2026-09-25";

export const legalDoc = (key) => LEGAL_DOCS.find((d) => d.key === key);
