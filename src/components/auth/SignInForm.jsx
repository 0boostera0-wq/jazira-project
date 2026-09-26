"use client";

import { useEffect, useRef, useState } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { useT } from "@/i18n/client";
import { useAuth } from "@/hooks/useAuth";
import { useAuthUser } from "@/context/AuthProvider";
import { getSupabase } from "@/lib/supabase-lazy";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import PasswordInput from "./AuthPasswordInput";
import GoogleButton from "./GoogleButton";
import { AuthDivider, Redirecting, linkCls } from "./AuthParts";
import { useQueryParams } from "./hooks";
import { authErrorKey, emailError, normalizeEmail, resolveNext, withNext } from "./authUtils";

const SID_KEY = "jazira_session_id_v1"; // SessionTracker's device id — rotate on every new sign-in

export default function SignInForm() {
  const t = useT("auth");
  const router = useRouter();
  const { signIn } = useAuth();
  const { isLoaded, isSignedIn, needsProfileSetup } = useAuthUser();
  const query = useQueryParams();
  const next = resolveNext(query?.get("next"));
  const notice = query?.get("reason") === "revoked" ? "revoked" : query?.get("error") ? "callbackError" : null;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);
  const navigated = useRef(false);
  const emailRef = useRef(null);
  const passwordRef = useRef(null);

  // Already signed in (another tab, OAuth return, or just now) → leave the page
  // (once ?next= has been read, so the destination is the right one).
  useEffect(() => {
    if (!query || !isLoaded || !isSignedIn || navigated.current) return;
    navigated.current = true;
    router.replace(needsProfileSetup ? withNext("/profile-setup", next) : next);
  }, [query, isLoaded, isSignedIn, needsProfileSetup, next, router]);

  const submit = async (e) => {
    e.preventDefault();
    if (pending) return;
    const errs = { email: emailError(email), password: password ? null : "passwordRequired" };
    setFieldErrors(errs);
    setError(null);
    if (errs.email) return emailRef.current?.focus();
    if (errs.password) return passwordRef.current?.focus();

    setPending(true);
    if (!(await getSupabase())) {
      setError("notConfigured");
      setPending(false);
      return;
    }
    const res = await signIn(normalizeEmail(email), password);
    if (res.success) {
      try { localStorage.removeItem(SID_KEY); } catch {}
      navigated.current = true;
      router.refresh(); // drop router-cache entries rendered while signed out
      router.replace(next);
      return; // keep the spinner until the next page paints
    }
    setError(authErrorKey({ code: res.code, message: res.error }));
    setPending(false);
  };

  if (isLoaded && isSignedIn) return <Redirecting label={t("redirecting")} />;

  const verifyHref = withNext(`/auth/verify-email?email=${encodeURIComponent(normalizeEmail(email))}`, next);

  return (
    <div>
      {notice && (
        <Alert tone={notice === "revoked" ? "warning" : "danger"} title={t(`signIn.${notice}.title`)} className="mb-6">
          {t(`signIn.${notice}.body`)}
        </Alert>
      )}

      <GoogleButton next={next} onError={setError} />
      <AuthDivider label={t("divider")} />

      {/* method="post": a submit before hydration never puts the password in the URL. */}
      <form method="post" noValidate onSubmit={submit} className="grid gap-5">
        {error && (
          <Alert tone="danger">
            {t(`errors.${error}`)}
            {error === "emailNotConfirmed" && (
              <>
                {" "}
                <Link href={verifyHref} className="font-medium underline underline-offset-4">{t("signIn.confirmNow")}</Link>
              </>
            )}
          </Alert>
        )}

        <Field label={t("fields.email")} error={fieldErrors.email && t(`validation.${fieldErrors.email}`)}>
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
              onChange={(ev) => { setEmail(ev.target.value); if (fieldErrors.email) setFieldErrors((x) => ({ ...x, email: null })); }}
            />
          )}
        </Field>

        <Field id="sign-in-password" error={fieldErrors.password && t(`validation.${fieldErrors.password}`)}>
          {(p) => (
            <>
              <div className="mb-1.5 flex items-baseline justify-between gap-3">
                <label htmlFor={p.id} className="text-sm font-medium text-ink">{t("fields.password")}</label>
                <Link href="/forgot-password" className="relative text-sm text-gold-600 underline-offset-4 after:absolute after:-inset-x-1 after:-bottom-1 after:-top-3 hover:underline">{t("signIn.forgot")}</Link>
              </div>
              <PasswordInput
                {...p}
                ref={passwordRef}
                name="password"
                autoComplete="current-password"
                value={password}
                onChange={(ev) => { setPassword(ev.target.value); if (fieldErrors.password) setFieldErrors((x) => ({ ...x, password: null })); }}
              />
            </>
          )}
        </Field>

        <Button type="submit" size="lg" block loading={pending} className="mt-1">
          {t("signIn.submit")}
        </Button>
      </form>

      <p className="mt-7 text-center text-[0.9375rem] text-ink-3">
        {t("signIn.noAccount")}{" "}
        <Link href={withNext("/sign-up", next)} className={linkCls}>{t("signIn.createAccount")}</Link>
      </p>
    </div>
  );
}
