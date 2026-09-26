import { BadgeCheck, CalendarX2, ChevronRight, LifeBuoy, LockKeyhole } from "lucide-react";
import { getT } from "@/i18n/server";
import { Link } from "@/i18n/navigation";
import Button from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { PAYMENT_PROVIDER } from "./plan";

const LINK = "inline-flex min-h-[44px] items-center text-gold-600 underline-offset-4 hover:underline";

const ITEMS = [
  { key: "provider", icon: LockKeyhole },
  { key: "verified", icon: BadgeCheck },
  { key: "cancel", icon: CalendarX2 },
];

/**
 * Payment trust notes + policy links. Server component.
 * `only` limits the notes shown (e.g. ["provider", "cancel"] where the page
 * already explains activation). `as` sets the heading level for the context.
 */
export async function TrustNotes({ className, title = true, support = false, only, as: H = "h3" }) {
  const items = only ? ITEMS.filter((it) => only.includes(it.key)) : ITEMS;
  const [t, tc] = await Promise.all([getT("subscriptions"), getT("common")]);
  return (
    <section aria-labelledby={title ? "trust-notes" : undefined} className={cn("surface-tint p-5 sm:p-6", className)}>
      {title && <H id="trust-notes" className="t-h4">{t("trust.title")}</H>}
      <ul className={cn("space-y-4", title && "mt-4")}>
        {items.map(({ key, icon: Icon }) => (
          <li key={key} className="flex items-start gap-3">
            <Icon size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-gold-600" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">{t(`trust.${key}.title`)}</p>
              <p className="t-caption mt-0.5">{t(`trust.${key}.body`, { provider: PAYMENT_PROVIDER })}</p>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-5 flex flex-wrap gap-x-4 border-t border-line/10 pt-2 text-sm">
        <Link href="/terms" className={LINK}>{t("trust.terms")}</Link>
        <Link href="/refund" className={LINK}>{t("trust.refund")}</Link>
        {support && <Link href="/support" className={LINK}>{tc("actions.contactSupport")}</Link>}
      </div>
    </section>
  );
}

const POLICIES = [
  { href: "/terms", key: "trust.terms" },
  { href: "/refund", key: "trust.refund" },
  { href: "/privacy", key: "policies.privacy" },
];

/**
 * Billing policies at a glance → the legal pages. Sits beside the billing FAQ
 * (whose answers already cover the trust notes, so they aren't repeated there).
 * Server component.
 */
export async function PolicyCard({ className, as: H = "h3" }) {
  const t = await getT("subscriptions");
  return (
    <section aria-labelledby="billing-policies" className={cn("surface-tint p-5 sm:p-6", className)}>
      <H id="billing-policies" className="t-h4">{t("policies.title")}</H>
      <p className="t-caption mt-1">{t("policies.body")}</p>
      <ul className="mt-3 divide-y divide-line/10 border-t border-line/10">
        {POLICIES.map(({ href, key }) => (
          <li key={href}>
            <Link
              href={href}
              className="group flex min-h-[44px] items-center justify-between gap-3 text-sm font-medium text-ink transition-colors hover:text-gold-700"
            >
              {t(key)}
              <ChevronRight size={16} aria-hidden="true" className="flip-rtl shrink-0 text-ink-3 group-hover:text-gold-600" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** "Questions about your plan?" → support centre. Server component. */
export async function HelpCard({ className, title, as: H = "h3" }) {
  const t = await getT("subscriptions");
  return (
    <section className={cn("surface-flat flex items-start gap-3.5 p-5 sm:p-6", className)}>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-surface-2 text-ink-2">
        <LifeBuoy size={19} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <H className="t-h4">{title || t("help.title")}</H>
        <p className="t-caption mt-1">{t("help.body")}</p>
        <Button href="/support" variant="secondary" size="sm" className="mt-3.5 max-sm:h-11">{t("help.cta")}</Button>
      </div>
    </section>
  );
}
