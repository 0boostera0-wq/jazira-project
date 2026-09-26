import { Library } from "lucide-react";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import { breadcrumbJsonLd, jsonLd } from "@/lib/seo";

/** BreadcrumbList JSON-LD: Curriculum › <stage>. */
export function StageJsonLd({ items, locale }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbJsonLd(items, locale)) }} />;
}

/** Shown when the catalog has no grades for a stage (never a blank page). */
export function StageEmpty({ t }) {
  return (
    <div className="surface-flat">
      <EmptyState
        image="support.empty"
        title={t("shared.empty.title")}
        description={t("shared.empty.body")}
        action={
          <Button href="/curriculum" variant="primary" iconStart={Library}>
            {t("shared.empty.cta")}
          </Button>
        }
      />
    </div>
  );
}

/** Vertical rhythm between the sections of a stage page. */
export function StageSection({ id, labelledBy, className, children }) {
  return (
    <section id={id} aria-labelledby={labelledBy} className={["mt-16 scroll-mt-24 sm:mt-24", className].filter(Boolean).join(" ")}>
      {children}
    </section>
  );
}
