// Small presentational pieces shared by the auth forms (server-safe: no hooks).

import IconTile from "@/components/ui/IconTile";
import Skeleton from "@/components/ui/Skeleton";
import Spinner from "@/components/ui/Spinner";
import { cn } from "@/components/ui/cn";

// Standalone text links. The ::after pad grows the tap area to ~44px tall
// without moving layout (links sit in single-line rows with room around them).
const tapArea = "relative after:absolute after:-inset-x-1 after:-inset-y-3";
export const linkCls = `${tapArea} font-medium text-gold-600 underline-offset-4 hover:underline`;

/** "— or with email —" rule between Google and the e-mail form. */
export function AuthDivider({ label }) {
  return (
    <div className="my-6 flex items-center gap-3" role="separator" aria-label={label}>
      <span className="h-px flex-1 bg-line/15" />
      <span className="text-[0.8125rem] text-ink-3">{label}</span>
      <span className="h-px flex-1 bg-line/15" />
    </div>
  );
}

/** An e-mail address shown inside running text (always LTR, never overflows). */
export function EmailChip({ email, className }) {
  return (
    <bdi dir="ltr" className={cn("break-all font-medium text-ink", className)}>
      {email}
    </bdi>
  );
}

// Stable callback ref (a new function each render would re-focus on every tick).
const focusOnMount = (el) => el?.focus();

/**
 * A step result inside the form column: sent / done / expired.
 *   <StatusPanel icon={MailCheck} tone="gold" title body>{actions}</StatusPanel>
 * `titleAs` keeps the outline correct (the page <h1> comes from AuthShell).
 * `announce` moves focus to the title when the panel replaces a form, so
 * keyboard and screen-reader users land on the new step (client parents only).
 */
export function StatusPanel({ icon, tone = "gold", title, titleAs: H = "h2", announce = false, children, footer, className }) {
  return (
    <section className={cn("animate-in rounded-lg border border-line/15 bg-surface p-5 shadow-xs sm:p-6", className)}>
      <div className="flex items-start gap-4">
        <IconTile icon={icon} tone={tone} size="md" />
        <div className="min-w-0 flex-1">
          <H className="t-h4 focus:outline-none focus-visible:shadow-none" tabIndex={announce ? -1 : undefined} ref={announce ? focusOnMount : undefined}>
            {title}
          </H>
          <div className="t-small mt-1.5 text-ink-2">{children}</div>
        </div>
      </div>
      {footer && <div className="mt-5 grid gap-2.5">{footer}</div>}
    </section>
  );
}

/** Placeholder mirroring a short auth form while the session resolves. */
export function AuthFormSkeleton({ fields = 2, avatar = false }) {
  return (
    <div className="grid gap-5" aria-hidden="true">
      {avatar && (
        <div className="flex items-center gap-4">
          <Skeleton className="h-20 w-20" rounded="full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
        </div>
      )}
      {Array.from({ length: fields }, (_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-11 w-full" rounded="md" />
        </div>
      ))}
      <Skeleton className="mt-1 h-12 w-full" rounded="full" />
    </div>
  );
}

/** Shown instead of a form while we send an already signed-in visitor on. */
export function Redirecting({ label }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-line/15 bg-surface p-5 text-ink-2" role="status">
      <Spinner size={18} className="text-gold-600" />
      <span className="t-small">{label}</span>
    </div>
  );
}
