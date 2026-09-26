import { ArrowRight, BadgeCheck, BookOpenCheck, Flag, HeartHandshake, ShieldCheck } from "lucide-react";
import { getT } from "@/i18n/server";
import { Link } from "@/i18n/navigation";
import IconTile from "@/components/ui/IconTile";
import { cn } from "@/components/ui/cn";

const POINTS = [
  { key: "respect", icon: HeartHandshake },
  { key: "useful", icon: BookOpenCheck },
  { key: "privacy", icon: ShieldCheck },
  { key: "report", icon: Flag },
];

/** Four-line summary of /community-guidelines for the community rail. */
export default async function GuidelinesCard({ className }) {
  const t = await getT("community");
  return (
    <section aria-labelledby="cg-title" className={cn("surface p-5", className)}>
      <div className="flex items-center gap-3">
        <IconTile icon={BadgeCheck} tone="green" size="sm" />
        <h2 id="cg-title" className="t-h4">{t("rail.guidelines.title")}</h2>
      </div>
      <ul className="mt-4 space-y-3">
        {POINTS.map(({ key, icon: Icon }) => (
          <li key={key} className="flex items-start gap-2.5">
            <Icon size={16} aria-hidden="true" className="mt-[3px] shrink-0 text-green-600" />
            <span className="t-small text-ink-2">{t(`rail.guidelines.points.${key}`)}</span>
          </li>
        ))}
      </ul>
      <Link
        href="/community-guidelines"
        className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-gold-600 hover:underline hover:underline-offset-4"
      >
        {t("rail.guidelines.link")}
        <ArrowRight size={15} aria-hidden="true" className="flip-rtl" />
      </Link>
    </section>
  );
}
