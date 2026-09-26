"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, MailCheck } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { useLocale, useT } from "@/i18n/client";
import { localizeHref } from "@/i18n/config";
import { useAuth } from "@/hooks/useAuth";
import { useAuthUser } from "@/context/AuthProvider";
import { getSupabase } from "@/lib/supabase-lazy";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import PasswordInput from "./AuthPasswordInput";
import GoogleButton from "./GoogleButton";
import PasswordStrength from "./PasswordStrength";
import { AuthDivider, EmailChip, linkCls, Redirecting, StatusPanel } from "./AuthParts";
import { useQueryParams, useResendCooldown } from "./hooks";
import {
  authErrorKey, emailError, nameCheck, newPasswordError, normalizeEmail, normalizePhone,
  OTP_EMAIL_KEY, phoneError, resolveNext, withNext, writeSession,
} from "./authUtils";

const ORDER = ["name", "email", "phone", "password", "confirm"];

/** "Check your inbox" step after an e-mail sign-up that needs confirmation. */
export function SignUpSent({ email, next, onBack }) {
  const t = useT("auth");
  const verifyHref = withNext(`/auth/verify-email?email=${encodeURIComponent(email)}`, next);
  return (
    <div>
      <StatusPanel
        icon={MailCheck}
        title={t("signUp.check.title")}
        announce
        footer={
          <>
            <Button href={verifyHref} size="lg" block iconEnd={ArrowRight}>{t("signUp.check.enterCode")}</Button>
            <Button variant="ghost" block onClick={onBack}>{t("signUp.check.changeEmail")}</Button>
          </>
        }
      >
        <p>{t("signUp.check.sentTo")}</p>
        <p className="mt-1"><EmailChip email={email} /></p>
        <p className="mt-3 text-ink-3">{t("signUp.check.body")}</p>
      </StatusPanel>
      <p className="mt-6 text-center text-[0.9375rem] text-ink-3">
        {t("signUp.check.existing")}{" "}
        <Link href={withNext("/sign-in", next)} className={linkCls}>{t("signUp.signIn")}</Link>
      </p>
    </div>
  );
}

/** `legal` — the server-rendered terms/privacy consent line, shown under the submit button. */
export default function SignUpForm({ legal }) {
  const t = useT("auth");
  const tc = useT("common");
  const { locale } = useLocale();
  const router = useRouter();
  const { signUp } = useAuth();
  const { isLoaded, isSignedIn, needsProfileSetup } = useAuthUser();
  const query = useQueryParams();
  const next = resolveNext(query?.get("next"));
  const cooldown = useResendCooldown("signup");

  const [values, setValues] = useState({ name: "", email: "", phone: "", password: "", confirm: "" });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);
  const [sentTo, setSentTo] = useState(null); // e-mail awaiting confirmation → "check your inbox" step
  const navigated = useRef(false);
  const refs = { name: useRef(null), email: useRef(null), phone: useRef(null), password: useRef(null), confirm: useRef(null) };

  // Already signed in → leave (also covers sign-ups that get a session at once,
  // i.e. when e-mail confirmation is off: profile setup first if no name stuck).
  useEffect(() => {
    if (!query || !isLoaded || !isSignedIn || navigated.current || sentTo) return;
    navigated.current = true;
    router.replace(needsProfileSetup ? withNext("/profile-setup", next) : next);
  }, [query, isLoaded, isSignedIn, needsProfileSetup, next, router, sentTo]);

  const set = (key) => (e) => {
    const value = key === "phone" ? normalizePhone(e.target.value) : e.target.value;
    setValues((v) => ({ ...v, [key]: value }));
    if (errors[key]) setErrors((er) => ({ ...er, [key]: null }));
  };

  const validate = () => {
    const name = nameCheck(values.name);
    const errs = {
      name: name.ok ? null : name.key,
      email: emailError(values.email),
      phone: phoneError(values.phone),
      password: newPasswordError(values.password),
      confirm: !values.confirm ? "confirmRequired" : values.confirm !== values.password ? "passwordMismatch" : null,
    };
    return { errs, name };
  };

  const submit = async (e) => {
    e.preventDefault();
    if (pending) return;
    setError(null);
    const { errs, name } = validate();
    setErrors(errs);
    const firstBad = ORDER.find((k) => errs[k]);
    if (firstBad) {
      refs[firstBad].current?.focus();
      return;
    }

    setPending(true);
    if (!(await getSupabase())) {
      setError("notConfigured");
      setPending(false);
      return;
    }
    const email = normalizeEmail(values.email);
    const res = await signUp(
      email,
      values.password,
      name.value,
      name.value,
      values.phone ? `+966${values.phone}` : null,
      { nextPath: localizeHref(next, locale) }
    );
    if (!res.success) {
      const key = authErrorKey({ code: res.code, message: res.error });
      if (key === "weakPassword") setErrors((er) => ({ ...er, password: null }));
      setError(key);
      setPending(false);
      return;
    }
    if (res.needsConfirmation) {
      writeSession(OTP_EMAIL_KEY, email);
      cooldown.start();
      setSentTo(email);
      setPending(false);
      return;
    }
    // E-mail confirmation is off → a session exists already. The redirect
    // effect above takes over as soon as the session and profile have loaded
    // (profile setup first if the name didn't stick). Keep the spinner.
    router.refresh();
  };

  if (isLoaded && isSignedIn && !sentTo) return <Redirecting label={t("redirecting")} />;

  if (sentTo) return <SignUpSent email={sentTo} next={next} onBack={() => setSentTo(null)} />;

  const fieldError = (key) => errors[key] && t(`validation.${errors[key]}`);

  return (
    <div>
      <GoogleButton next={next} onError={setError} />
      <AuthDivider label={t("divider")} />

      {/* method="post": a submit before hydration never puts the password in the URL. */}
      <form method="post" noValidate onSubmit={submit} className="grid gap-5">
        {error && (
          <Alert tone="danger">
            {t(`errors.${error}`)}
            {error === "userExists" && (
              <>
                {" "}
                <Link href={withNext("/sign-in", next)} className="font-medium underline underline-offset-4">{t("signUp.signIn")}</Link>
              </>
            )}
          </Alert>
        )}

        <Field label={t("fields.name")} hint={t("fields.nameHint")} error={fieldError("name")}>
          {(p) => (
            <Input
              {...p}
              ref={refs.name}
              name="name"
              autoComplete="name"
              dir="auto"
              maxLength={60}
              placeholder={t("fields.namePlaceholder")}
              value={values.name}
              onChange={set("name")}
            />
          )}
        </Field>

        <Field label={t("fields.email")} error={fieldError("email")}>
          {(p) => (
            <Input
              {...p}
              ref={refs.email}
              type="email"
              name="email"
              dir="ltr"
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              placeholder={t("fields.emailPlaceholder")}
              value={values.email}
              onChange={set("email")}
            />
          )}
        </Field>

        <Field label={t("fields.phone")} optional optionalText={tc("states.optional")} hint={t("fields.phoneHint")} error={fieldError("phone")}>
          {(p) => (
            <div dir="ltr" className="flex">
              <span
                className="flex h-11 shrink-0 items-center rounded-s-md border border-e-0 border-line/20 bg-surface-2 px-3 text-[1rem] text-ink-2"
                aria-hidden="true"
              >
                {t("fields.phonePrefix")}
              </span>
              <Input
                {...p}
                ref={refs.phone}
                type="tel"
                name="phone"
                autoComplete="tel-national"
                inputMode="numeric"
                placeholder={t("fields.phonePlaceholder")}
                className="min-w-0 flex-1 rounded-s-none"
                value={values.phone}
                onChange={set("phone")}
              />
            </div>
          )}
        </Field>

        <Field id="sign-up-password" label={t("fields.password")} error={fieldError("password")}>
          {(p) => (
            <>
              <PasswordInput
                {...p}
                ref={refs.password}
                name="new-password"
                autoComplete="new-password"
                aria-describedby={[p["aria-describedby"], "sign-up-password-strength"].filter(Boolean).join(" ")}
                value={values.password}
                onChange={set("password")}
              />
              <PasswordStrength id="sign-up-password-strength" password={values.password} />
            </>
          )}
        </Field>

        <Field label={t("fields.confirmPassword")} error={fieldError("confirm")}>
          {(p) => (
            <PasswordInput
              {...p}
              ref={refs.confirm}
              name="confirm-password"
              autoComplete="new-password"
              value={values.confirm}
              onChange={set("confirm")}
            />
          )}
        </Field>

        <div className="mt-1 grid gap-3">
          <Button type="submit" size="lg" block loading={pending}>
            {t("signUp.submit")}
          </Button>
          {legal && <div className="text-center">{legal}</div>}
        </div>
      </form>

      <p className="mt-7 text-center text-[0.9375rem] text-ink-3">
        {t("signUp.haveAccount")}{" "}
        <Link href={withNext("/sign-in", next)} className={linkCls}>{t("signUp.signIn")}</Link>
      </p>
    </div>
  );
}
