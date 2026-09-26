import HeroArt from "@/components/stages/HeroArt";
import { cn } from "@/components/ui/cn";

/**
 * Split hero for the help & company pages: copy on the start side, a framed
 * library painting on the end side (7/5 on desktop; 8/4 when `compact`, for
 * pages whose real content should start above the fold), preloaded for lg+
 * screens only. Below lg the art is dropped (primary content first) unless
 * `mobileArt`, which shows it as a lazy banner under the copy.
 */
export default function SupportHero({ eyebrow, title, lead, actions, children, footer, art, mobileArt = false, compact = false, className }) {
  return (
    <section className={cn("relative overflow-hidden bg-aura", className)}>
      <div
        className={cn(
          "container-jz grid items-center gap-8 lg:grid-cols-12 lg:gap-12",
          compact ? "pb-8 pt-8 sm:pb-10 sm:pt-10 lg:pb-12 lg:pt-12" : "pb-10 pt-8 sm:pb-14 sm:pt-12 lg:pb-16 lg:pt-14"
        )}
      >
        <div className={cn("animate-in min-w-0", compact ? "lg:col-span-8" : "lg:col-span-7")}>
          {eyebrow && <p className="t-eyebrow mb-3">{eyebrow}</p>}
          <h1 className="t-h1 max-w-[22ch]">{title}</h1>
          {lead && <p className="t-lead mt-4 max-w-[60ch]">{lead}</p>}
          {children && <div className="mt-7">{children}</div>}
          {actions && <div className="mt-7 flex flex-wrap gap-3">{actions}</div>}
          {footer && <div className="mt-8">{footer}</div>}
        </div>
        {art && (
          <div aria-hidden="true" className={cn(compact ? "lg:col-span-4" : "lg:col-span-5", !mobileArt && "hidden lg:block")}>
            <HeroArt
              id={art}
              from="lg"
              sizes={compact ? "(min-width: 1280px) 380px, 30vw" : "(min-width: 1280px) 480px, 38vw"}
              className="aspect-[4/3] object-cover"
              frameClassName={cn("shadow-md", compact && "ms-auto max-w-[380px]")}
              banner={mobileArt}
            />
          </div>
        )}
      </div>
    </section>
  );
}
