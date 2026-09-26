"use client";

import { useEffect, useId, useRef, useState } from "react";
import { BadgeCheck, Camera, IdCard, LockKeyhole, Phone, Trash2, UserRound } from "lucide-react";
import { useT } from "@/i18n/client";
import Avatar from "@/components/Avatar";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";
import Skeleton from "@/components/ui/Skeleton";
import Spinner from "@/components/ui/Spinner";
import { Input, Textarea } from "@/components/ui/Field";
import { cn } from "@/components/ui/cn";
import { nameCheck, normalizePhone, phoneError } from "@/components/auth/authUtils";
import { AVATAR_TYPES, BIO_MAX, cooldownEndsAt } from "./model";
import { useLoad, useNow, useSaver, useSettingsApi, useSettingsAuth } from "./SettingsContext";
import { CooldownNote, FieldRow, SaveStatus, SettingsCard, errorMessage } from "./ui";

/** Profile: public identity (photo, name, bio) and private details (email, phone). */
export default function ProfileSection() {
  const t = useT("settings");
  const auth = useSettingsAuth();
  const api = useSettingsApi();
  const priv = useLoad(auth.userId ? `private:${auth.userId}` : null, () => api.getPrivateProfile());
  const now = useNow(30000);

  const patchPriv = (patch) => priv.mutate((d) => ({ ...(d || {}), ...patch }));

  return (
    <div className="space-y-5 sm:space-y-6">
      <SettingsCard icon={UserRound} title={t("profile.publicCard.title")} desc={t("profile.publicCard.desc")}>
        <AvatarRow auth={auth} api={api} priv={priv} now={now} onChanged={patchPriv} />
        <NameRow auth={auth} api={api} priv={priv} now={now} onChanged={patchPriv} />
        <BioRow auth={auth} api={api} />
      </SettingsCard>

      <SettingsCard icon={LockKeyhole} tone="green" title={t("profile.privateCard.title")} desc={t("profile.privateCard.desc")}>
        <EmailRow auth={auth} />
        <PhoneRow auth={auth} api={api} priv={priv} now={now} onChanged={patchPriv} />
      </SettingsCard>
    </div>
  );
}

// ── photo ────────────────────────────────────────────────────────────────
function AvatarRow({ auth, api, priv, now, onChanged }) {
  const t = useT("settings");
  const saver = useSaver();
  const [action, setAction] = useState(null); // "upload" | "remove"
  const [viewing, setViewing] = useState(false);
  const fileRef = useRef(null);
  const endsAt = cooldownEndsAt("avatar", priv.data?.avatarChangedAt, auth.isElite, now);
  const locked = Boolean(endsAt);
  const busy = saver.saving;
  // Only a photo uploaded to Jazira can be removed; a provider picture (Google) is just a fallback.
  const ownPhoto = Boolean(auth.profile?.avatar_url);

  const onPick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setAction("upload");
    const r = await saver.run(() => api.uploadAvatar(auth.userId, file));
    if (r.ok) {
      onChanged({ avatarChangedAt: r.value.changedAt });
      await auth.refreshUser?.();
    } else if (r.error?.code === "avatarCooldown") priv.reload();
  };

  const onRemove = async () => {
    setAction("remove");
    const r = await saver.run(() => api.removeAvatar(auth.userId));
    if (r.ok) await auth.refreshUser?.();
  };

  const statusText = saver.status === "saving" ? t(action === "remove" ? "profile.avatar.removing" : "profile.avatar.uploading") : null;

  return (
    <FieldRow
      label={t("profile.avatar.label")}
      desc={
        <>
          <p>{t("profile.avatar.hint")}</p>
          <p className="mt-1">{t(auth.isElite ? "profile.avatar.ruleElite" : "profile.avatar.rule")}</p>
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-4 sm:gap-5">
        {auth.imageUrl ? (
          <button type="button" onClick={() => setViewing(true)} aria-label={t("profile.avatar.view")} className="relative shrink-0 rounded-full">
            <Avatar src={auth.imageUrl} name={auth.name} size={80} alt="" ring />
            {busy && <span className="absolute inset-0 grid place-items-center rounded-full bg-canvas/60 text-gold-600"><Spinner size={22} /></span>}
          </button>
        ) : (
          <span className="relative shrink-0 rounded-full">
            <Avatar src={auth.imageUrl} name={auth.name} size={80} alt="" ring />
            {busy && <span className="absolute inset-0 grid place-items-center rounded-full bg-canvas/60 text-gold-600"><Spinner size={22} /></span>}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-2">
            <input ref={fileRef} type="file" accept={AVATAR_TYPES.join(",")} onChange={onPick} className="hidden" tabIndex={-1} aria-hidden="true" />
            <Button variant="secondary" size="sm" iconStart={Camera} disabled={busy || locked} onClick={() => fileRef.current?.click()}>
              {ownPhoto ? t("profile.avatar.change") : t("profile.avatar.upload")}
            </Button>
            {ownPhoto && (
              <Button variant="ghost" size="sm" iconStart={Trash2} disabled={busy} onClick={onRemove} className="!text-danger hover:bg-danger-soft">
                {t("profile.avatar.remove")}
              </Button>
            )}
          </div>
          <SaveStatus
            status={saver.status}
            error={saver.error}
            savedText={t(action === "remove" ? "profile.avatar.removed" : "profile.avatar.updated")}
            className="mt-2"
          />
          {statusText && <span className="sr-only">{statusText}</span>}
          {priv.status === "ready" && <CooldownNote endsAt={endsAt} now={now} className="mt-1" />}
        </div>
      </div>

      <Dialog open={viewing} onClose={() => setViewing(false)} title={t("profile.avatar.previewTitle")} size="sm">
        {auth.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- user photo from Storage
          <img src={auth.imageUrl} alt={auth.name || ""} width={320} height={320} referrerPolicy="no-referrer" className="mx-auto aspect-square w-full max-w-xs rounded-lg bg-surface-2 object-cover" />
        )}
      </Dialog>
    </FieldRow>
  );
}

// ── display name ─────────────────────────────────────────────────────────
function NameRow({ auth, api, priv, now, onChanged }) {
  const t = useT("settings");
  const id = useId();
  const saver = useSaver();
  const [value, setValue] = useState(auth.name || "");
  const [clientError, setClientError] = useState(null);
  const dirty = useRef(false);
  useEffect(() => { if (!dirty.current) setValue(auth.name || ""); }, [auth.name]);

  const endsAt = cooldownEndsAt("name", priv.data?.nameChangedAt, auth.isElite, now);
  const locked = Boolean(endsAt);
  const changed = value.trim().replace(/\s+/g, " ") !== (auth.name || "");

  const submit = async (e) => {
    e.preventDefault();
    if (locked || saver.saving || !changed) return;
    const check = nameCheck(value);
    if (!check.ok) {
      setClientError(check.key);
      return;
    }
    setClientError(null);
    const r = await saver.run(() => api.updateFullName(check.value));
    if (r.ok) {
      dirty.current = false;
      setValue(check.value);
      onChanged({ nameChangedAt: r.value });
      await auth.refreshUser?.();
    } else if (r.error?.code === "nameCooldown") priv.reload();
  };

  const errText = clientError ? t(`profile.name.errors.${clientError}`) : null;
  const hintId = `${id}-hint`;

  return (
    <FieldRow label={t("profile.name.label")} labelFor={id} desc={<p id={hintId}>{t(auth.isElite ? "profile.name.hintElite" : "profile.name.hint")}</p>}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-2.5 sm:flex-row sm:items-start">
        <Input
          id={id}
          value={value}
          onChange={(e) => { dirty.current = true; setValue(e.target.value); if (clientError) setClientError(null); if (saver.status === "error") saver.reset(); }}
          maxLength={60}
          dir={value.trim() ? "auto" : undefined}
          autoComplete="name"
          placeholder={t("profile.name.placeholder")}
          disabled={locked}
          aria-invalid={clientError || saver.status === "error" ? true : undefined}
          aria-describedby={hintId}
          className="sm:flex-1"
        />
        {!locked && (
          <Button type="submit" variant={changed ? "primary" : "secondary"} loading={saver.saving} disabled={!changed} className="shrink-0">
            {t("profile.name.save")}
          </Button>
        )}
      </form>
      {errText ? (
        <p role="alert" className="t-caption mt-2 text-danger">{errText}</p>
      ) : (
        <SaveStatus status={saver.status} error={saver.error} savedText={t("profile.name.saved")} className="mt-2" />
      )}
      {priv.status === "ready" && <CooldownNote endsAt={endsAt} now={now} className="mt-1" />}
    </FieldRow>
  );
}

// ── bio ──────────────────────────────────────────────────────────────────
function BioRow({ auth, api }) {
  const t = useT("settings");
  const id = useId();
  const saver = useSaver();
  const initial = auth.profile?.bio || "";
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const dirty = useRef(false);
  useEffect(() => {
    if (!dirty.current) { setValue(initial); setSaved(initial); }
  }, [initial]);

  const changed = value.trim() !== saved.trim();
  const submit = async (e) => {
    e.preventDefault();
    if (!changed || saver.saving) return;
    const r = await saver.run(() => api.updateBio(value));
    if (r.ok) {
      dirty.current = false;
      setValue(r.value);
      setSaved(r.value);
      auth.refreshUser?.();
    }
  };

  return (
    <FieldRow label={t("profile.bio.label")} labelFor={id} desc={<p>{t("profile.bio.hint")}</p>}>
      <form onSubmit={submit} noValidate>
        <Textarea
          id={id}
          rows={3}
          value={value}
          maxLength={BIO_MAX}
          onChange={(e) => { dirty.current = true; setValue(e.target.value.slice(0, BIO_MAX)); if (saver.status === "error") saver.reset(); }}
          placeholder={t("profile.bio.placeholder")}
          dir={value.trim() ? "auto" : undefined}
          className="resize-y"
        />
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-3">
          <SaveStatus status={saver.status} error={saver.error} savedText={t("profile.bio.saved")} />
          <div className="flex items-center gap-3">
            <span className={cn("t-caption tabular", value.length >= BIO_MAX && "text-warning")}>
              {t("profile.bio.counter", { count: value.length, max: BIO_MAX })}
            </span>
            <Button type="submit" variant="secondary" size="sm" loading={saver.saving} disabled={!changed}>
              {t("profile.bio.save")}
            </Button>
          </div>
        </div>
      </form>
    </FieldRow>
  );
}

// ── private: email ───────────────────────────────────────────────────────
function EmailRow({ auth }) {
  const t = useT("settings");
  const confirmed = Boolean(auth.user?.email_confirmed_at || auth.user?.confirmed_at);
  return (
    <FieldRow label={t("profile.email.label")} desc={<p>{t("profile.email.hint")}</p>}>
      <div className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-line/10 bg-surface-2/60 px-3.5 py-2.5">
        <IdCard size={18} aria-hidden="true" className="shrink-0 text-ink-3" />
        <span className="ltr min-w-0 flex-1 truncate text-[0.9375rem] text-ink">{auth.email || "—"}</span>
        {auth.email && (
          confirmed
            ? <Badge size="sm" tone="green" icon={BadgeCheck}>{t("profile.email.verified")}</Badge>
            : <Badge size="sm" tone="warning">{t("profile.email.unverified")}</Badge>
        )}
      </div>
    </FieldRow>
  );
}

// ── private: phone ───────────────────────────────────────────────────────
function PhoneRow({ auth, api, priv, now, onChanged }) {
  const t = useT("settings");
  const id = useId();
  const saver = useSaver();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [clientError, setClientError] = useState(null);
  const [lastAction, setLastAction] = useState("save");
  const inputRef = useRef(null);

  const phone = priv.data?.phone || "";
  const endsAt = cooldownEndsAt("phone", priv.data?.phoneChangedAt, false, now);
  const locked = Boolean(endsAt);

  const startEdit = () => {
    setValue(phone);
    setClientError(null);
    saver.reset();
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const save = async (digits) => {
    const err = phoneError(digits);
    if (err) { setClientError("invalidPhone"); return; }
    setClientError(null);
    setLastAction(digits ? "save" : "remove");
    const r = await saver.run(() => api.updatePhone(digits));
    if (r.ok) {
      onChanged({ phone: digits, phoneChangedAt: r.value });
      setEditing(false);
    } else if (r.error?.code === "phoneCooldown") priv.reload();
  };

  const desc = <p>{t("profile.phone.hint")}</p>;

  if (priv.status === "loading" || priv.status === "idle") {
    return (
      <FieldRow label={t("profile.phone.label")} desc={desc}>
        <Skeleton rounded="md" className="h-11 w-full" />
      </FieldRow>
    );
  }
  if (priv.status === "error") {
    return (
      <FieldRow label={t("profile.phone.label")} desc={desc}>
        <div className="flex flex-wrap items-center gap-3">
          <p className="t-small text-ink-3">{priv.error?.code === "unavailable" ? t("errors.unavailable") : t("profile.phone.unavailable")}</p>
          {priv.error?.code !== "unavailable" && <Button variant="ghost" size="sm" onClick={priv.reload}>{t("errors.retry")}</Button>}
        </div>
      </FieldRow>
    );
  }

  return (
    <FieldRow label={t("profile.phone.label")} labelFor={editing ? id : undefined} desc={desc}>
      {editing ? (
        <form onSubmit={(e) => { e.preventDefault(); save(value); }} noValidate>
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start">
            <div className="flex flex-1 gap-2" dir="ltr">
              <span className="grid h-11 shrink-0 place-items-center rounded-md border border-line/20 bg-surface-2 px-3 text-[0.9375rem] font-medium text-ink-2" title={t("profile.phone.countryCode")}>+966</span>
              <Input
                ref={inputRef}
                id={id}
                value={value}
                onChange={(e) => { setValue(normalizePhone(e.target.value)); if (clientError) setClientError(null); }}
                inputMode="numeric"
                autoComplete="tel-national"
                placeholder={t("profile.phone.placeholder")}
                aria-invalid={clientError ? true : undefined}
                className="tabular"
              />
            </div>
            <div className="flex shrink-0 gap-2">
              <Button type="submit" variant="primary" loading={saver.saving && lastAction === "save"} disabled={saver.saving || !value || value === phone}>
                {t("profile.phone.save")}
              </Button>
              <Button variant="ghost" disabled={saver.saving} onClick={() => { setEditing(false); saver.reset(); setClientError(null); }}>
                {t("profile.phone.cancel")}
              </Button>
            </div>
          </div>
          {phone && (
            <Button variant="link" size="sm" disabled={saver.saving} onClick={() => save("")} className="mt-2.5 !text-danger">
              {t("profile.phone.remove")}
            </Button>
          )}
        </form>
      ) : (
        <div className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-line/10 bg-surface-2/60 px-3.5 py-2">
          <Phone size={18} aria-hidden="true" className="shrink-0 text-ink-3" />
          {phone ? (
            <span className="ltr min-w-0 flex-1 text-[0.9375rem] text-ink tabular">+966 {phone}</span>
          ) : (
            <span className="min-w-0 flex-1 text-[0.9375rem] text-ink-3">{t("profile.phone.none")}</span>
          )}
          <Button variant="secondary" size="sm" onClick={startEdit} disabled={locked}>
            {phone ? t("profile.phone.change") : t("profile.phone.add")}
          </Button>
        </div>
      )}
      {clientError ? (
        <p role="alert" className="t-caption mt-2 text-danger">{t(`errors.${clientError}`)}</p>
      ) : (
        <SaveStatus
          status={saver.status}
          error={saver.error}
          errorText={saver.error ? errorMessage(t, saver.error) : null}
          savedText={t(lastAction === "remove" ? "profile.phone.removed" : "profile.phone.saved")}
          className="mt-2"
        />
      )}
      <CooldownNote endsAt={endsAt} now={now} className="mt-1" />
    </FieldRow>
  );
}
