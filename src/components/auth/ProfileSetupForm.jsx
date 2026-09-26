"use client";

/* eslint-disable @next/next/no-img-element -- local blob previews and provider avatars */
import { useEffect, useRef, useState } from "react";
import { Camera, UserRound } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { useT } from "@/i18n/client";
import { useAuthUser } from "@/context/AuthProvider";
import { getSupabase } from "@/lib/supabase-lazy";
import { genHandle } from "@/lib/profile";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { AuthFormSkeleton, Redirecting } from "./AuthParts";
import { useQueryParams } from "./hooks";
import { authErrorKey, AVATAR_TYPES, MAX_AVATAR_BYTES, nameCheck, resolveNext, suggestedName } from "./authUtils";

const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/**
 * Display name + optional photo. Persists exactly like before the redesign:
 * photo → avatars bucket (own folder, unique path) · profile row with an
 * internal handle · name via update_full_name() (cooldown clock) · photo via
 * set_avatar(). No direct-UPDATE fallbacks: full_name / avatar_url are only
 * writable through those RPCs (migration 0009).
 */
export function ProfileSetupForm({ userId, defaultName = "", imageUrl = "", onSaved }) {
  const t = useT("auth");
  const [name, setName] = useState(defaultName);
  const [nameError, setNameError] = useState(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);
  const fileRef = useRef(null);
  const nameRef = useRef(null);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const pick = (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!AVATAR_TYPES.includes(f.type)) return setError("avatarType");
    if (f.size > MAX_AVATAR_BYTES) return setError("avatarSize");
    setError(null);
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const clearPhoto = () => {
    setFile(null);
    setPreview(null);
    if (error?.startsWith("avatar")) setError(null);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (pending) return;
    setError(null);
    const check = nameCheck(name);
    if (!check.ok) {
      setNameError(check.key);
      nameRef.current?.focus();
      return;
    }
    setPending(true);
    const fail = (key) => { setError(key); setPending(false); };

    try {
      const supabase = await getSupabase();
      if (!supabase) return fail("notConfigured");

      // 1. Photo first, so a failed upload changes nothing.
      let avatarUrl = null;
      let uploadedPath = null;
      if (file) {
        const path = `${userId}/avatar-${Date.now()}.${EXT[file.type] || "jpg"}`;
        const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { contentType: file.type });
        if (upErr) return fail("avatarUpload");
        uploadedPath = path;
        avatarUrl = `${supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl}?t=${Date.now()}`;
      }
      const dropUpload = async () => { if (uploadedPath) { try { await supabase.storage.from("avatars").remove([uploadedPath]); } catch {} } };

      // 2. Make sure the profile row exists with its internal (never shown) handle.
      //    (handle_new_user() normally created it; insert-only, never an update:
      //    username is not client-writable after creation.)
      const { data: existing } = await supabase.from("profiles").select("username").eq("id", userId).maybeSingle();
      if (!existing?.username) {
        const { error: rowErr } = await supabase.from("profiles")
          .upsert({ id: userId, username: genHandle(check.value) }, { onConflict: "id", ignoreDuplicates: true });
        if (rowErr) {
          await dropUpload();
          return fail("profileSave");
        }
      }

      // 3. Public name through the secure RPC (validates + starts the change cooldown).
      const { error: nameErr } = await supabase.rpc("update_full_name", { new_name: check.value });
      if (nameErr) {
        if (/invalid_name_format/i.test(nameErr.message || "")) {
          await dropUpload();
          setNameError("nameChars");
          setPending(false);
          nameRef.current?.focus();
          return;
        }
        // name_cooldown: a name is already set — finish setup with it. Any other
        // error fails: full_name is only writable through the RPC (migration 0009).
        if (!/name_cooldown/i.test(nameErr.message || "")) {
          await dropUpload();
          return fail("profileSave");
        }
      }

      // 4. Photo through set_avatar() (cooldown-aware). Never blocks finishing setup.
      if (avatarUrl) {
        const { error: avErr } = await supabase.rpc("set_avatar", { new_url: avatarUrl });
        if (avErr) await dropUpload();
      }

      await onSaved?.();
    } catch (err) {
      fail(authErrorKey(err, "profileSave"));
    }
  };

  const shown = preview || imageUrl;
  const initial = name.trim().charAt(0);

  return (
    <form noValidate onSubmit={submit} className="grid gap-6">
      {error && <Alert tone="danger">{t(`errors.${error}`)}</Alert>}

      <div className="flex items-center gap-4 rounded-lg border border-line/15 bg-surface p-4 sm:gap-5">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="group relative h-20 w-20 shrink-0 rounded-full"
          aria-label={shown ? t("profileSetup.changePhoto") : t("profileSetup.choosePhoto")}
        >
          <span className="grid h-full w-full place-items-center overflow-hidden rounded-full bg-gold-100 text-3xl font-medium text-gold-700 ring-1 ring-inset ring-gold-200/70">
            {shown ? (
              <img src={shown} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
            ) : initial ? (
              <span aria-hidden="true">{initial}</span>
            ) : (
              <UserRound size={32} aria-hidden="true" />
            )}
          </span>
          <span className="absolute -bottom-0.5 -end-0.5 grid h-8 w-8 place-items-center rounded-full border-2 border-surface bg-primary text-primary-fg shadow-sm transition-transform group-hover:scale-105">
            <Camera size={15} aria-hidden="true" />
          </span>
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">{t("profileSetup.photo")}</p>
          <p className="t-caption mt-0.5">{t("profileSetup.photoHint")}</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
              {shown ? t("profileSetup.changePhoto") : t("profileSetup.choosePhoto")}
            </Button>
            {file && (
              <Button variant="ghost" size="sm" onClick={clearPhoto}>{t("profileSetup.removePhoto")}</Button>
            )}
          </div>
        </div>
        <input ref={fileRef} type="file" accept={AVATAR_TYPES.join(",")} onChange={pick} hidden />
      </div>

      <Field label={t("fields.name")} hint={t("fields.nameHint")} error={nameError && t(`validation.${nameError}`)}>
        {(p) => (
          <Input
            {...p}
            ref={nameRef}
            name="name"
            autoComplete="name"
            dir="auto"
            maxLength={60}
            placeholder={t("fields.namePlaceholder")}
            value={name}
            onChange={(e) => { setName(e.target.value); setNameError(null); }}
          />
        )}
      </Field>

      <div className="grid gap-3">
        <Button type="submit" size="lg" block loading={pending}>{t("profileSetup.submit")}</Button>
        <p className="t-caption text-center">{t("profileSetup.later")}</p>
      </div>
    </form>
  );
}

/** /profile-setup — first sign-in (e.g. Google) without a public name yet. */
export default function ProfileSetup() {
  const t = useT("auth");
  const router = useRouter();
  const { isLoaded, isSignedIn, needsProfileSetup, userId, name, imageUrl, refreshUser } = useAuthUser();
  const query = useQueryParams();
  const next = resolveNext(query?.get("next"));
  const leaving = useRef(false);

  useEffect(() => {
    if (!isLoaded || leaving.current) return;
    if (!isSignedIn) {
      leaving.current = true;
      router.replace("/sign-in");
    } else if (!needsProfileSetup) {
      leaving.current = true;
      router.replace(next);
    }
  }, [isLoaded, isSignedIn, needsProfileSetup, next, router]);

  if (!isLoaded || !isSignedIn) return <AuthFormSkeleton fields={1} avatar />;
  if (!needsProfileSetup) return <Redirecting label={t("redirecting")} />;

  return (
    <ProfileSetupForm
      userId={userId}
      defaultName={suggestedName(name)}
      imageUrl={imageUrl}
      onSaved={async () => {
        // Refresh first so needsProfileSetup flips before we navigate — otherwise
        // the app shell's setup guard would bounce straight back here.
        leaving.current = true;
        await refreshUser();
        router.replace(next);
      }}
    />
  );
}
