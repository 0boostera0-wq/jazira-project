"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { useT } from "@/i18n/client";
import Dialog from "@/components/ui/Dialog";
import Button from "@/components/ui/Button";
import Alert from "@/components/ui/Alert";
import { Field, Textarea } from "@/components/ui/Field";
import { cn } from "@/components/ui/cn";
import { POST_MAX, REPORT_REASONS as REASONS } from "./model";
const errKey = (e) => `errors.${e?.code && e.code !== "aborted" ? e.code : "unknown"}`;

/** Destructive / important confirmation. onConfirm may be async; errors stay in the dialog. */
export function ConfirmDialog({ title, body, confirmLabel, tone = "danger", onConfirm, onClose }) {
  const t = useT("community");
  const tc = useT("common");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      size="sm"
      onClose={busy ? undefined : onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>{tc("actions.cancel")}</Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} loading={busy} onClick={run}>{confirmLabel}</Button>
        </>
      }
    >
      <p className="t-body text-ink-2">{body}</p>
      {error && <Alert tone="danger" className="mt-4">{t(errKey(error))}</Alert>}
    </Dialog>
  );
}

/** Report a post, comment or member. */
export function ReportDialog({ api, targetType, targetId, onClose }) {
  const t = useT("community");
  const tc = useT("common");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!reason) { setError({ code: "reason" }); return; }
    setBusy(true);
    setError(null);
    try {
      await api.reportContent({ targetType, targetId, reason, note });
      setDone(true);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Dialog open size="sm" onClose={onClose} title={t("dialogs.report.doneTitle")}
        footer={<Button onClick={onClose}>{tc("actions.close")}</Button>}>
        <div className="flex items-start gap-3">
          <CheckCircle2 size={22} aria-hidden="true" className="mt-0.5 shrink-0 text-green-600" />
          <p className="t-body text-ink-2">{t("dialogs.report.doneBody")}</p>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      size="md"
      variant="sheet"
      onClose={busy ? undefined : onClose}
      title={t(`dialogs.report.title.${targetType}`)}
      description={t("dialogs.report.body")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>{tc("actions.cancel")}</Button>
          <Button type="submit" form="jz-report-form" loading={busy}>{t("dialogs.report.submit")}</Button>
        </>
      }
    >
      <form id="jz-report-form" onSubmit={submit} noValidate>
        <fieldset>
          <legend className="mb-2.5 text-sm font-medium text-ink">{t("dialogs.report.reasonLabel")}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {REASONS.map((r) => (
              <label
                key={r}
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 rounded-md border px-3.5 py-3 text-sm transition-colors duration-fast",
                  reason === r ? "border-gold-400 bg-gold-50 text-ink" : "border-line/15 text-ink-2 hover:border-line/30"
                )}
              >
                <input
                  type="radio"
                  name="reason"
                  value={r}
                  checked={reason === r}
                  onChange={() => { setReason(r); if (error?.code === "reason") setError(null); }}
                  className="h-4 w-4 accent-[rgb(var(--c-gold-500))]"
                />
                {t(`dialogs.report.reasons.${r}`)}
              </label>
            ))}
          </div>
        </fieldset>
        <Field className="mt-4" label={t("dialogs.report.noteLabel")} optional optionalText={tc("states.optional")} hint={t("dialogs.report.noteHint")}>
          {(p) => <Textarea {...p} rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />}
        </Field>
        {error && (
          <Alert tone="danger" className="mt-4">
            {error.code === "reason" ? t("dialogs.report.reasonRequired") : t(errKey(error))}
          </Alert>
        )}
      </form>
    </Dialog>
  );
}

/** Edit the text of your post. */
export function EditPostDialog({ post, onSave, onClose }) {
  const t = useT("community");
  const tc = useT("common");
  const [text, setText] = useState(post.content || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const tooLong = text.length > POST_MAX;
  const empty = !text.trim() && !post.media;

  const save = async (e) => {
    e?.preventDefault();
    if (tooLong || empty) return;
    setBusy(true);
    setError(null);
    try {
      await onSave(text);
      onClose();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      size="lg"
      variant="sheet"
      onClose={busy ? undefined : onClose}
      title={t("dialogs.edit.title")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>{tc("actions.cancel")}</Button>
          <Button type="submit" form="jz-edit-post" loading={busy} disabled={tooLong || empty}>{tc("actions.saveChanges")}</Button>
        </>
      }
    >
      <form id="jz-edit-post" onSubmit={save}>
        <Field label={t("dialogs.edit.label")} hint={t("composer.counter", { count: text.length, max: POST_MAX })} error={tooLong ? t("composer.errors.tooLong", { max: POST_MAX }) : empty ? t("composer.errors.empty") : null}>
          {(p) => (
            <Textarea
              {...p}
              dir="auto"
              rows={7}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) save(e); }}
            />
          )}
        </Field>
        {error && <Alert tone="danger" className="mt-4">{t(errKey(error))}</Alert>}
      </form>
    </Dialog>
  );
}
