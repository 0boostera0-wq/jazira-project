import { ArrowRight } from "lucide-react";
import { getT } from "@/i18n/server";
import Button from "@/components/ui/Button";
import Illustration from "@/components/ui/Illustration";
import AssistantAvatar from "@/components/brand/AssistantAvatar";
import { cn } from "@/components/ui/cn";
import { PLATE } from "@/components/stages/parts";
import AssistantQuota from "./AssistantQuota";

/** Shortcut to Jazira Assistant with the member's real message allowance. */
export default async function AssistantCard({ className }) {
  const t = await getT("dashboard");
  return (
    <section aria-labelledby="dash-assistant" className={cn("surface overflow-hidden", className)}>
      {/* Decorative art: dropped on phones, where the card sits at the end of a long page and the avatar carries it. */}
      <div aria-hidden="true" className={cn("hidden px-6 pt-3 sm:block", PLATE)}>
        <Illustration id="ai.study-plan" className="mx-auto w-full max-w-[13rem]" />
      </div>
      <div className="p-5">
        <div className="flex items-center gap-3">
          <AssistantAvatar size={40} />
          <div className="min-w-0">
            <h2 id="dash-assistant" className="t-h4">{t("assistant.title")}</h2>
            <p className="t-caption">{t("assistant.subtitle")}</p>
          </div>
        </div>
        <p className="t-small mt-3 text-ink-2">{t("assistant.body")}</p>
        <AssistantQuota className="mt-3" />
        <Button href="/assistant" variant="secondary" block iconEnd={ArrowRight} className="mt-4">
          {t("assistant.cta")}
        </Button>
      </div>
    </section>
  );
}
