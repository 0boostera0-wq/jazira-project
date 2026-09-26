"use client";

import { useId, useState } from "react";
import { BookOpenCheck, MessagesSquare, Settings2, SquarePen, Trash2, TriangleAlert, UserRound } from "lucide-react";
import { useT, useLocale } from "@/i18n/client";
import { Link, localizeHref } from "@/i18n/navigation";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Field";
import { phraseMatches } from "./model";
import { clearSettingsCache, useSettingsApi, useSettingsAuth } from "./SettingsContext";

const WHAT = [
  { key: "profile", icon: UserRound },
  { key: "content", icon: SquarePen },
  { key: "learning", icon: BookOpenCheck },
  { key: "messages", icon: MessagesSquare },
  { key: "settings", icon: Settings2 },
];

/** Danger zone: permanent account deletion behind a typed confirmation (POST /api/account/delete). */
export default function DangerSection() {
  const t = useT("settings");
  const { locale } = useLocale();
  const auth = useSettingsAuth();
  const api = useSettingsApi();
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const expected = t("danger.dialog.phrase");
  const ready = phraseMatches(phrase, expected);

  const close = () => {
    if (busy) return;
    setOpen(false);
    setPhrase("");
    setError(null);
  };

  const confirm = async (e) => {
    e?.preventDefault();
    if (!ready || busy || error === "notConfigured") return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteAccount();
      clearSettingsCache();
      await api.signOutLocal();
      window.location.assign(localizeHref("/", locale));
    } catch (err) {
      setError(err?.code || "failed");
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="danger-title" className="surface overflow-hidden border-danger/25">
      <div className="p-5 sm:p-7">
        <div className="flex items-start gap-3.5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-danger-soft text-danger ring-1 ring-inset ring-danger/15">
            <TriangleAlert size={20} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3 id="danger-title" className="t-h4">{t("danger.title")}</h3>
            <p className="t-small mt-1 max-w-2xl text-ink-3">{t("danger.body")}</p>
          </div>
        </div>

        <div className="mt-6 rounded-md border border-line/10 bg-surface-2/50 p-4 sm:p-5">
          <p className="text-[0.9375rem] font-medium text-ink">{t("danger.what.title")}</p>
          <ul className="mt-3 grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
            {WHAT.map((w) => (
              <li key={w.key} className="t-small flex items-start gap-2.5 text-ink-2">
                <w.icon size={16} aria-hidden="true" className="mt-1 shrink-0 text-ink-3" />
                {t(`danger.what.${w.key}`)}
              </li>
            ))}
          </ul>
        </div>

        {auth.isElite && <Alert tone="warning" className="mt-4">{t("danger.eliteNote")}</Alert>}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button variant="danger" iconStart={Trash2} onClick={() => setOpen(true)}>{t("danger.open")}</Button>
          <Button href="/contact" variant="ghost">{t("danger.contact")}</Button>
        </div>
      </div>

      <Dialog
        open={open}
        onClose={close}
        variant="sheet"
        size="md"
        title={t("danger.dialog.title")}
        description={t("danger.dialog.body")}
        footer={
          <>
            <Button variant="ghost" onClick={close} disabled={busy}>{t("danger.dialog.cancel")}</Button>
            <Button variant="danger" iconStart={Trash2} loading={busy} disabled={!ready || error === "notConfigured"} onClick={confirm}>
              {busy ? t("danger.dialog.deleting") : t("danger.dialog.confirm")}
            </Button>
          </>
        }
      >
        <form onSubmit={confirm} noValidate>
          <label htmlFor={inputId} className="t-small block text-ink-2">
            {t("danger.dialog.prompt", { phrase: expected })}
          </label>
          <Input
            id={inputId}
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            className="mt-2.5"
            disabled={busy}
          />
          {error && (
            <Alert tone="danger" className="mt-4">
              {t(`danger.errors.${["notConfigured", "unavailable", "unauthorized", "failed", "network"].includes(error) ? error : "failed"}`)}
              {(error === "notConfigured" || error === "failed" || error === "unavailable") && (
                <>
                  {" "}
                  <Link href="/contact" className="font-medium underline underline-offset-4">{t("danger.contact")}</Link>
                </>
              )}
            </Alert>
          )}
        </form>
      </Dialog>
    </section>
  );
}
