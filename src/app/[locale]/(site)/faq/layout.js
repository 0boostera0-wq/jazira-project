import { FAQ_GROUPS } from "@/lib/faq";
import { faqJsonLd } from "@/lib/seo";

export const metadata = {
  title: "الأسئلة الشائعة",
  description: "إجابات واضحة على أكثر الأسئلة شيوعاً حول منصة جزيرة — التسجيل واختبارات القدرات والتحصيلي وباقة النخبة والمساعد الذكي.",
  alternates: { canonical: "/faq" },
};

// Server layout: injects FAQPage structured data (rich snippets) for the FAQ
// route without converting the interactive client page.
export default function FaqLayout({ children }) {
  const items = FAQ_GROUPS.flatMap((g) => g.subs || []);
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd(items)) }}
      />
      {children}
    </>
  );
}
