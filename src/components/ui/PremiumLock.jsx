import { Crown, Lock } from "lucide-react";
import Button from "./Button";
import { cn } from "./cn";

/**
 * Locked-content preview. Render ONLY non-sensitive teaser content as
 * `preview` — the real premium payload must never be sent to non-premium
 * users (enforce server-side / RLS). The preview is blurred and inert.
 *
 *   <PremiumLock title={t("…")} body={t("…")} cta={t("…")} preview={<Teaser/>} />
 */
export default function PremiumLock({ title, body, cta, href = "/subscriptions", preview, compact = false, className }) {
  return (
    <div className={cn("relative overflow-hidden rounded-lg border border-gold-200/70 bg-surface", className)}>
      {preview && (
        <div aria-hidden="true" inert className="pointer-events-none select-none p-5 opacity-60 blur-[3px]">
          {preview}
        </div>
      )}
      <div
        className={cn(
          "flex flex-col items-center text-center",
          preview ? "absolute inset-0 justify-center bg-gradient-to-t from-surface via-surface/90 to-surface/40 px-6" : compact ? "p-5" : "p-8"
        )}
      >
        <span className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-b from-gold-200 to-gold-300 text-[#5C431C] shadow-gold">
          <Lock size={20} aria-hidden="true" />
        </span>
        {title && <h3 className="t-h4 mt-3">{title}</h3>}
        {body && <p className="t-small mt-1 max-w-sm text-ink-3">{body}</p>}
        {cta && (
          <Button href={href} variant="gold" size="sm" iconStart={Crown} className="mt-4">
            {cta}
          </Button>
        )}
      </div>
    </div>
  );
}
