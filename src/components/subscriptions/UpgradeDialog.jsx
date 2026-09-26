"use client";

import { ArrowRight } from "lucide-react";
import { useT, useLocale } from "@/i18n/client";
import { formatPrice } from "@/i18n/format";
import Dialog from "@/components/ui/Dialog";
import Button from "@/components/ui/Button";
import Illustration from "@/components/ui/Illustration";
import PerkList from "./PerkList";
import { PLAN, elitePerks } from "./plan";

/**
 * Upsell shown when a free member reaches an Elite-only feature (replaces the
 * legacy PremiumModal). It only explains and links to /subscriptions — it
 * never unlocks anything; entitlement is enforced server-side.
 *
 *   const [open, setOpen] = useState(false);
 *   <UpgradeDialog open={open} onClose={() => setOpen(false)} feature={t("…")} />
 *
 * Wrap the page in <Messages ns={["subscriptions"]}> for the full copy. If the
 * namespace isn't loaded it degrades to the always-available `common.premium`
 * strings instead of showing raw keys.
 */
export default function UpgradeDialog({ open, onClose, feature }) {
  const t = useT("subscriptions");
  const tc = useT("common");
  const { locale } = useLocale();
  const full = t.has("upgrade.title");

  const title = !full ? tc("premium.lockedTitle") : feature ? t("upgrade.titleFeature", { feature }) : t("upgrade.title");
  const body = full ? t("upgrade.body") : tc("premium.lockedBody");
  const perks = full ? elitePerks(t, tc).filter((p) => ["daily", "assistant", "analytics", "badge"].includes(p.key)) : [];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      variant="sheet"
      size="md"
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{full ? t("upgrade.later") : tc("actions.close")}</Button>
          <Button href="/subscriptions" variant="gold" iconEnd={ArrowRight} onClick={onClose}>
            {full ? t("upgrade.cta") : tc("premium.upgradeCta")}
          </Button>
        </>
      }
    >
      <div aria-hidden="true" className="relative -mx-5 -mt-5 mb-5 aspect-[16/7] sm:-mx-6">
        <Illustration id="subscriptions.premium" fill sizes="(min-width: 640px) 480px, 100vw" />
      </div>
      <p className="t-body text-ink-2">{body}</p>
      {perks.length > 0 && <PerkList perks={perks} className="mt-4" />}
      {full && (
        <p className="mt-5 rounded-md bg-surface-2 px-4 py-3 text-sm font-medium text-ink">
          {t("upgrade.price", { price: formatPrice(PLAN.priceSAR, locale) })}
        </p>
      )}
    </Dialog>
  );
}
