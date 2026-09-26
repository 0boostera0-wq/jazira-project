"use client";

import { useEffect, useState } from "react";
import { ArrowRight, CircleCheck } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { useLocale, useT } from "@/i18n/client";
import { localizeHref } from "@/i18n/config";
import { formatClock } from "@/i18n/format";
import { useAuthUser } from "@/context/AuthProvider";
import { getSupabase } from "@/lib/supabase-lazy";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import OtpInput from "./OtpInput";
import { EmailChip, linkCls, StatusPanel } from "./AuthParts";
import { useQueryParams, useResendCooldown } from "./hooks";
import {
  authErrorKey, emailError, normalizeEmail, OTP_EMAIL_KEY, OTP_LENGTH, readSession, resolveNext, withNext, writeSession,
} from "./authUtils";


export default function VerifyEmailForm() {
  const t = useT("auth");
  const { locale } = useLocale();
  const router = useRouter();
  const { isLoaded, isSignedIn, user } = useAuthUser();
  const query = useQueryParams();
  const next = resolveNext(query?.get("next"));
  const cooldown = useResendCooldown("signup");

  const [knownEmail, setKnownEmail] = useState(""); // the address the code was sent to
  const [emailInput, setEmailInput] = useState(""); // fallback field when we don't know it
  const [emailFieldError, setEmailFieldError] = useState(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [pending, setPending] = useState(false);
  const [resending, setResending] = useState(false);
  const [verified, setVerified] = useState(false);

  // Where did the code go? ?email= → this tab's sign-up → the signed-in (unconfirmed) user.
  useEffect(() => {
    if (!query) return;
    const fromQuery = normalizeEmail(query.get("email"));
    const known = (!emailError(fromQuery) && fromQuery) || readSession(OTP_EMAIL_KEY) || "";
    if (known) setKnownEmail(known);
  }, [query]);
  useEffect(() => {
    if (!knownEmail && user?.email && !user.email_confirmed_at) setKnownEmail(user.email);
  }, [knownEmail, user]);
  const email = knownEmail || (emailError(emailInput) ? "" : normalizeEmail(emailInput));

  const alreadyConfirmed = isLoaded && isSignedIn && !!user?.email_confirmed_at;
  const done = verified || alreadyConfirmed;

  // Verified (or visiting while already confirmed) → on to the destination
  // after a short beat so the confirmation registers (the CTA skips the wait).
  useEffect(() => {
    if (!done || !query) return undefined;
    const id = setTimeout(() => router.replace(next), 1200);
    return () => clearTimeout(id);
  }, [done, query, next, router]);

  const verify = async (value = code) => {
    if (pending) return;
    setError(null);
    setNotice(null);
    if (!email) {
      setEmailFieldError(emailError(emailInput) || "emailRequired");
      return;
    }
    if (value.length !== OTP_LENGTH) {
      setError("codeIncomplete");
      return;
    }
    setPending(true);
    try {
      const supabase = await getSupabase();
      if (!supabase) throw Object.assign(new Error("not configured"), { key: "notConfigured" });
      const { error: err } = await supabase.auth.verifyOtp({ email, token: value, type: "signup" });
      if (err) throw err;
      writeSession(OTP_EMAIL_KEY, null);
      setVerified(true);
      router.refresh();
    } catch (err) {
      const key = err?.key || authErrorKey(err, "otpInvalid");
      setError(key);
      if (key === "otpInvalid") setCode(""); // keep the digits for connection-type failures
    } finally {
      setPending(false);
    }
  };

  const resend = async () => {
    if (resending || cooldown.left > 0) return;
    setError(null);
    setNotice(null);
    const target = email;
    if (!target) {
      setEmailFieldError(emailError(emailInput) || "emailRequired");
      return;
    }
    setResending(true);
    try {
      const supabase = await getSupabase();
      if (!supabase) throw Object.assign(new Error("not configured"), { key: "notConfigured" });
      const redirect = `${window.location.origin}/auth/callback?next=${encodeURIComponent(localizeHref(next, locale))}`;
      const { error: err } = await supabase.auth.resend({ type: "signup", email: target, options: { emailRedirectTo: redirect } });
      if (err) throw err;
      writeSession(OTP_EMAIL_KEY, target);
      setKnownEmail(target);
      cooldown.start();
      setNotice("resent");
      setCode("");
    } catch (err) {
      setError(err?.key || authErrorKey(err));
    } finally {
      setResending(false);
    }
  };

  if (done) {
    return (
      <StatusPanel
        icon={CircleCheck}
        tone="green"
        title={t("verify.done.title")}
        announce={verified}
        footer={<Button href={next} size="lg" block iconEnd={ArrowRight}>{t("verify.done.cta")}</Button>}
      >
        <p>{t("verify.done.body")}</p>
      </StatusPanel>
    );
  }

  const errorText = error && (error === "codeIncomplete" ? t("validation.codeIncomplete") : t(`errors.${error}`));

  return (
    <div>
      {knownEmail ? (
        <div className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-line/15 bg-surface-2/70 px-4 py-3 text-[0.9375rem] text-ink-2">
          <span>{t("verify.sentTo")}</span>
          <EmailChip email={knownEmail} />
          <Link href={withNext("/sign-up", next)} className={`ms-auto text-sm ${linkCls}`}>{t("verify.change")}</Link>
        </div>
      ) : (
        <Field
          className="mb-6"
          label={t("fields.email")}
          hint={t("verify.emailPrompt")}
          error={emailFieldError && t(`validation.${emailFieldError}`)}
        >
          {(p) => (
            <Input
              {...p}
              type="email"
              name="email"
              dir="ltr"
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              placeholder={t("fields.emailPlaceholder")}
              value={emailInput}
              onChange={(e) => { setEmailInput(e.target.value); setEmailFieldError(null); }}
            />
          )}
        </Field>
      )}

      <form noValidate onSubmit={(e) => { e.preventDefault(); verify(); }} className="grid gap-5">
        <div>
          <p id="otp-label" className="mb-2 text-sm font-medium text-ink">{t("verify.codeLabel")}</p>
          <OtpInput
            value={code}
            onChange={(v) => { setCode(v); if (error) setError(null); }}
            onComplete={(v) => { if (email) verify(v); }}
            disabled={pending}
            invalid={error === "otpInvalid" || error === "codeIncomplete"}
            labelledBy="otp-label"
            describedBy={error ? "otp-error" : undefined}
          />
        </div>

        {errorText && (
          <Alert tone="danger">
            <span id="otp-error">{errorText}</span>
          </Alert>
        )}
        {notice === "resent" && <Alert tone="success">{t("verify.resent")}</Alert>}

        <Button type="submit" size="lg" block loading={pending}>
          {t("verify.submit")}
        </Button>
      </form>

      <div className="mt-7 rounded-lg border border-line/15 bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <p className="text-[0.9375rem] font-medium text-ink">{t("verify.noCode")}</p>
          {cooldown.left > 0 ? (
            <p className="text-sm text-ink-3">
              {t("verify.resendIn", { time: formatClock(cooldown.left) })}
            </p>
          ) : (
            <Button variant="soft" size="sm" loading={resending} onClick={resend}>
              {t("verify.resend")}
            </Button>
          )}
        </div>
        <p className="t-caption mt-1.5">{t("verify.spamTip")}</p>
      </div>

      <p className="mt-6 text-center text-[0.9375rem]">
        <Link href="/sign-in" className={linkCls}>{t("backToSignIn")}</Link>
      </p>
    </div>
  );
}
