import { ArrowRight, ArrowUpRight, HelpCircle, LifeBuoy, Mail, MessageCircle } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getT } from "@/i18n/server";
import { supportWhatsAppUrl } from "@/lib/constants";
import IconTile from "@/components/ui/IconTile";
import { cn } from "@/components/ui/cn";

const CHANNELS = [
  { key: "whatsapp", icon: MessageCircle, tone: "green", external: true },
  { key: "form", icon: Mail, tone: "gold", href: "/contact" },
  { key: "center", icon: LifeBuoy, tone: "neutral", href: "/support" },
  { key: "faq", icon: HelpCircle, tone: "neutral", href: "/faq" },
];

const rowClass =
  "group flex min-h-[4.5rem] items-center gap-4 rounded-lg border border-line/15 bg-surface p-4 shadow-xs transition-[transform,box-shadow,border-color] duration ease-out hover:-translate-y-0.5 hover:border-line/20 hover:shadow-md";

/**
 * Support channels as link cards (server component).
 * `only` picks channels in order; defaults to all four.
 */
export default async function ContactChannels({ only, className }) {
  const t = await getT("support");
  const list = only ? only.map((k) => CHANNELS.find((c) => c.key === k)).filter(Boolean) : CHANNELS;

  return (
    <ul className={cn("space-y-3", className)}>
      {list.map(({ key, icon, tone, href, external }) => {
        const body = (
          <>
            <IconTile icon={icon} tone={tone} />
            <span className="min-w-0 flex-1">
              <span className="block text-[0.9375rem] font-medium text-ink">{t(`shared.${key}.title`)}</span>
              <span className="t-small mt-0.5 block text-ink-3">{t(`shared.${key}.body`)}</span>
            </span>
            {external ? (
              <ArrowUpRight size={18} aria-hidden="true" className="flip-rtl shrink-0 text-ink-4 transition-colors group-hover:text-ink" />
            ) : (
              <ArrowRight size={18} aria-hidden="true" className="flip-rtl shrink-0 text-ink-4 transition-colors group-hover:text-ink" />
            )}
          </>
        );
        return (
          <li key={key}>
            {external ? (
              <a href={supportWhatsAppUrl()} target="_blank" rel="noopener noreferrer" className={rowClass}>
                {body}
                <span className="sr-only">({t("shared.external")})</span>
              </a>
            ) : (
              <Link href={href} className={rowClass}>
                {body}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
