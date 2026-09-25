"use client";

import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { usePathname as useNextPathname, useRouter as useNextRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase-lazy";
import { useAuthUser } from "@/context/AuthProvider";
import { setSoundEnabled } from "@/lib/sound";
import { useLocale } from "@/i18n/client";
import { localizeHref, rememberLocale } from "@/i18n/navigation";
import { splitLocale } from "@/i18n/config";

// Per-account preferences: sound, language, AI suggestions.
//
// LANGUAGE: the URL is the source of truth (/… = Arabic, /en/… = English), so
// server-rendered HTML always has the right lang/dir and there is no flash.
// `setLanguage` remembers the choice (cookie + user_preferences) and navigates
// to the same page in the other locale.
const LS_KEY = "jazira_user_prefs_v1";
const DEFAULTS = { sound: true, aiSuggestions: true };

const PreferencesContext = createContext(null);

function readLS() {
  if (typeof window === "undefined") return DEFAULTS;
  try { return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(LS_KEY)) || {}) }; }
  catch { return DEFAULTS; }
}

export function PreferencesProvider({ children }) {
  const { userId, isSignedIn } = useAuthUser();
  const { locale, isRTL } = useLocale();
  const router = useNextRouter();
  const pathname = useNextPathname();
  const [prefs, setPrefs] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const loadedFor = useRef(null);

  useEffect(() => { setPrefs(readLS()); setLoading(false); }, []);
  useEffect(() => { setSoundEnabled(prefs.sound); }, [prefs.sound]);

  const persistLS = (next) => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch {}
  };

  // Reconcile sound / AI suggestions with Supabase once per signed-in user.
  useEffect(() => {
    if (!isSignedIn || !userId || loadedFor.current === userId) return;
    loadedFor.current = userId;
    (async () => {
      try {
        const supabase = await getSupabase();
        if (!supabase) return;
        const { data } = await supabase
          .from("user_preferences")
          .select("sound, ai_suggestions")
          .eq("user_id", userId)
          .maybeSingle();
        if (data) {
          const next = { sound: data.sound ?? true, aiSuggestions: data.ai_suggestions ?? true };
          setPrefs(next);
          persistLS(next);
        }
      } catch { /* keep local prefs */ }
    })();
  }, [isSignedIn, userId]);

  const saveRemote = useCallback(async (row) => {
    if (!userId) return;
    try {
      const supabase = await getSupabase();
      await supabase?.from("user_preferences").upsert(
        { user_id: userId, ...row, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );
    } catch { /* best effort */ }
  }, [userId]);

  const update = useCallback((patch) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    persistLS(next);
    saveRemote({ sound: next.sound, ai_suggestions: next.aiSuggestions, language: locale });
  }, [prefs, saveRemote, locale]);

  const setLanguage = useCallback((target) => {
    const lang = target === "en" ? "en" : "ar";
    if (lang === locale) return;
    rememberLocale(lang);
    saveRemote({ language: lang, sound: prefs.sound, ai_suggestions: prefs.aiSuggestions });
    const { path } = splitLocale(pathname || "/");
    const search = typeof window !== "undefined" ? window.location.search + window.location.hash : "";
    router.replace(localizeHref(path, lang) + search, { scroll: false });
  }, [locale, pathname, router, saveRemote, prefs.sound, prefs.aiSuggestions]);

  const value = {
    ...prefs,
    language: locale,
    isRTL,
    loading,
    setSound: (v) => update({ sound: v }),
    setLanguage,
    setAiSuggestions: (v) => update({ aiSuggestions: v }),
    // Legacy inline translator kept for not-yet-migrated screens. New code must
    // use message keys via useT() — see docs/CONVENTIONS.md.
    t: (ar, en) => (locale === "en" ? en : ar),
  };

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error("usePreferences must be used within <PreferencesProvider>");
  return ctx;
}
