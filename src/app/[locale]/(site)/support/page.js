import { ArrowRight, Info, Lock, MessagesSquare, ReceiptText, Scale, ScrollText, ShieldAlert } from "lucide-react";
import { getT, setRequestLocale } from "@/i18n/server";
import Messages from "@/i18n/WithMessages";
import { Link } from "@/i18n/navigation";
import { buildMetadata } from "@/lib/seo";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import IconTile from "@/components/ui/IconTile";
import { SectionHeader } from "@/components/ui/Layout";
import SupportHero from "@/components/support/SupportHero";
import HelpSearch from "@/components/support/HelpSearch";
import FaqList from "@/components/support/FaqList";
import ContactChannels from "@/components/support/ContactChannels";
import { FAQ_TOPICS, QUICK_FAQ, resolveFaq } from "@/components/support/faqCatalog";
import { TOPIC_ICONS } from "@/components/support/topicIcons";

export async function generateMetadata(props) {
  const params = await props.params;
  return buildMetadata({ locale: params.locale, key: "support", path: "/support" });
}

const POLICIES = [
  { key: "footer.privacy", href: "/privacy", icon: Lock },
  { key: "footer.terms", href: "/terms", icon: ScrollText },
  { key: "footer.refund", href: "/refund", icon: ReceiptText },
  { key: "footer.acceptableUse", href: "/acceptable-use", icon: Scale },
  { key: "footer.guidelines", href: "/community-guidelines", icon: MessagesSquare },
];

const TIPS = ["device", "steps", "screenshot", "email"];

export default async function SupportPage(props) {
  const params = await props.params;
  setRequestLocale(params.locale);
  const [t, tn] = await Promise.all([getT("support"), getT("nav")]);
  const faq = resolveFaq(t, params.locale);
  const quick = QUICK_FAQ.map((id) => faq.find((f) => f.id === id)).filter(Boolean);

  return (
    <>
      <SupportHero eyebrow={t("center.eyebrow")} title={t("center.title")} lead={t("center.lead")} art="support.help">
        <Messages ns={["support"]}>
          <HelpSearch />
        </Messages>
      </SupportHero>

      {/* ── Topics ───────────────────────────────────────────────────────── */}
      <section className="pb-14 pt-6 sm:pb-20 sm:pt-8 lg:pb-24 lg:pt-10">
        <div className="container-jz">
          <SectionHeader eyebrow={t("center.topics.eyebrow")} title={t("center.topics.title")} description={t("center.topics.lead")} />
          <ul className="mt-8 grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
            {FAQ_TOPICS.map((topic) => (
              <li key={topic.id}>
                {/* Phones: compact row (icon · title + count · arrow). ≥ sm: tile. */}
                <Card
                  as={Link}
                  href={`/faq#${topic.id}`}
                  interactive
                  pad="none"
                  className="group flex h-full items-center gap-4 p-4 sm:flex-col sm:items-stretch sm:gap-0 sm:p-6"
                >
                  <IconTile icon={TOPIC_ICONS[topic.id]} />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <h3 className="t-h4 sm:mt-4">{t(`topics.${topic.id}.title`)}</h3>
                    <p className="t-small mt-1 hidden text-ink-3 sm:block">{t(`topics.${topic.id}.desc`)}</p>
                    <span className="mt-0.5 flex items-center justify-between gap-2 text-sm sm:mt-auto sm:pt-5">
                      <span className="text-ink-3">{t("center.topics.answers", { count: topic.items.length })}</span>
                      <ArrowRight size={16} aria-hidden="true" className="flip-rtl hidden text-ink-4 transition-colors group-hover:text-gold-600 sm:block" />
                    </span>
                  </div>
                  <ArrowRight size={18} aria-hidden="true" className="flip-rtl shrink-0 text-ink-4 sm:hidden" />
                </Card>
              </li>
            ))}
            <li>
              <Card tone="ink" className="flex h-full flex-col">
                <span className="grid h-11 w-11 place-items-center rounded-md bg-primary-fg/10 text-gold-300 ring-1 ring-inset ring-primary-fg/15">
                  <MessagesSquare size={20} aria-hidden="true" />
                </span>
                <h3 className="t-h4 mt-4 !text-primary-fg">{t("center.topics.contactTitle")}</h3>
                <p className="t-small mt-1 text-primary-fg/75">{t("center.topics.contactDesc")}</p>
                <div className="mt-auto pt-5">
                  <Button href="/contact" variant="gold" size="sm" iconEnd={ArrowRight}>{t("center.topics.contactCta")}</Button>
                </div>
              </Card>
            </li>
          </ul>
        </div>
      </section>

      {/* ── Quick answers + contact rail ─────────────────────────────────── */}
      <section className="border-t border-line/10 bg-surface-2/60 section-y-sm">
        <div className="container-jz grid gap-8 lg:grid-cols-12 lg:gap-10">
          <div className="min-w-0 lg:col-span-8">
            <SectionHeader
              eyebrow={t("center.quick.eyebrow")}
              title={t("center.quick.title")}
              description={t("center.quick.lead")}
              actions={<Button href="/faq" variant="secondary" size="sm" iconEnd={ArrowRight}>{t("center.quick.all")}</Button>}
            />
            <Card pad="none" className="mt-6 px-5 sm:px-6">
              <FaqList items={quick} openFirst />
            </Card>
          </div>

          <aside className="lg:col-span-4">
            {/* Tablet: the two cards sit side by side instead of a long single column. */}
            <div className="grid gap-4 md:grid-cols-2 lg:sticky lg:top-24 lg:grid-cols-1">
              <Card>
                <h2 className="t-h4">{t("center.rail.title")}</h2>
                <p className="t-small mt-1 text-ink-3">{t("center.rail.body")}</p>
                <ContactChannels only={["whatsapp", "form"]} className="mt-4" />
                <div className="mt-4 flex gap-3 rounded-md bg-surface-2 p-3.5">
                  <Info size={18} className="mt-0.5 shrink-0 text-ink-3" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-medium text-ink">{t("shared.response.title")}</p>
                    <p className="t-small mt-0.5 text-ink-3">{t("shared.response.body")}</p>
                  </div>
                </div>
              </Card>
              <Card tone="flat">
                <h2 className="t-h4">{t("center.tips.title")}</h2>
                <ol className="mt-3 space-y-2.5">
                  {TIPS.map((k, i) => (
                    <li key={k} className="flex gap-3">
                      <span className="num mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gold-50 text-xs font-medium tabular text-gold-700">{i + 1}</span>
                      <span className="t-small text-ink-2">{t(`center.tips.${k}`)}</span>
                    </li>
                  ))}
                </ol>
                <p className="mt-4 flex gap-2.5 border-t border-line/10 pt-4 text-sm font-medium text-ink">
                  <ShieldAlert size={18} className="mt-0.5 shrink-0 text-danger" aria-hidden="true" />
                  {t("center.tips.never")}
                </p>
              </Card>
            </div>
          </aside>
        </div>
      </section>

      {/* ── Policies ─────────────────────────────────────────────────────── */}
      <section className="section-y-sm">
        <div className="container-jz">
          <SectionHeader title={t("center.policies.title")} description={t("center.policies.lead")} size="h3" />
          <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {POLICIES.map(({ key, href, icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  className="group flex h-full min-h-[3.75rem] items-center gap-3 rounded-lg border border-line/15 bg-surface px-4 py-3 transition-[border-color,box-shadow] duration hover:border-line/25 hover:shadow-sm"
                >
                  <IconTile icon={icon} tone="neutral" size="sm" />
                  <span className="min-w-0 flex-1 text-[0.9375rem] font-medium text-ink">{tn(key)}</span>
                  <ArrowRight size={16} aria-hidden="true" className="flip-rtl shrink-0 text-ink-4 transition-colors group-hover:text-ink" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
