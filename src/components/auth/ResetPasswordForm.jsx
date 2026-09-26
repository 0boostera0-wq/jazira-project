"use client";

import { useRef, useState } from "react";
import { ArrowRight, CircleCheck, Link2Off } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useT } from "@/i18n/client";
import { useAuthUser } from "@/context/AuthProvider";
import { getSupabase } from "@/lib/supabase-lazy";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import PasswordInput from "./AuthPasswordInput";
import PasswordStrength from "./PasswordStrength";
import { AuthFormSkeleton, EmailChip, linkCls, StatusPanel } from "./AuthParts";
import { authErrorKey, newPasswordError } from "./authUtils";


/** New password + confirm for the signed-in (recovery) session. */
export function NewPasswordForm({ email, onDone }) {
  const t = useT("auth");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);
  const pwRef = useRef(null);
  const confirmRef = useRef(null);

  const submit = async (e) => {
    e.preventDefault();
    if (pending) return;
    setError(null);
    const errs = {
      password: newPasswordError(password),
      confirm: !confirm ? "confirmRequired" : confirm !== password ? "passwordMismatch" : null,
    };
    setErrors(errs);
    if (errs.password) return pwRef.current?.focus();
    if (errs.confirm) return confirmRef.current?.focus();

    setPending(true);
    try {
      const supabase = await getSupabase();
      if (!supabase) throw Object.assign(new Error("not configured"), { key: "notConfigured" });
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) throw err;
      onDone?.();
    } catch (err) {
      setError(err?.key || authErrorKey(err));
      setPending(false);
    }
  };

  return (
    // method="post": a submit before hydration never puts the password in the URL.
    <form method="post" noValidate onSubmit={submit} className="grid gap-5">
      {/* Lets password managers file the new password under the right account. */}
      {email && <input type="text" name="username" autoComplete="username" value={email} readOnly hidden />}
      {email && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-line/15 bg-surface-2/70 px-4 py-3 text-[0.9375rem] text-ink-2">
          <span>{t("reset.forAccount")}</span>
          <EmailChip email={email} />
        </div>
      )}
      {error && (
        <Alert tone="danger">
          {t(`errors.${error}`)}
          {error === "sessionExpired" && (
            <>
              {" "}
              <Link href="/forgot-password" className="font-medium underline underline-offset-4">{t("reset.expired.cta")}</Link>
            </>
          )}
        </Alert>
      )}

      <Field id="reset-password" label={t("fields.newPassword")} error={errors.password && t(`validation.${errors.password}`)}>
        {(p) => (
          <>
            <PasswordInput
              {...p}
              ref={pwRef}
              name="new-password"
              autoComplete="new-password"
              aria-describedby={[p["aria-describedby"], "reset-password-strength"].filter(Boolean).join(" ")}
              value={password}
              onChange={(e) => { setPassword(e.target.value); if (errors.password) setErrors((x) => ({ ...x, password: null })); }}
            />
            <PasswordStrength id="reset-password-strength" password={password} />
          </>
        )}
      </Field>

      <Field label={t("fields.confirmPassword")} error={errors.confirm && t(`validation.${errors.confirm}`)}>
        {(p) => (
          <PasswordInput
            {...p}
            ref={confirmRef}
            name="confirm-password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => { setConfirm(e.target.value); if (errors.confirm) setErrors((x) => ({ ...x, confirm: null })); }}
          />
        )}
      </Field>

      <Button type="submit" size="lg" block loading={pending} className="mt-1">
        {t("reset.submit")}
      </Button>
    </form>
  );
}

/** "Link expired" — no recovery session in this browser. */
export function ResetLinkExpired() {
  const t = useT("auth");
  return (
    <StatusPanel
      icon={Link2Off}
      tone="neutral"
      title={t("reset.expired.title")}
      footer={<Button href="/forgot-password" size="lg" block iconEnd={ArrowRight}>{t("reset.expired.cta")}</Button>}
    >
      <p>{t("reset.expired.body")}</p>
    </StatusPanel>
  );
}

/** Password updated. */
export function ResetDone() {
  const t = useT("auth");
  return (
    <StatusPanel
      icon={CircleCheck}
      tone="green"
      title={t("reset.done.title")}
      announce
      footer={<Button href="/dashboard" size="lg" block iconEnd={ArrowRight}>{t("reset.done.cta")}</Button>}
    >
      <p>{t("reset.done.body")}</p>
    </StatusPanel>
  );
}

/**
 * /reset-password. The e-mail link goes through /auth/callback, which exchanges
 * the recovery code for a session in this browser and forwards here. Without a
 * session the link was expired, already used, or opened in another browser.
 */
export default function ResetPasswordForm() {
  const t = useT("auth");
  const { isLoaded, isSignedIn, email } = useAuthUser();
  const [done, setDone] = useState(false);

  let body;
  if (done) body = <ResetDone />;
  else if (!isLoaded) body = <AuthFormSkeleton fields={2} />;
  else if (!isSignedIn) body = <ResetLinkExpired />;
  else body = <NewPasswordForm email={email} onDone={() => setDone(true)} />;

  return (
    <div>
      {body}
      {!done && (
        <p className="mt-7 text-center text-[0.9375rem]">
          <Link href="/sign-in" className={linkCls}>{t("backToSignIn")}</Link>
        </p>
      )}
    </div>
  );
}
