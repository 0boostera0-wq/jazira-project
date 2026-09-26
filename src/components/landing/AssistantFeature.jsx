import { ArrowRight, CalendarCheck, Compass, Info, Lightbulb, ShieldCheck } from "lucide-react";
import { getT } from "@/i18n/server";
import Button from "@/components/ui/Button";
import Illustration from "@/components/ui/Illustration";
import { Container, Section } from "@/components/ui/Layout";
import AssistantAvatar from "@/components/brand/AssistantAvatar";
import { AI_FREE_LIMIT, AI_WINDOW_MS } from "@/lib/constants";
import { Intro, MockTag, Point } from "./parts";

const POINTS = [
  ["explain", Lightbulb],
  ["understand", ShieldCheck],
  ["plan", CalendarCheck],
  ["guide", Compass],
];

/**
 * Jazira Assistant — a contained, softly tinted panel (id="assistant" is the
 * target of the header's "Assistant" link). Copy + honest usage limits at the
 * start; the tower-study painting with an illustrative chat at the end.
 */
export default async function AssistantFeature() {
  const t = await getT("landing");
  const hours = Math.round(AI_WINDOW_MS / 3_600_000);
  const limit = t("assistant.limit", {
    messages: t("units.messages", { count: AI_FREE_LIMIT }),
    hours: t("units.hours", { count: hours }),
  });

  return (
    <Section id="assistant" size="sm" aria-labelledby="assistant-title">
      <Container>
        <div className="grid items-center gap-10 overflow-hidden rounded-xl border border-gold-200/60 bg-gold-50/60 px-5 py-10 sm:px-10 sm:py-12 lg:grid-cols-12 lg:gap-12 lg:px-14 lg:py-14">
          <div className="lg:col-span-6">
            <Intro id="assistant-title" eyebrow={t("assistant.eyebrow")} title={t("assistant.title")} lead={t("assistant.lead")} />

            <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {POINTS.map(([k, icon]) => (
                <Point key={k} icon={icon} title={t(`assistant.points.${k}.title`)} body={t(`assistant.points.${k}.body`)} />
              ))}
            </ul>

            <div className="mt-8 flex gap-3 rounded-md border border-line/15 bg-surface/80 p-4">
              <Info size={18} className="mt-0.5 shrink-0 text-info" aria-hidden="true" />
              <p className="t-small text-ink-2">{limit}</p>
            </div>

            <div className="mt-7">
              <Button href="/assistant" variant="secondary" iconEnd={ArrowRight}>{t("assistant.cta")}</Button>
              <p className="t-caption mt-3">{t("assistant.disclaimer")}</p>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="art-frame mx-auto max-w-[34rem] rounded-xl shadow-md lg:max-w-none">
              <Illustration id="assistant.hero" sizes="(min-width: 1280px) 560px, (min-width: 1024px) 42vw, 100vw" className="aspect-[4/3] object-cover" />
            </div>
            <ChatMock t={t} />
          </div>
        </div>
      </Container>
    </Section>
  );
}

function ChatMock({ t }) {
  return (
    <figure className="relative mx-3 -mt-10 max-w-[30rem] sm:mx-auto sm:-mt-14">
      <figcaption className="sr-only">{t("assistant.chat.caption")}</figcaption>
      <div aria-hidden="true" className="rounded-lg border border-line/15 bg-surface p-4 shadow-lg sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <AssistantAvatar size={32} />
            <p className="text-sm font-medium text-ink">{t("assistant.chat.name")}</p>
          </div>
          <MockTag>{t("assistant.chat.label")}</MockTag>
        </div>

        <div className="mt-4 space-y-3">
          <div className="flex justify-end">
            <p className="max-w-[85%] rounded-lg rounded-se-xs bg-primary px-3.5 py-2.5 text-sm text-primary-fg">
              {t("assistant.chat.question")}
            </p>
          </div>
          <div className="flex">
            <p className="max-w-[92%] rounded-lg rounded-ss-xs bg-surface-2 px-3.5 py-2.5 text-sm leading-relaxed text-ink-2">
              {t("assistant.chat.answer")}
            </p>
          </div>
          <span className="inline-flex h-8 items-center rounded-full border border-gold-200/80 bg-gold-50 px-3 text-[0.8125rem] font-medium text-gold-700">
            {t("assistant.chat.suggestion")}
          </span>
        </div>
      </div>
    </figure>
  );
}
