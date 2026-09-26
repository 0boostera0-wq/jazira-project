"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, MessageCircle, Send, UserRound } from "lucide-react";
import { useLocale, useT } from "@/i18n/client";
import { useAuthUser } from "@/context/AuthProvider";
import { CONTACT_LIMITS, sendContactMessage } from "@/lib/data/contact";
import { supportWhatsAppUrl } from "@/lib/constants";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Field";
import Skeleton from "@/components/ui/Skeleton";
import { cn } from "@/components/ui/cn";
import StarInput from "./StarInput";
import CountedTextarea from "./CountedTextarea";

const AREAS = ["curriculum", "exams", "assistant", "community", "design", "other"];
const MIN = 10;
const MAX = 3500; // leaves room for the rating/area header inside the 4000-char message
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const CODES = ["rate_limited", "invalid", "unavailable", "network"];
const nameOk = (n) => {
  const v = n.trim().replace(/\s+/g, " ");
  return v.length >= CONTACT_LIMITS.nameMin && v.length <= CONTACT_LIMITS.nameMax;
};

/**
 * Private product feedback (rating + optional area + note) delivered to the
 * team through the same channel as the contact form (topic "general").
 */
export default function FeedbackForm() {
  const t = useT("support");
  const { locale } = useLocale();
  const { isLoaded, isSignedIn, name: authName, email: authEmail } = useAuthUser();

  const [rating, setRating] = useState(0);
  const [area, setArea] = useState("");
  const [text, setText] = useState("");
  const [guest, setGuest] = useState({ name: "", email: "" });
  const [tried, setTried] = useState(false);
  const [status, setStatus] = useState("idle");
  const [serverError, setServerError] = useState(null);
  const formRef = useRef(null);
  const successRef = useRef(null);
  const refocus = useRef(false);

  // The form unmounts on success and returns on "send more": move focus with it.
  useEffect(() => {
    if (status === "sent") successRef.current?.focus();
    else if (refocus.current) {
      refocus.current = false;
      formRef.current?.querySelector('input[type="radio"]')?.focus();
    }
  }, [status]);

  const known = isSignedIn && authName && authEmail;
  const who = known ? { name: authName, email: authEmail } : guest;

  const errs = {};
  if (tried) {
    if (!rating) errs.rating = t("feedback.errors.rating");
    const len = text.trim().length;
    if (len < MIN) errs.text = t("contact.errors.messageShort", { min: MIN });
    else if (len > MAX) errs.text = t("contact.errors.messageLong", { max: MAX });
    if (!known) {
      if (!nameOk(guest.name)) errs.name = t(guest.name.trim().length > CONTACT_LIMITS.nameMax ? "contact.errors.nameLong" : "contact.errors.name");
      if (!EMAIL_RE.test(guest.email.trim())) errs.email = t("contact.errors.email");
    }
  }

  const submit = async (e) => {
    e.preventDefault();
    if (status === "sending") return;
    setTried(true);
    const len = text.trim().length;
    const bad = !rating || len < MIN || len > MAX || (!known && (!nameOk(guest.name) || !EMAIL_RE.test(guest.email.trim())));
    if (bad) {
      // Move focus to the first problem so keyboard and screen-reader users land on it.
      requestAnimationFrame(() => {
        const form = formRef.current;
        const el = !rating ? form?.querySelector('input[type="radio"]') : form?.querySelector('[aria-invalid="true"]');
        el?.focus();
      });
      return;
    }
    setStatus("sending");
    setServerError(null);
    const lines = [t("feedback.composed.header"), t("feedback.composed.rating", { rating })];
    if (area) lines.push(t("feedback.composed.area", { area: t(`feedback.area.${area}`) }));
    const message = `${lines.join("\n")}\n\n${text.trim()}`;
    let res;
    try {
      res = await sendContactMessage({ name: who.name.trim(), email: who.email.trim(), topic: "general", message, locale });
    } catch {
      res = { ok: false, code: "network" };
    }
    if (res?.ok) return setStatus("sent");
    setServerError(CODES.includes(res?.code) ? res.code : "unavailable");
    setStatus("idle");
  };

  const reset = () => {
    setRating(0);
    setArea("");
    setText("");
    setTried(false);
    setServerError(null);
    refocus.current = true;
    setStatus("idle");
  };

  if (status === "sent") {
    return (
      <Card pad="lg" className="animate-scale" role="status" aria-live="polite">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-green-50 text-green-600 ring-1 ring-inset ring-green-100">
          <CheckCircle2 size={28} aria-hidden="true" />
        </span>
        <h2 ref={successRef} tabIndex={-1} className="t-h3 mt-5 focus:outline-none focus-visible:shadow-none">{t("feedback.success.title")}</h2>
        <p className="t-body mt-2 max-w-[56ch] text-ink-2">{t("feedback.success.body")}</p>
        <div className="mt-7 flex flex-wrap gap-2.5">
          <Button onClick={reset} variant="secondary">{t("feedback.success.again")}</Button>
          <Button href="/reviews" variant="ghost" iconEnd={ArrowRight}>{t("feedback.success.review")}</Button>
        </div>
      </Card>
    );
  }

  const len = text.trim().length;
  const sending = status === "sending";

  return (
    <Card pad="lg">
      {serverError && (
        <Alert tone={serverError === "rate_limited" ? "warning" : "danger"} title={t(`contact.status.${serverError}.title`)} className="mb-6">
          <p>{t(`contact.status.${serverError}.body`)}</p>
          {(serverError === "rate_limited" || serverError === "unavailable") && (
            <Button href={supportWhatsAppUrl()} external size="sm" variant="secondary" iconStart={MessageCircle} className="mt-3">
              {t("faq.help.whatsapp")}
              <span className="sr-only">({t("shared.external")})</span>
            </Button>
          )}
        </Alert>
      )}
      <form ref={formRef} onSubmit={submit} noValidate className="space-y-7" aria-busy={sending || undefined}>
        <StarInput
          legend={t("feedback.rating.legend")}
          value={rating}
          onChange={setRating}
          optionLabel={(n) => `${t("reviews.stars.option", { count: n })} — ${t(`feedback.rating.r${n}`)}`}
          caption={(n) => t(`feedback.rating.r${n}`)}
          error={errs.rating}
          size={36}
        />

        <fieldset>
          <legend className="mb-2.5 flex w-full items-baseline justify-between gap-2 text-sm font-medium text-ink">
            <span>{t("feedback.area.legend")}</span>
            <span className="text-xs font-normal text-ink-3">{t("feedback.area.optional")}</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {AREAS.map((k) => {
              const on = area === k;
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setArea(on ? "" : k)}
                  className={cn(
                    "inline-flex h-10 items-center rounded-full border px-4 text-sm transition-colors",
                    on ? "border-gold-300 bg-gold-50 font-medium text-gold-700" : "border-line/15 bg-surface text-ink-2 hover:border-line/30 hover:text-ink"
                  )}
                >
                  {t(`feedback.area.${k}`)}
                </button>
              );
            })}
          </div>
        </fieldset>

        <CountedTextarea
          label={t("feedback.text.label")}
          error={errs.text}
          count={len}
          max={MAX}
          counterText={t("contact.form.counter", { count: len, max: MAX })}
          rows={6}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={MAX + 200}
          placeholder={t("feedback.text.placeholder")}
        />

        {!isLoaded ? (
          <Skeleton className="h-12 w-full" rounded="md" />
        ) : known ? (
          <p className="flex items-start gap-2.5 rounded-md bg-surface-2 p-3.5 text-sm text-ink-2">
            <UserRound size={17} className="mt-0.5 shrink-0 text-ink-3" aria-hidden="true" />
            <span>{t("feedback.identity.sendingAs", { name: `⁨${authName}⁩`, email: `⁨${authEmail}⁩` })}</span>
          </p>
        ) : (
          <fieldset>
            <legend className="text-sm font-medium text-ink">{t("feedback.identity.title")}</legend>
            <p className="t-caption mt-0.5">{t("feedback.identity.body")}</p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Field label={t("contact.form.name")} error={errs.name}>
                {(p) => (
                  <Input {...p} autoComplete="name" className="[unicode-bidi:plaintext]" value={guest.name} maxLength={CONTACT_LIMITS.nameMax + 20} onChange={(e) => setGuest((g) => ({ ...g, name: e.target.value }))} />
                )}
              </Field>
              <Field label={t("contact.form.email")} error={errs.email}>
                {(p) => (
                  <Input
                    {...p}
                    type="email"
                    dir="ltr"
                    inputMode="email"
                    autoComplete="email"
                    value={guest.email}
                    maxLength={254}
                    placeholder={t("contact.form.emailPlaceholder")}
                    className="rtl:text-end"
                    onChange={(e) => setGuest((g) => ({ ...g, email: e.target.value }))}
                  />
                )}
              </Field>
            </div>
          </fieldset>
        )}

        <div className="flex justify-end border-t border-line/10 pt-5">
          <Button type="submit" loading={sending} iconEnd={sending ? undefined : Send} className="w-full sm:w-auto">
            {sending ? t("contact.form.sending") : t("feedback.submit")}
          </Button>
        </div>
      </form>
    </Card>
  );
}
