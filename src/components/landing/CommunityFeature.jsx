import { ArrowRight, Hash, Heart, ImagePlus, MessageCircle, MessagesSquare, UserPlus, UserRound } from "lucide-react";
import { getT } from "@/i18n/server";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Illustration from "@/components/ui/Illustration";
import { Container, Section } from "@/components/ui/Layout";
import { ArrowLink, Intro, MockTag, Point } from "./parts";

const POINTS = [
  ["ask", MessagesSquare],
  ["tags", Hash],
  ["follow", UserPlus],
  ["photo", ImagePlus],
];

/** Community — student-commons image + illustrative post at the start, copy at the end. */
export default async function CommunityFeature() {
  const t = await getT("landing");
  return (
    <Section id="community" aria-labelledby="community-title" className="!pt-8 sm:!pt-12">
      {/* [&>*]:min-w-0 — grid items may shrink below their min-content, so the page reflows at 320px */}
      <Container className="grid items-center gap-12 lg:grid-cols-12 lg:gap-14 [&>*]:min-w-0">
        <div className="lg:order-2 lg:col-span-6">
          <Intro id="community-title" eyebrow={t("community.eyebrow")} title={t("community.title")} lead={t("community.lead")} />
          <ul className="mt-8 grid gap-5 sm:grid-cols-2">
            {POINTS.map(([k, icon]) => (
              <Point key={k} icon={icon} tone="green" title={t(`community.points.${k}.title`)} body={t(`community.points.${k}.body`)} />
            ))}
          </ul>
          <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Button href="/community" variant="secondary" iconEnd={ArrowRight}>{t("community.cta")}</Button>
            <ArrowLink href="/community-guidelines">{t("community.guidelines")}</ArrowLink>
          </div>
        </div>

        <div className="relative lg:order-1 lg:col-span-6">
          <div className="art-frame rounded-xl shadow-sm">
            <Illustration id="community.hero" sizes="(min-width: 1280px) 600px, (min-width: 1024px) 48vw, 100vw" className="aspect-[4/3] object-cover" />
          </div>
          <PostMock t={t} />
        </div>
      </Container>
    </Section>
  );
}

function PostMock({ t }) {
  return (
    <figure className="relative mx-3 -mt-16 sm:absolute sm:-bottom-8 sm:start-8 sm:mx-0 sm:mt-0 sm:w-[23rem]">
      <figcaption className="sr-only">{t("community.mock.caption")}</figcaption>
      <div aria-hidden="true" className="rounded-lg border border-line/15 bg-surface p-4 shadow-lg">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gold-100 text-gold-700">
            <UserRound size={18} />
          </span>
          <div className="min-w-0 flex-1 space-y-1.5">
            <span className="block h-2.5 w-24 max-w-full rounded-full bg-surface-3" />
            <span className="block h-2 w-14 max-w-full rounded-full bg-surface-3/60" />
          </div>
          <MockTag>{t("community.mock.label")}</MockTag>
        </div>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink">{t("community.mock.body")}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Badge tone="gold" size="sm">{t("community.mock.tagA")}</Badge>
          <Badge tone="neutral" size="sm">{t("community.mock.tagB")}</Badge>
        </div>
        <div className="mt-3 flex gap-2.5 rounded-md bg-surface-2 p-3 lg:hidden xl:flex">
          <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-green-100 text-green-700">
            <UserRound size={13} />
          </span>
          <p className="t-small text-ink-2">{t("community.mock.reply")}</p>
        </div>
        <div className="mt-3 flex items-center gap-5 text-ink-3">
          <span className="t-caption inline-flex items-center gap-1.5"><Heart size={15} /> {t("community.mock.like")}</span>
          <span className="t-caption inline-flex items-center gap-1.5"><MessageCircle size={15} /> {t("community.mock.comment")}</span>
        </div>
      </div>
    </figure>
  );
}
