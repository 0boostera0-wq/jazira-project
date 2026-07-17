"use client";

import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { getSupabase } from "@/lib/supabase-lazy";
import { useAuthUser } from "@/context/AuthProvider";
import { setSoundEnabled } from "@/lib/sound";

// Per-account preferences: sound, language (ar/en), ai_suggestions.
// - Hydrates instantly from localStorage (no flash), then reconciles with
//   Supabase user_preferences when signed in (cross-device).
// - Applies document lang/dir immediately (Arabic = RTL, English = LTR).
const LS_KEY = "jazira_user_prefs_v1";
const DEFAULTS = { sound: true, language: "ar", aiSuggestions: true };

const PreferencesContext = createContext(null);

function readLS() {
  if (typeof window === "undefined") return DEFAULTS;
  try { return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(LS_KEY)) || {}) }; }
  catch { return DEFAULTS; }
}

export function PreferencesProvider({ children }) {
  const { userId, isSignedIn } = useAuthUser();
  const [prefs, setPrefs] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const loadedFor = useRef(null);

  // 1) Instant hydrate from localStorage
  useEffect(() => { setPrefs(readLS()); setLoading(false); }, []);

  // 2) Apply language → document lang/dir whenever it changes
  useEffect(() => {
    if (typeof document === "undefined") return;
    const isRTL = prefs.language !== "en";
    document.documentElement.lang = prefs.language;
    document.documentElement.dir = isRTL ? "rtl" : "ltr";
  }, [prefs.language]);

  // Sync the global sound gate so disabling sound silences the whole site.
  useEffect(() => { setSoundEnabled(prefs.sound); }, [prefs.sound]);

  const persistLS = (next) => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch {}
  };

  // 3) Reconcile with Supabase when signed in
  useEffect(() => {
    if (!isSignedIn || !userId || loadedFor.current === userId) return;
    loadedFor.current = userId;
    (async () => {
      try {
        const supabase = await getSupabase();
        const { data } = await supabase
          .from("user_preferences")
          .select("sound, language, ai_suggestions")
          .eq("user_id", userId)
          .single();
        if (data) {
          const next = {
            sound: data.sound ?? true,
            language: data.language || "ar",
            aiSuggestions: data.ai_suggestions ?? true,
          };
          setPrefs(next);
          persistLS(next);
        }
      } catch { /* table may not exist yet — keep local */ }
    })();
  }, [isSignedIn, userId]);

  // NOTE: the Supabase write must NOT live inside a setState updater — React can
  // invoke updaters twice (StrictMode) which would double-fire the request.
  const update = useCallback(async (patch) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    persistLS(next);
    if (!userId) return;
    // best-effort Supabase upsert (per-account, cross-device)
    try {
      const supabase = await getSupabase();
      await supabase.from("user_preferences").upsert({
        user_id: userId,
        sound: next.sound,
        language: next.language,
        ai_suggestions: next.aiSuggestions,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
    } catch { /* table may not exist yet — local prefs still applied */ }
  }, [prefs, userId]);

  const value = {
    ...prefs,
    isRTL: prefs.language !== "en",
    loading,
    setSound: (v) => update({ sound: v }),
    setLanguage: (v) => update({ language: v === "en" ? "en" : "ar" }),
    setAiSuggestions: (v) => update({ aiSuggestions: v }),
    // tiny inline translator for in-scope screens
    t: (ar, en) => (prefs.language === "en" ? en : ar),
  };

  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error("usePreferences must be used within <PreferencesProvider>");
  return ctx;
}
