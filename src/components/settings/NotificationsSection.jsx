"use client";

import { ArrowRight, BellRing, Mail } from "lucide-react";
import { useT } from "@/i18n/client";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import { useLoad, useSaver, useSettingsApi, useSettingsAuth } from "./SettingsContext";
import { RowsSkeleton, SettingsCard, ToggleRow, loadErrorMessage } from "./ui";

// notification_preferences switches (docs/DATA_API.md → Notifications), grouped as read.
const IN_APP = [
  { id: "community", keys: ["likes", "comments", "follows", "mentions"] },
  { id: "messages", keys: ["messages"] },
  { id: "learning", keys: ["exam_results"] },
  { id: "jazira", keys: ["product_updates"] },
];

/** Notification preferences: in-app types + the (future) email digest. */
export default function NotificationsSection() {
  const t = useT("settings");
  const auth = useSettingsAuth();
  const api = useSettingsApi();
  const prefs = useLoad(auth.userId ? `notif-prefs:${auth.userId}` : null, () => api.getNotificationPrefs(auth.userId));
  const unavailable = prefs.status === "ready" && prefs.data?.available === false;

  const body = (keys) => {
    if (prefs.status === "error") {
      return (
        <div className="flex flex-wrap items-center gap-3 px-5 py-4 sm:px-6">
          <p className="t-small text-ink-3">{loadErrorMessage(t, prefs.error)}</p>
          {prefs.error?.code !== "unavailable" && <Button variant="ghost" size="sm" onClick={prefs.reload}>{t("errors.retry")}</Button>}
        </div>
      );
    }
    if (prefs.status !== "ready") return <RowsSkeleton rows={keys.length} />;
    return keys.map((k) => <PrefToggle key={k} name={k} prefs={prefs} api={api} disabled={unavailable} />);
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="t-small max-w-2xl text-ink-3">{t("notifications.note")}</p>
        <Button href="/notifications" variant="secondary" size="sm" iconEnd={ArrowRight} className="shrink-0 self-start sm:self-auto">
          {t("notifications.viewAll")}
        </Button>
      </div>

      {unavailable && <Alert tone="info">{t("notifications.unavailable")}</Alert>}

      <SettingsCard icon={BellRing} title={t("notifications.inApp.title")} desc={t("notifications.inApp.desc")}>
        {IN_APP.map((g) => (
          <div key={g.id} role="group" aria-labelledby={`notif-group-${g.id}`}>
            <p id={`notif-group-${g.id}`} className="t-caption bg-surface-2/50 px-5 py-2 font-medium sm:px-6">
              {t(`notifications.groups.${g.id}.title`)}
            </p>
            <div className="divide-y divide-line/10 border-t border-line/10">{body(g.keys)}</div>
          </div>
        ))}
      </SettingsCard>

      <SettingsCard icon={Mail} title={t("notifications.groups.email.title")} desc={t("notifications.groups.email.desc")}>
        {body(["email_digest"])}
      </SettingsCard>
    </div>
  );
}

function PrefToggle({ name, prefs, api, disabled }) {
  const t = useT("settings");
  const saver = useSaver();
  const onChange = (value) =>
    saver.run(async () => {
      prefs.mutate((d) => ({ ...d, [name]: value }));
      try {
        await api.updateNotificationPref(name, value);
      } catch (err) {
        prefs.mutate((d) => ({ ...d, [name]: !value }));
        throw err;
      }
    });
  return (
    <ToggleRow
      title={t(`notifications.items.${name}.title`)}
      desc={t(`notifications.items.${name}.desc`)}
      checked={Boolean(prefs.data?.[name])}
      onChange={onChange}
      disabled={disabled || saver.saving}
      saver={saver}
    />
  );
}
