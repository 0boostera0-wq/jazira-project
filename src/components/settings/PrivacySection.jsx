"use client";

import { useState } from "react";
import { ArrowRight, Eye, MessagesSquare, UserRoundCog } from "lucide-react";
import { useT } from "@/i18n/client";
import Illustration from "@/components/ui/Illustration";
import Button from "@/components/ui/Button";
import { useLoad, useSaver, useSettingsApi, useSettingsAuth } from "./SettingsContext";
import { RowsSkeleton, SettingsCard, ToggleRow, loadErrorMessage } from "./ui";

/** Privacy: community identity (profiles flags) · public profile + messaging (user_social_settings). */
export default function PrivacySection() {
  const t = useT("settings");
  const auth = useSettingsAuth();
  const api = useSettingsApi();
  const social = useLoad(auth.userId ? `social:${auth.userId}` : null, () => api.getSocial(auth.userId));

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Intro: what this section controls, with the privacy art as the card's end column */}
      <div className="surface-tint grid items-center overflow-hidden sm:grid-cols-[minmax(0,1fr)_200px] lg:grid-cols-[minmax(0,1fr)_240px]">
        <div className="p-5 sm:p-6">
          <p className="t-h4">{t("privacy.intro.title")}</p>
          <p className="t-small mt-1.5 max-w-xl text-ink-3">{t("privacy.intro.body")}</p>
        </div>
        <div aria-hidden="true" className="relative hidden h-full min-h-[9rem] sm:block">
          <Illustration id="landing.privacy" fill sizes="240px" />
        </div>
      </div>

      <IdentityCard auth={auth} api={api} />

      <SettingsCard icon={Eye} title={t("privacy.profile.title")} desc={t("privacy.profile.desc")}>
        {social.status !== "ready" ? (
          <SocialFallback social={social} rows={2} />
        ) : (
          <>
            <SocialToggle social={social} api={api} field="show_likes_on_profile" copy="likes" />
            <SocialToggle social={social} api={api} field="show_reposts_on_profile" copy="reposts" />
          </>
        )}
      </SettingsCard>

      <SettingsCard icon={MessagesSquare} title={t("privacy.messages.title")} desc={t("privacy.messages.desc")}>
        {social.status !== "ready" ? (
          <SocialFallback social={social} rows={3} />
        ) : (
          <>
            <SocialToggle social={social} api={api} field="allow_messages" copy="allowMessages" />
            <SocialToggle
              social={social}
              api={api}
              field="allow_message_requests"
              copy="allowRequests"
              disabled={!social.data.allow_messages}
              note={!social.data.allow_messages ? t("privacy.needsMessages") : null}
            />
            <SocialToggle social={social} api={api} field="hide_message_requests" copy="muteRequests" disabled={!social.data.allow_messages} />
          </>
        )}
      </SettingsCard>
    </div>
  );
}

// ── profiles.show_elite_badge / anonymous_community ─────────────────────────
function IdentityCard({ auth, api }) {
  const t = useT("settings");
  const [anon, setAnon] = useState(Boolean(auth.anonymousCommunity));
  const [badge, setBadge] = useState(auth.showEliteBadge !== false);
  const anonSaver = useSaver();
  const badgeSaver = useSaver();

  const save = (column, value, set, saver) =>
    saver.run(async () => {
      set(value);
      try {
        await api.setProfileFlag(auth.userId, column, value);
      } catch (err) {
        set(!value);
        throw err;
      }
      auth.refreshUser?.();
    });

  return (
    <SettingsCard icon={UserRoundCog} title={t("privacy.identity.title")} desc={t("privacy.identity.desc")}>
      <ToggleRow
        title={t("privacy.anonymous.title")}
        desc={t("privacy.anonymous.desc")}
        checked={anon}
        onChange={(v) => save("anonymous_community", v, setAnon, anonSaver)}
        disabled={anonSaver.saving}
        saver={anonSaver}
      />
      <ToggleRow
        title={t("privacy.eliteBadge.title")}
        desc={t("privacy.eliteBadge.desc")}
        checked={auth.isElite && badge}
        onChange={(v) => save("show_elite_badge", v, setBadge, badgeSaver)}
        disabled={!auth.isElite || badgeSaver.saving}
        saver={badgeSaver}
        note={
          !auth.isElite ? (
            <span className="inline-flex flex-wrap items-center gap-x-2">
              {t("privacy.eliteBadge.locked")}
              <Button href="/subscriptions" variant="link" size="sm" iconEnd={ArrowRight}>{t("privacy.eliteBadge.cta")}</Button>
            </span>
          ) : null
        }
      />
    </SettingsCard>
  );
}

// ── user_social_settings (lib/social.js) ───────────────────────────────────
function SocialToggle({ social, api, field, copy, disabled, note }) {
  const t = useT("settings");
  const saver = useSaver();
  const checked = Boolean(social.data?.[field]);
  const onChange = (value) =>
    saver.run(async () => {
      social.mutate((d) => ({ ...d, [field]: value }));
      try {
        await api.updateSocial({ [field]: value });
      } catch (err) {
        social.mutate((d) => ({ ...d, [field]: !value }));
        throw err;
      }
    });
  return (
    <ToggleRow
      title={t(`privacy.${copy}.title`)}
      desc={t(`privacy.${copy}.desc`)}
      checked={checked}
      onChange={onChange}
      disabled={disabled || saver.saving}
      saver={saver}
      note={note}
    />
  );
}

function SocialFallback({ social, rows }) {
  const t = useT("settings");
  if (social.status === "error") {
    return (
      <div className="flex flex-wrap items-center gap-3 px-5 py-4 sm:px-6">
        <p className="t-small text-ink-3">{loadErrorMessage(t, social.error)}</p>
        {social.error?.code !== "unavailable" && <Button variant="ghost" size="sm" onClick={social.reload}>{t("errors.retry")}</Button>}
      </div>
    );
  }
  return <RowsSkeleton rows={rows} />;
}
