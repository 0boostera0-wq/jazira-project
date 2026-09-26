"use client";

import { Moon, Palette, Sparkles, Sun } from "lucide-react";
import { useT, useLocale } from "@/i18n/client";
import { usePreferences } from "@/context/PreferencesProvider";
import { useApp } from "@/context/AppContext";
import Skeleton from "@/components/ui/Skeleton";
import { useSaver } from "./SettingsContext";
import { Choice, FieldRow, SettingsCard, ToggleRow } from "./ui";

/**
 * Preferences: interface language + appearance (display) · assistant
 * suggestions (account). No sound switch: the app plays no sounds, so a
 * "Sound effects" setting would control nothing.
 */
export default function PreferencesSection() {
  const t = useT("settings");
  const tc = useT("common");
  const { locale } = useLocale();
  const { aiSuggestions, setAiSuggestions, setLanguage, loading } = usePreferences();
  const { theme, setTheme, hydrated } = useApp();
  const tipsSaver = useSaver(1800);

  // The provider saves locally at once and syncs to the account in the background.
  const toggle = (saver, setter) => (v) => saver.run(async () => setter(v));

  return (
    <div className="space-y-5 sm:space-y-6">
      <SettingsCard icon={Palette} title={t("preferences.display.title")} desc={t("preferences.display.desc")}>
        <FieldRow label={t("preferences.language.title")} desc={<p>{t("preferences.language.desc")}</p>}>
          <Choice
            label={t("preferences.language.title")}
            value={locale}
            onChange={setLanguage}
            options={[
              { value: "ar", label: tc("languages.ar"), lang: "ar" },
              { value: "en", label: tc("languages.en"), lang: "en" },
            ]}
          />
        </FieldRow>
        <FieldRow label={t("preferences.theme.title")} desc={<p>{t("preferences.theme.desc")}</p>}>
          {hydrated ? (
            <Choice
              label={t("preferences.theme.title")}
              value={theme}
              onChange={setTheme}
              options={[
                { value: "light", label: t("preferences.theme.light"), icon: Sun },
                { value: "dark", label: t("preferences.theme.dark"), icon: Moon },
              ]}
            />
          ) : (
            <Skeleton rounded="full" className="h-12 w-64" />
          )}
        </FieldRow>
      </SettingsCard>

      <SettingsCard icon={Sparkles} title={t("preferences.experience.title")} desc={t("preferences.experience.desc")}>
        <ToggleRow
          title={t("preferences.suggestions.title")}
          desc={t("preferences.suggestions.desc")}
          checked={Boolean(aiSuggestions)}
          disabled={loading}
          onChange={toggle(tipsSaver, setAiSuggestions)}
          saver={tipsSaver}
        />
      </SettingsCard>
    </div>
  );
}
