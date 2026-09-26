import { Check } from "lucide-react";
import Illustration from "@/components/ui/Illustration";
import { cn } from "@/components/ui/cn";

/**
 * The brand panel's illustration + guidance points, repeated under the form
 * below `lg`, where AuthShell hides that panel (server component).
 * Phones get the points only (decoration reduced); from `sm` the page's
 * illustration sits beside them so tablets don't show a lone form on an
 * empty canvas.
 *
 *   <AuthTips title points illustration="landing.privacy" />            // < lg
 *   <AuthTips … from="sm" />                                            // sm – lg only
 *
 * `from="sm"` suits pages whose phone layout should stay form-only
 * (sign-in, sign-up, verify: the form already carries the essentials).
 */
export default function AuthTips({ title, points = [], illustration, from = "base" }) {
  if (!points.length) return null;
  return (
    <section
      className={cn(
        "mt-8 rounded-lg border border-line/10 bg-surface-2/70 p-4 sm:p-5 lg:hidden",
        from === "sm" && "hidden sm:block"
      )}
    >
      <div className="flex items-center gap-4 sm:gap-5">
        {illustration && (
          // A cropped tile: the art is scaled past its own margins so the scene reads at this size.
          <div className="hidden w-32 shrink-0 overflow-hidden rounded-md bg-surface ring-1 ring-inset ring-line/10 sm:block" aria-hidden="true">
            <div className="scale-[1.4]">
              <Illustration id={illustration} />
            </div>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="text-[0.9375rem] font-medium text-ink">{title}</h2>
          <ul className="mt-3 grid gap-2.5">
            {points.map((p) => (
              <li key={p} className="flex items-start gap-2.5 text-pretty text-sm text-ink-2">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-green-100 text-green-700">
                  <Check size={12} aria-hidden="true" />
                </span>
                {p}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
