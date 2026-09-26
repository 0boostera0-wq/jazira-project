import { Library } from "lucide-react";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import { breadcrumbJsonLd, jsonLd } from "@/lib/seo";
import { cn } from "@/components/ui/cn";
import { SECTION_GAP } from "./parts";

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

/** A top-level section of a stage page (the app-wide section rhythm, SECTION_GAP). */
export function StageSection({ id, labelledBy, className, children }) {
  return (
    <section id={id} aria-labelledby={labelledBy} className={cn(SECTION_GAP, "scroll-mt-24", className)}>
      {children}
    </section>
  );
}
