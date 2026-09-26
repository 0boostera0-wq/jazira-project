"use client";

import { useRef, useState } from "react";
import { MailCheck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useLocale, useT } from "@/i18n/client";
import { localizeHref } from "@/i18n/config";
import { formatClock } from "@/i18n/format";
import { useAuth } from "@/hooks/useAuth";
import { getSupabase } from "@/lib/supabase-lazy";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { EmailChip, linkCls, StatusPanel } from "./AuthParts";
import { useResendCooldown } from "./hooks";
import { authErrorKey, emailError, normalizeEmail } from "./authUtils";

// Errors worth surfacing: none of them reveal whether an account exists.
const SHOWN = new Set(["rateLimit", "network", "notConfigured", "invalidEmail"]);

/** Neutral "check your inbox" step — identical whether or not the account exists. */
export function ForgotSent({ email, error, resent, pending, cooldownLeft, onResend, onBack }) {
  const t = useT("auth");
  return (
    <div>
      <StatusPanel
        icon={MailCheck}
        title={t("forgot.sent.title")}
        announce
        footer={
          <>
            {error && <Alert tone="danger">{t(`errors.${error}`)}</Alert>}
            {resent && !error && <Alert tone="success">{t("forgot.sent.resent")}</Alert>}
            {cooldownLeft > 0 ? (
              <p className="py-2 text-center text-sm text-ink-3">
                {t("forgot.sent.resendIn", { time: formatClock(cooldownLeft) })}
              </p>
            ) : (
              <Button variant="secondary" block loading={pending} onClick={onResend}>{t("forgot.sent.resend")}</Button>
            )}
            <Button variant="ghost" block onClick={onBack}>{t("forgot.sent.otherEmail")}</Button>
          </>
        }
      >
        <p>{t("forgot.sent.body")}</p>
        <p className="mt-1"><EmailChip email={email} /></p>
        <p className="mt-3 text-ink-3">{t("forgot.sent.tip")}</p>
      </StatusPanel>
      <p className="mt-6 text-center text-[0.9375rem]">
        <Link href="/sign-in" className={linkCls}>{t("backToSignIn")}</Link>
      </p>
    </div>
  );
}

export default function ForgotPasswordForm() {
  const t = useT("auth");
  const { locale } = useLocale();
  const { resetPassword } = useAuth();
  const cooldown = useResendCooldown("recovery");

  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState(null);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);
  const [sentTo, setSentTo] = useState(null);
  const [resent, setResent] = useState(false);
  const emailRef = useRef(null);

  const send = async (target) => {
    if (!(await getSupabase())) return "notConfigured";
    const res = await resetPassword(target, localizeHref("/reset-password", locale));
    if (res.success) return null;
    const key = authErrorKey({ code: res.code, message: res.error });
    // Anything else (e.g. unknown address) is answered with the same neutral message.
    return SHOWN.has(key) ? key : null;
  };

  const submit = async (e) => {
    e.preventDefault();
    if (pending) return;
    setError(null);
    const bad = emailError(email);
    setFieldError(bad);
    if (bad) return emailRef.current?.focus();
    setPending(true);
    const target = normalizeEmail(email);
    const key = await send(target);
    setPending(false);
    if (key) return setError(key);
    cooldown.start();
    setResent(false);
    setSentTo(target);
  };

  const resend = async () => {
    if (pending || cooldown.left > 0 || !sentTo) return;
    setError(null);
    setPending(true);
    const key = await send(sentTo);
    setPending(false);
    if (key) return setError(key);
    cooldown.start();
    setResent(true);
  };

  if (sentTo) {
    return (
      <ForgotSent
        email={sentTo}
        error={error}
        resent={resent}
        pending={pending}
        cooldownLeft={cooldown.left}
        onResend={resend}
        onBack={() => { setSentTo(null); setError(null); }}
      />
    );
  }

  return (
    <div>
      <form noValidate onSubmit={submit} className="grid gap-5">
        {error && <Alert tone="danger">{t(`errors.${error}`)}</Alert>}
        <Field label={t("fields.email")} error={fieldError && t(`validation.${fieldError}`)}>
          {(p) => (
            <Input
              {...p}
              ref={emailRef}
              type="email"
              name="email"
              dir="ltr"
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              placeholder={t("fields.emailPlaceholder")}
              value={email}
              onChange={(e) => { setEmail(e.target.value); setFieldError(null); }}
            />
          )}
        </Field>
        <Button type="submit" size="lg" block loading={pending} className="mt-1">
          {t("forgot.submit")}
        </Button>
      </form>
      <p className="mt-7 text-center text-[0.9375rem] text-ink-3">
        {t("forgot.remembered")}{" "}
        <Link href="/sign-in" className={linkCls}>{t("signIn.submit")}</Link>
      </p>
    </div>
  );
}
