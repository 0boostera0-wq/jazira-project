import PageHero from "@/components/ui/PageHero";
import { cn } from "@/components/ui/cn";

/**
 * Hero for the help & company pages: the page's image full-bleed under the
 * marketing header with the title panel over it (PageHero, site variant);
 * the page's own controls (search, actions, a footer line) follow under the band.
 */
export default function SupportHero({ eyebrow, title, lead, actions, children, footer, art, className }) {
  const below = children || actions || footer;
  return (
    <PageHero variant="site" image={art} eyebrow={eyebrow} title={title} lead={lead} className={cn("animate-in", className)}>
      {below && (
        <div className="max-w-3xl">
          {children}
          {actions && <div className={cn("flex flex-wrap gap-3", children && "mt-6")}>{actions}</div>}
          {footer && <div className="mt-8">{footer}</div>}
        </div>
      )}
    </PageHero>
  );
}
