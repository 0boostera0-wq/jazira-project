"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, CheckCheck, CheckCircle2, Lock, MailCheck, MessageCircle, Send } from "lucide-react";
import { useLocale, useT } from "@/i18n/client";
import { useAuthUser } from "@/context/AuthProvider";
import { CONTACT_LIMITS as LIMITS, CONTACT_TOPICS, sendContactMessage } from "@/lib/data/contact";
import { supportWhatsAppUrl } from "@/lib/constants";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { Field, Input, Select } from "@/components/ui/Field";
import { cn } from "@/components/ui/cn";
import CountedTextarea from "./CountedTextarea";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const CODES = ["rate_limited", "invalid", "unavailable", "network"];
const NEXT_STEPS = [
  { key: "inbox", icon: MailCheck },
  { key: "duplicate", icon: CheckCheck },
  { key: "urgent", icon: MessageCircle },
];

function validate(v) {
  const e = {};
  const name = v.name.trim().replace(/\s+/g, " ");
  if (name.length < LIMITS.nameMin) e.name = "name";
  else if (name.length > LIMITS.nameMax) e.name = "nameLong";
  const email = v.email.trim();
  if (!EMAIL_RE.test(email) || email.length > LIMITS.emailMax) e.email = "email";
  if (!CONTACT_TOPICS.includes(v.topic)) e.topic = "topic";
  const msg = v.message.trim();
  if (msg.length < LIMITS.messageMin) e.message = "messageShort";
  else if (msg.length > LIMITS.messageMax) e.message = "messageLong";
  return e;
}

/**
 * Contact form → sendContactMessage() (src/lib/data/contact.js). Client
 * validation is UX only; the data layer validates and rate-limits again.
 * Prefills name/email for signed-in users and ?topic=<id> from the URL.
 */
export default function ContactForm() {
  const t = useT("support");
  const { locale } = useLocale();
  const { isLoaded, isSignedIn, name: authName, email: authEmail } = useAuthUser();
  const refs = { name: useRef(null), email: useRef(null), topic: useRef(null), message: useRef(null) };

  const [values, setValues] = useState({ name: "", email: "", topic: "", message: "" });
  const [tried, setTried] = useState(false);
  const [status, setStatus] = useState("idle"); // idle | sending | sent
  const [serverError, setServerError] = useState(null);
  const [sentTo, setSentTo] = useState("");
  const prefilled = useRef(false);
  const successRef = useRef(null);
  const refocus = useRef(null); // field to focus after "send another"

  // The form (and its focused submit button) unmounts on success and mounts
  // again on "send another": move focus so keyboard/screen-reader users follow.
  useEffect(() => {
    if (status === "sent") successRef.current?.focus();
    else if (refocus.current) {
      refs[refocus.current].current?.focus();
      refocus.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // ?topic=billing preselects the topic (links from the FAQ / about page).
  useEffect(() => {
    try {
      const topic = new URLSearchParams(window.location.search).get("topic");
      if (CONTACT_TOPICS.includes(topic)) setValues((v) => (v.topic ? v : { ...v, topic }));
    } catch {}
  }, []);

  useEffect(() => {
    if (prefilled.current || !isLoaded || !isSignedIn) return;
    prefilled.current = true;
    setValues((v) => ({ ...v, name: v.name || authName || "", email: v.email || authEmail || "" }));
  }, [isLoaded, isSignedIn, authName, authEmail]);

  const errors = tried ? validate(values) : {};
  const set = (k) => (e) => {
    setValues((v) => ({ ...v, [k]: e.target.value }));
    if (serverError) setServerError(null);
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (status === "sending") return;
    setTried(true);
    const found = validate(values);
    const first = ["name", "email", "topic", "message"].find((k) => found[k]);
    if (first) {
      refs[first].current?.focus();
      return;
    }
    setStatus("sending");
    setServerError(null);
    const payload = {
      name: values.name.trim(),
      email: values.email.trim(),
      topic: values.topic,
      message: values.message.trim(),
      locale,
    };
    let res;
    try {
      res = await sendContactMessage(payload);
    } catch {
      res = { ok: false, code: "network" };
    }
    if (res?.ok) {
      setSentTo(payload.email);
      setStatus("sent");
      return;
    }
    setServerError(CODES.includes(res?.code) ? res.code : "unavailable");
    setStatus("idle");
    if (res?.code === "invalid" && refs[res.field]) refs[res.field].current?.focus();
  };

  const reset = () => {
    setValues((v) => ({ name: v.name, email: v.email, topic: "", message: "" }));
    setTried(false);
    setServerError(null);
    refocus.current = "topic";
    setStatus("idle");
  };

  if (status === "sent") {
    return (
      <Card pad="lg" className="animate-scale" role="status" aria-live="polite">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-green-50 text-green-600 ring-1 ring-inset ring-green-100">
          <CheckCircle2 size={28} aria-hidden="true" />
        </span>
        {/* Focus lands here: the submit button that had it no longer exists. */}
        <h2 ref={successRef} tabIndex={-1} className="t-h3 mt-5 focus:outline-none focus-visible:shadow-none">{t("contact.success.title")}</h2>
        <p className="t-body mt-2 text-ink-2">
          {t("contact.success.body", { email: "⁨" + sentTo + "⁩" })}
        </p>
        <div className="mt-6 rounded-md bg-surface-2 p-4 sm:p-5">
          <h3 className="text-sm font-medium text-ink">{t("contact.success.next.title")}</h3>
          <ul className="mt-3 space-y-2.5">
            {NEXT_STEPS.map(({ key, icon: Icon }) => (
              <li key={key} className="flex items-start gap-2.5">
                <Icon size={16} className="mt-1 shrink-0 text-ink-3" aria-hidden="true" />
                <span className="t-small text-ink-2">{t(`contact.success.next.${key}`)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-7 flex flex-wrap gap-2.5">
          <Button onClick={reset} variant="secondary">{t("contact.success.again")}</Button>
          <Button href="/support" variant="ghost" iconEnd={ArrowRight}>{t("contact.success.back")}</Button>
        </div>
      </Card>
    );
  }

  const len = values.message.trim().length;
  const sending = status === "sending";

  return (
    <Card pad="lg">
      <h2 className="t-h3">{t("contact.form.title")}</h2>

      {serverError && (
        <Alert
          tone={serverError === "rate_limited" ? "warning" : "danger"}
          title={t(`contact.status.${serverError}.title`)}
          className="mt-5"
        >
          <p>{t(`contact.status.${serverError}.body`)}</p>
          {(serverError === "rate_limited" || serverError === "unavailable") && (
            <Button href={supportWhatsAppUrl()} external size="sm" variant="secondary" iconStart={MessageCircle} className="mt-3">
              {t("faq.help.whatsapp")}
              <span className="sr-only">({t("shared.external")})</span>
            </Button>
          )}
        </Alert>
      )}
      {tried && Object.keys(errors).length > 0 && !serverError && (
        <p role="alert" className="sr-only">{t("contact.errors.summary")}</p>
      )}

      <form onSubmit={onSubmit} noValidate className="mt-6 space-y-5" aria-busy={sending || undefined}>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t("contact.form.name")} error={errors.name && t(`contact.errors.${errors.name}`)}>
            {(p) => (
              <Input
                {...p}
                ref={refs.name}
                name="name"
                autoComplete="name"
                className="[unicode-bidi:plaintext]"
                value={values.name}
                onChange={set("name")}
                maxLength={LIMITS.nameMax + 20}
                placeholder={t("contact.form.namePlaceholder")}
                required
              />
            )}
          </Field>
          <Field label={t("contact.form.email")} error={errors.email && t("contact.errors.email")} hint={t("contact.form.emailHint")}>
            {(p) => (
              <Input
                {...p}
                ref={refs.email}
                name="email"
                type="email"
                dir="ltr"
                inputMode="email"
                autoComplete="email"
                value={values.email}
                onChange={set("email")}
                maxLength={LIMITS.emailMax}
                placeholder={t("contact.form.emailPlaceholder")}
                className="rtl:text-end"
                required
              />
            )}
          </Field>
        </div>

        <Field label={t("contact.form.topic")} error={errors.topic && t("contact.errors.topic")}>
          {(p) => (
            <Select
              {...p}
              ref={refs.topic}
              name="topic"
              value={values.topic}
              onChange={set("topic")}
              required
              className={cn(!values.topic && "text-ink-4")}
            >
              <option value="" disabled>{t("contact.form.topicPlaceholder")}</option>
              {CONTACT_TOPICS.map((k) => (
                <option key={k} value={k} className="text-ink">{t(`contact.topics.${k}`)}</option>
              ))}
            </Select>
          )}
        </Field>

        <CountedTextarea
          ref={refs.message}
          label={t("contact.form.message")}
          error={errors.message && t(`contact.errors.${errors.message}`, { min: LIMITS.messageMin, max: LIMITS.messageMax })}
          count={len}
          max={LIMITS.messageMax}
          counterText={t("contact.form.counter", { count: len, max: LIMITS.messageMax })}
          name="message"
          rows={7}
          value={values.message}
          onChange={set("message")}
          maxLength={LIMITS.messageMax + 200}
          placeholder={t("contact.form.messagePlaceholder")}
          required
        />

        <div className="flex flex-col-reverse gap-4 border-t border-line/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="t-caption flex items-start gap-2">
            <Lock size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            {t("contact.form.note")}
          </p>
          <Button type="submit" loading={sending} iconEnd={sending ? undefined : Send} className="w-full sm:w-auto">
            {sending ? t("contact.form.sending") : t("contact.form.submit")}
          </Button>
        </div>
      </form>
    </Card>
  );
}
