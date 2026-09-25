"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { useT } from "@/i18n/client";
import { useAuthUser } from "@/context/AuthProvider";
import { APP_NAV, isActive } from "@/lib/nav";
import { NAV_ICONS } from "./icons";
import { cn } from "@/components/ui/cn";

/**
 * The grouped app navigation, shared by the desktop sidebar and the mobile
 * "more" sheet. Auth-only items are hidden for guests.
 */
export default function NavList({ onNavigate, dense = false, className }) {
  const pathname = usePathname();
  const t = useT("nav");
  const tc = useT("common");
  const { isSignedIn } = useAuthUser();

  return (
    <nav aria-label={tc("a11y.mainNav")} className={className}>
      {APP_NAV.map((section) => {
        const items = section.items.filter((it) => !it.auth || isSignedIn);
        if (!items.length) return null;
        return (
          <div key={section.section} className={dense ? "mb-3" : "mb-5"}>
            <p className="mb-1.5 px-3 text-xs font-medium text-ink-4">{t(`sections.${section.section}`)}</p>
            <ul className="space-y-0.5">
              {items.map((it) => {
                const Icon = NAV_ICONS[it.icon];
                const active = isActive(pathname, it.href, it.exact);
                return (
                  <li key={it.key}>
                    <Link
                      href={it.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group relative flex h-10 items-center gap-3 rounded-md px-3 text-[0.9375rem] transition-colors duration-fast",
                        active
                          ? "bg-surface font-medium text-ink shadow-xs ring-1 ring-inset ring-line/10"
                          : "text-ink-2 hover:bg-surface/70 hover:text-ink"
                      )}
                    >
                      {active && <span aria-hidden="true" className="absolute inset-y-2 start-0 w-[3px] rounded-full bg-gold-400" />}
                      {Icon && (
                        <Icon
                          size={18}
                          aria-hidden="true"
                          className={cn(active ? "text-gold-600" : it.accent === "gold" ? "text-gold-500" : "text-ink-3 group-hover:text-ink-2")}
                        />
                      )}
                      <span className="truncate">{t(`items.${it.key}`)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
