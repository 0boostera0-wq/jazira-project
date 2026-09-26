"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Circle, KeyRound, Laptop, LogOut, Mail, MapPin, MonitorSmartphone, ShieldCheck, Smartphone, Tablet, UserRoundCheck } from "lucide-react";
import { useT, useLocale } from "@/i18n/client";
import { formatRelative } from "@/i18n/format";
import { localizeHref } from "@/i18n/navigation";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";
import Skeleton from "@/components/ui/Skeleton";
import { Field } from "@/components/ui/Field";
import { cn } from "@/components/ui/cn";
import AuthPasswordInput from "@/components/auth/AuthPasswordInput";
import { authErrorKey, newPasswordError, passwordRules } from "@/components/auth/authUtils";
import { deviceInfo, isRecentlyActive, sortSessions } from "./model";
import { clearSettingsCache, useLoad, useNow, useSaver, useSettingsApi, useSettingsAuth } from "./SettingsContext";
import { RowsSkeleton, SaveStatus, SettingsCard, errorMessage, loadErrorMessage } from "./ui";

const PASSWORD_ERRORS = ["passwordRequired", "passwordShort", "passwordMix", "confirmRequired", "passwordMismatch", "samePassword", "weakPassword", "sessionExpired", "rateLimit", "network", "generic"];

/** Account & security: sign-in methods, password, connected devices. */
export default function AccountSection() {
  const auth = useSettingsAuth();
  const api = useSettingsApi();
  const methods = useLoad(auth.userId ? `methods:${auth.userId}` : null, () => api.getSignInMethods());

  return (
    <div className="space-y-5 sm:space-y-6">
      <MethodsCard methods={methods} />
      <PasswordCard auth={auth} api={api} methods={methods} />
      <SessionsCard auth={auth} api={api} />
    </div>
  );
}

// ── sign-in methods ──────────────────────────────────────────────────────
function MethodsCard({ methods }) {
  const t = useT("settings");
  const m = methods.data;
  const rows = m
    ? [
        m.email && { key: "email", icon: Mail, label: t("account.method.email") },
        m.google && { key: "google", icon: UserRoundCheck, label: t("account.method.google") },
        ...(m.others || []).map((p) => ({ key: p, icon: UserRoundCheck, label: t("account.method.other") })),
      ].filter(Boolean)
    : [];

  return (
    <SettingsCard icon={ShieldCheck} title={t("account.method.title")} desc={t("account.method.desc")}>
      {methods.status === "loading" || methods.status === "idle" ? (
        <RowsSkeleton rows={1} />
      ) : methods.status === "error" ? (
        <div className="flex flex-wrap items-center gap-3 px-5 py-4 sm:px-6">
          <p className="t-small text-ink-3">{loadErrorMessage(t, methods.error)}</p>
          {methods.error?.code !== "unavailable" && <Button variant="ghost" size="sm" onClick={methods.reload}>{t("errors.retry")}</Button>}
        </div>
      ) : (
        <ul className="divide-y divide-line/10">
          {rows.map((r) => (
            <li key={r.key} className="flex items-center gap-3.5 px-5 py-4 sm:px-6">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-sm bg-surface-2 text-ink-2 ring-1 ring-inset ring-line/10">
                <r.icon size={18} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1 text-[0.9375rem] font-medium text-ink">{r.label}</span>
              <Badge size="sm" tone="green" icon={Check}>{t("account.method.linked")}</Badge>
            </li>
          ))}
        </ul>
      )}
    </SettingsCard>
  );
}

// ── password ─────────────────────────────────────────────────────────────
function PasswordCard({ auth, api, methods }) {
  const t = useT("settings");
  const saver = useSaver(4000);
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const pwRef = useRef(null);
  const confirmRef = useRef(null);

  if (methods.status === "loading" || methods.status === "idle") {
    return (
      <SettingsCard icon={KeyRound} title={t("account.password.title")} desc={t("account.password.desc")}>
        <RowsSkeleton rows={2} field />
      </SettingsCard>
    );
  }

  // Sign-in methods unknown (read failed) → offer the form; only a known Google-only account gets the explanation.
  if (methods.status === "ready" && !methods.data?.canChangePassword) {
    return (
      <SettingsCard icon={KeyRound} title={t("account.password.title")} desc={t("account.password.googleOnly.title")}>
        <p className="t-small max-w-2xl px-5 py-4 text-ink-2 sm:px-6">{t("account.password.googleOnly.body")}</p>
      </SettingsCard>
    );
  }

  const rules = passwordRules(pw);
  const submit = async (e) => {
    e.preventDefault();
    if (saver.saving) return;
    setFormError(null);
    const errs = {
      pw: newPasswordError(pw),
      confirm: !confirm ? "confirmRequired" : confirm !== pw ? "passwordMismatch" : null,
    };
    setErrors(errs);
    if (errs.pw) return pwRef.current?.focus();
    if (errs.confirm) return confirmRef.current?.focus();
    const r = await saver.run(() => api.changePassword(pw));
    if (r.ok) {
      setPw("");
      setConfirm("");
    } else {
      const key = authErrorKey(r.error);
      setFormError(PASSWORD_ERRORS.includes(key) ? key : "generic");
      saver.reset();
    }
  };
  const msg = (k) => (k ? t(`account.password.errors.${k}`) : null);

  return (
    <SettingsCard icon={KeyRound} title={t("account.password.title")} desc={t("account.password.desc")}>
      <form method="post" noValidate onSubmit={submit} className="px-5 py-5 sm:px-6">
        {auth.email && <input type="text" name="username" autoComplete="username" value={auth.email} readOnly hidden />}
        <div className="grid gap-5 md:grid-cols-2">
          <Field id="settings-new-password" label={t("account.password.new")} error={msg(errors.pw)}>
            {(p) => (
              <AuthPasswordInput
                {...p}
                ref={pwRef}
                name="new-password"
                autoComplete="new-password"
                value={pw}
                onChange={(e) => { setPw(e.target.value); if (errors.pw) setErrors((x) => ({ ...x, pw: null })); }}
              />
            )}
          </Field>
          <Field id="settings-confirm-password" label={t("account.password.confirm")} error={msg(errors.confirm)}>
            {(p) => (
              <AuthPasswordInput
                {...p}
                ref={confirmRef}
                name="confirm-password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => { setConfirm(e.target.value); if (errors.confirm) setErrors((x) => ({ ...x, confirm: null })); }}
              />
            )}
          </Field>
        </div>
        <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5" aria-label={t("account.password.title")}>
          {[["length", rules.length], ["mix", rules.mix]].map(([k, ok]) => (
            <li key={k} className={cn("t-caption flex items-center gap-1.5", ok && "text-green-600")}>
              {ok ? <Check size={14} aria-hidden="true" /> : <Circle size={12} aria-hidden="true" className="text-ink-4" />}
              {t(`account.password.rules.${k}`)}
            </li>
          ))}
        </ul>
        {formError && <Alert tone="danger" className="mt-4">{msg(formError)}</Alert>}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button type="submit" loading={saver.saving}>{t("account.password.submit")}</Button>
          <SaveStatus status={saver.status === "error" ? "idle" : saver.status} savedText={t("account.password.success")} />
        </div>
      </form>
    </SettingsCard>
  );
}

// ── connected devices ────────────────────────────────────────────────────
const DEVICE_ICONS = { mobile: Smartphone, tablet: Tablet, desktop: Laptop, unknown: MonitorSmartphone };

function SessionsCard({ auth, api }) {
  const t = useT("settings");
  const { locale } = useLocale();
  const now = useNow(60000);
  const sessions = useLoad(auth.userId ? `sessions:${auth.userId}` : null, () => api.listSessions(auth.userId));
  const [sid, setSid] = useState(null);
  const [pending, setPending] = useState(null); // session_id being revoked
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const allSaver = useSaver();

  useEffect(() => setSid(api.currentSessionId()), [api]);

  const rows = sortSessions(sessions.data || [], sid);

  const revoke = async (row) => {
    const isCurrent = row.session_id === sid;
    setError(null);
    setNotice(null);
    setPending(row.session_id);
    try {
      await api.revokeSession(auth.userId, row.session_id);
      if (isCurrent) {
        clearSettingsCache();
        await auth.signOut?.();
        window.location.assign(localizeHref("/", locale));
        return;
      }
      sessions.mutate((list) => (list || []).filter((r) => r.session_id !== row.session_id));
      setNotice(t("account.sessions.signedOut"));
    } catch (err) {
      setError(err);
    }
    setPending(null);
  };

  const signOutAll = async () => {
    const r = await allSaver.run(() => api.signOutEverywhere(auth.userId));
    if (r.ok) {
      clearSettingsCache();
      window.location.assign(localizeHref("/", locale));
    }
  };

  const label = (row) => {
    const d = deviceInfo(row);
    const name = [d.os || t("account.sessions.unknownOs"), d.browser].filter(Boolean).join(" · ");
    return { d, name };
  };

  return (
    <SettingsCard
      icon={MonitorSmartphone}
      title={t("account.sessions.title")}
      desc={t("account.sessions.desc")}
      footer={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="t-caption max-w-md">{t("account.sessions.note")}</p>
          <Button variant="secondary" size="sm" iconStart={LogOut} onClick={() => setConfirmAll(true)} className="shrink-0 !text-danger">
            {t("account.sessions.signOutAll")}
          </Button>
        </div>
      }
    >
      {sessions.status === "loading" || sessions.status === "idle" ? (
        <SessionsSkeleton />
      ) : sessions.status === "error" ? (
        <div className="flex flex-wrap items-center gap-3 px-5 py-4 sm:px-6">
          <p className="t-small text-ink-3">{sessions.error?.code === "unavailable" ? t("account.sessions.unavailable") : t("errors.loadFailed")}</p>
          {sessions.error?.code !== "unavailable" && <Button variant="ghost" size="sm" onClick={sessions.reload}>{t("errors.retry")}</Button>}
        </div>
      ) : rows.length === 0 ? (
        <p className="t-small px-5 py-5 text-ink-3 sm:px-6">{t("account.sessions.empty")}</p>
      ) : (
        <ul className="divide-y divide-line/10">
          {rows.map((row) => {
            const { d, name } = label(row);
            const Icon = DEVICE_ICONS[d.type];
            const current = row.session_id === sid;
            const fresh = current || isRecentlyActive(row.last_active_at, now);
            const type = t(`account.sessions.types.${d.type}`);
            return (
              <li key={row.session_id} className="flex flex-wrap items-start gap-x-4 gap-y-2.5 px-5 py-4 sm:flex-nowrap sm:items-center sm:px-6">
                <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-md ring-1 ring-inset", current ? "bg-green-50 text-green-600 ring-green-100" : "bg-surface-2 text-ink-2 ring-line/10")}>
                  <Icon size={20} aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <bdi className="font-medium text-ink">{name}</bdi>
                    {current && <Badge size="sm" tone="green">{t("account.sessions.current")}</Badge>}
                  </p>
                  <p className="t-caption mt-0.5 flex items-center gap-1">
                    {d.location && <MapPin size={13} aria-hidden="true" className="shrink-0 text-ink-4" />}
                    <span className="min-w-0 truncate">
                      {type}
                      {d.location && <> · <bdi>{d.location}</bdi></>}
                    </span>
                  </p>
                  <p className={cn("t-caption flex items-center gap-1.5", fresh && "text-green-600")}>
                    <span aria-hidden="true" className={cn("h-1.5 w-1.5 shrink-0 rounded-full", fresh ? "bg-green-500" : "bg-ink-4/50")} />
                    {fresh
                      ? t("account.sessions.activeNow")
                      : t("account.sessions.lastActive", { time: formatRelative(row.last_active_at, locale, now) })}
                  </p>
                </div>
                <div className="max-sm:basis-full max-sm:ps-[3.75rem] sm:ms-auto sm:shrink-0">
                  <Button
                    variant={current ? "secondary" : "ghost"}
                    size="sm"
                    loading={pending === row.session_id}
                    disabled={Boolean(pending)}
                    onClick={() => revoke(row)}
                    aria-label={current ? undefined : t("account.sessions.signOutAria", { device: name })}
                    className={cn("max-sm:-ms-3", !current && "!text-danger hover:bg-danger-soft", current && "max-sm:ms-0")}
                  >
                    {current ? t("account.sessions.signOutThis") : t("account.sessions.signOut")}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {(error || notice) && (
        <div className="px-5 py-3 sm:px-6">
          <SaveStatus status={error ? "error" : "saved"} error={error} savedText={notice} />
        </div>
      )}

      <Dialog
        open={confirmAll}
        onClose={() => !allSaver.saving && setConfirmAll(false)}
        title={t("account.sessions.signOutAll")}
        description={t("account.sessions.signOutAllDesc")}
        size="md"
        footer={
          <>
            <Button variant="ghost" disabled={allSaver.saving} onClick={() => setConfirmAll(false)}>{t("danger.dialog.cancel")}</Button>
            <Button variant="danger" iconStart={LogOut} loading={allSaver.saving} onClick={signOutAll}>{t("account.sessions.signOutAll")}</Button>
          </>
        }
      >
        {allSaver.status === "error" ? <Alert tone="danger">{errorMessage(t, allSaver.error)}</Alert> : <p className="t-small text-ink-3">{t("account.sessions.note")}</p>}
      </Dialog>
    </SettingsCard>
  );
}

function SessionsSkeleton() {
  return (
    <div aria-hidden="true" className="divide-y divide-line/10">
      {[0, 1].map((i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-4 sm:px-6">
          <Skeleton rounded="md" className="h-11 w-11 shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56 max-w-full" />
          </div>
          <Skeleton rounded="full" className="h-9 w-24 shrink-0" />
        </div>
      ))}
    </div>
  );
}
