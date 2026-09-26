import { getT, setRequestLocale } from "@/i18n/server";
import { faqJsonLd, jsonLd } from "@/lib/seo";
import { resolveFaq } from "@/components/support/faqCatalog";

// Server layout: FAQPage structured data (rich results) built from the active
// locale's questions, so the interactive page below stays a thin client island.
export default async function FaqLayout(props) {
  const params = await props.params;

  const {
    children
  } = props;

  setRequestLocale(params.locale);
  const t = await getT("support");
  const items = resolveFaq(t, params.locale).map(({ q, a }) => ({ q, a }));
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(faqJsonLd(items)) }} />
      {children}
    </>
  );
}
