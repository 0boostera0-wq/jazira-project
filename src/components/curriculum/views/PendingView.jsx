import { getT } from "@/i18n/server";
import { Link } from "@/i18n/navigation";
import Button from "@/components/ui/Button";
import Illustration from "@/components/ui/Illustration";
import { SectionHeader } from "@/components/ui/Layout";
import { CURRICULUM, YEAR } from "@/lib/curriculum";
import NodeHeader from "../NodeHeader";
import OfficialChannels from "../OfficialChannels";
import { Chevron } from "../parts";
import { OFFICIAL_LINKS, breadcrumbs, channelsCopy, nameOf } from "../copy";

const ART = { elementary: "elementary.hero", middle: "middle.hero", "high-school": "high-school.hero" };

/**
 * A programme with its own official plan that has not been verified yet
 * (continuing / special education). Honest notice — no invented subjects —
 * then the verified stages as the next step.
 */
export default async function PendingView({ slug, node, trail, locale }) {
  const [t, tc] = await Promise.all([getT("curriculum"), getT("common")]);
  const { items: crumbs } = breadcrumbs(t, slug, trail, locale);
  const name = nameOf(node, locale);
  const stages = CURRICULUM.filter((s) => !s.pending && s.children?.length);

  return (
    <div className="pb-6">
      <NodeHeader crumbs={crumbs} crumbsLabel={tc("a11y.breadcrumb")} year={t("year", { year: YEAR })} eyebrow={t("pending.eyebrow")} title={name} />

      <div className="mt-8 grid gap-6 xl:grid-cols-12 xl:gap-8">
        <section aria-labelledby="pending-title" className="rounded-xl border border-line/15 bg-surface p-6 shadow-sm sm:p-8 xl:col-span-7">
          <div className="grid items-center gap-6 sm:grid-cols-[1fr_11rem]">
            <div className="min-w-0">
              <h2 id="pending-title" className="t-h3">{t("pending.title")}</h2>
              <p className="t-body mt-3 text-ink-2">{t("pending.body", { name })}</p>
              <p className="t-small mt-3 text-ink-3">{t("pending.official")}</p>
              <div className="mt-6">
                <Button href="/curriculum" variant="primary">{t("pending.back")}</Button>
              </div>
            </div>
            <div aria-hidden="true" className="art-frame hidden rounded-lg sm:block">
              <Illustration id="support.empty" aspect="1/1" sizes="176px" />
            </div>
          </div>
        </section>
        <OfficialChannels className="self-start xl:col-span-5" titleId="channels-title" links={OFFICIAL_LINKS} copy={channelsCopy(t, { steps: false })} />
      </div>

      {stages.length > 0 && (
        <section aria-labelledby="explore-title" className="mt-12 sm:mt-14">
          <SectionHeader id="explore-title" size="h3" title={t("pending.explore.title")} description={t("pending.explore.lead")} />
          <ul className="mt-6 grid gap-3 md:grid-cols-3 md:gap-4">
            {stages.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/curriculum/${s.id}`}
                  className="group flex h-full items-center gap-4 rounded-lg border border-line/15 bg-surface p-3 pe-4 shadow-xs transition-[transform,box-shadow,border-color] duration ease-out hover:-translate-y-0.5 hover:border-line/20 hover:shadow-md"
                >
                  {ART[s.id] && (
                    <span aria-hidden="true" className="relative h-16 w-20 shrink-0 overflow-hidden rounded-md">
                      <Illustration id={ART[s.id]} fill sizes="80px" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="t-h4 block">{nameOf(s, locale)}</span>
                    <span className="t-caption block">{t(`hub.stages.items.${s.id}.range`)}</span>
                  </span>
                  <Chevron />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
