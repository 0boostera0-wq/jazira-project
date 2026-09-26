"use client";

import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useRouter as useNextRouter } from "next/navigation";
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
// `setLanguage` remembers the choice (cookie + user_preferences + the auth
// user's metadata, which the auth e-mail templates read as {{ .Data.locale }})
// and navigates to the same page in the other locale.
//
// PERF: the context value is memoised and the provider does not subscribe to
// the pathname, so navigating never re-renders every consumer.
const LS_KEY = "jazira_user_prefs_v1";
const DEFAULTS = { sound: true, aiSuggestions: true };

const PreferencesContext = createContext(null);

function readLS() {
  if (typeof window === "undefined") return DEFAULTS;
  try { return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(LS_KEY)) || {}) }; }
  catch { return DEFAULTS; }
}

function persistLS(next) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch {}
}

export function PreferencesProvider({ children }) {
  const { userId, isSignedIn } = useAuthUser();
  const { locale, isRTL } = useLocale();
  const router = useNextRouter();
  const [prefs, setPrefs] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const loadedFor = useRef(null);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

  useEffect(() => { setPrefs(readLS()); setLoading(false); }, []);
  useEffect(() => { setSoundEnabled(prefs.sound); }, [prefs.sound]);

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
    const next = { ...prefsRef.current, ...patch };
    setPrefs(next);
    persistLS(next);
    saveRemote({ sound: next.sound, ai_suggestions: next.aiSuggestions, language: locale });
  }, [saveRemote, locale]);

  const setSound = useCallback((v) => update({ sound: v }), [update]);
  const setAiSuggestions = useCallback((v) => update({ aiSuggestions: v }), [update]);

  const setLanguage = useCallback((target) => {
    const lang = target === "en" ? "en" : "ar";
    if (lang === locale) return;
    rememberLocale(lang);
    const p = prefsRef.current;
    saveRemote({ language: lang, sound: p.sound, ai_suggestions: p.aiSuggestions });
    if (userId) {
      // Auth e-mails (confirmation, password reset…) are written in this language.
      getSupabase()
        .then((supabase) => supabase?.auth.updateUser({ data: { locale: lang } }))
        .catch(() => {});
    }
    // Read the URL at call time instead of subscribing to every navigation.
    const { path } = splitLocale(window.location.pathname || "/");
    router.replace(localizeHref(path, lang) + window.location.search + window.location.hash, { scroll: false });
  }, [locale, router, saveRemote, userId]);

  const value = useMemo(() => ({
    ...prefs,
    language: locale,
    isRTL,
    loading,
    setSound,
    setLanguage,
    setAiSuggestions,
  }), [prefs, locale, isRTL, loading, setSound, setLanguage, setAiSuggestions]);

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error("usePreferences must be used within <PreferencesProvider>");
  return ctx;
}
