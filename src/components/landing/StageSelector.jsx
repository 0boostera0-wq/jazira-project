import { ChevronRight } from "lucide-react";
import { getT } from "@/i18n/server";
import { Link } from "@/i18n/navigation";
import Illustration from "@/components/ui/Illustration";
import { Container, Section } from "@/components/ui/Layout";
import { cn } from "@/components/ui/cn";
import { ArrowLink, Intro } from "./parts";

const SCHOOL = [
  { key: "elementary", href: "/elementary", art: "elementary.hero" },
  { key: "middle", href: "/middle", art: "middle.hero" },
  { key: "highSchool", href: "/high-school", art: "high-school.hero" },
];
const EXAMS = [
  { key: "aptitude", href: "/exams/aptitude", art: "aptitude.hero" },
  { key: "achievement", href: "/exams/achievement", art: "achievement.hero" },
];

/**
 * Stage & goal selector.
 *   md+: three tall school-stage cards (painting header, copy below) and two
 *        wide gold exam cards (art at the start, copy beside it).
 *   <md: one compact list of rows with a small art thumbnail — quick to scan
 *        and tap, no oversized decoration.
 */
export default async function StageSelector() {
  const t = await getT("landing");
  return (
    <Section id="stages" size="sm" aria-labelledby="stages-title" className="!pt-2 sm:!pt-4">
      <Container>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-8">
          <Intro id="stages-title" eyebrow={t("stages.eyebrow")} title={t("stages.title")} lead={t("stages.description")} />
          <ArrowLink href="/curriculum" className="shrink-0">{t("stages.all")}</ArrowLink>
        </div>

        <Group label={t("stages.groups.school")} dot="bg-green-500" className="mt-8 sm:mt-10">
          <ul className="grid gap-3 md:grid-cols-3 md:gap-4 lg:gap-5">
            {SCHOOL.map((it) => (
              <li key={it.key}>
                <StageCard t={t} item={it} />
              </li>
            ))}
          </ul>
        </Group>

        <Group label={t("stages.groups.exams")} dot="bg-gold-500" className="mt-7 sm:mt-8">
          <ul className="grid gap-3 md:gap-4 lg:grid-cols-2 lg:gap-5">
            {EXAMS.map((it) => (
              <li key={it.key}>
                <StageCard t={t} item={it} exam />
              </li>
            ))}
          </ul>
        </Group>
      </Container>
    </Section>
  );
}

function Group({ label, dot, className, children }) {
  return (
    <div className={className}>
      <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-ink-2">
        <span aria-hidden="true" className={cn("h-1.5 w-1.5 rounded-full", dot)} />
        {label}
      </h3>
      {children}
    </div>
  );
}

function StageCard({ t, item, exam = false }) {
  const k = item.key;
  return (
    <Link
      href={item.href}
      className={cn(
        "group flex h-full items-center gap-4 overflow-hidden rounded-lg border p-2.5 pe-4 shadow-xs",
        "transition-[transform,box-shadow,border-color] duration ease-out hover:-translate-y-0.5 hover:shadow-md",
        exam
          ? "border-gold-200/70 bg-gold-50/60 hover:border-gold-300/80 md:gap-5 md:p-3 md:pe-5"
          : "border-line/15 bg-surface hover:border-line/25 md:flex-col md:items-stretch md:gap-0 md:p-0"
      )}
    >
      {/* painting: cropped thumbnail on phones, full-width header (school) / side panel (exam) from md */}
      <div
        aria-hidden="true"
        className={cn(
          "relative h-20 w-[5.5rem] shrink-0 overflow-hidden rounded-md",
          exam ? "md:h-auto md:min-h-[8.5rem] md:w-44 md:self-stretch xl:w-52" : "md:aspect-[16/10] md:h-auto md:w-full md:rounded-none"
        )}
      >
        <Illustration
          id={item.art}
          fill
          sizes={exam ? "(min-width: 1280px) 208px, (min-width: 768px) 176px, 88px" : "(min-width: 768px) 33vw, 88px"}
          className="transition-transform duration-slow ease-out group-hover:scale-[1.04]"
        />
      </div>

      <div className={cn("flex min-w-0 flex-1 items-center gap-3", !exam && "md:items-start md:p-5 md:pt-4 lg:p-6 lg:pt-5")}>
        <div className="min-w-0 flex-1">
          <p className="t-caption font-medium">{t(`stages.items.${k}.meta`)}</p>
          <h4 className="t-h4 mt-0.5">{t(`stages.items.${k}.title`)}</h4>
          <p className="t-small mt-1 text-ink-3">{t(`stages.items.${k}.body`)}</p>
        </div>
        <span
          aria-hidden="true"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line/15 bg-surface text-ink-3 transition-colors group-hover:border-line/25 group-hover:text-ink"
        >
          <ChevronRight size={18} className="flip-rtl" />
        </span>
      </div>
    </Link>
  );
}
