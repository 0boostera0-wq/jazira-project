"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { STORAGE } from "@/lib/constants";

// Theme (light / dark) for the whole app — the only state this provider owns.
//
// Earlier versions also kept XP, a "free trial" flag, a random referral code
// and a referral counter in localStorage for every visitor, and derived
// "premium access" from them. None of that was real: XP, referrals and Elite
// live in the database (profiles.xp, referrals, has_premium()). Those keys are
// removed from the browser on first load.
const LEGACY_KEYS = [
  "jazira_xp_v1", "jazira_free_trial_used_v1", "jazira_referrals_v1", "jazira_referral_code_v1",
  "jazira_ai_usage_v1", "jazira_subscription_v1",
];

const ThemeContext = createContext(null);

function readTheme() {
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE.theme) || "null") === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function saveTheme(value) {
  try {
    window.localStorage.setItem(STORAGE.theme, JSON.stringify(value));
  } catch {
    /* storage blocked — the choice still applies to this page */
  }
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState("light");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setThemeState(readTheme());
    try {
      for (const key of LEGACY_KEYS) window.localStorage.removeItem(key);
    } catch {
      /* storage blocked */
    }
    setHydrated(true);
  }, []);

  // Keep <html class="dark"> in sync with the theme state.
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const setTheme = useCallback((next) => {
    const value = next === "dark" ? "dark" : "light";
    setThemeState(value);
    saveTheme(value);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      saveTheme(next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ hydrated, theme, isDark: theme === "dark", setTheme, toggleTheme }),
    [hydrated, theme, setTheme, toggleTheme]
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within <ThemeProvider>");
  return ctx;
}

// Names kept for existing imports (Providers.jsx, ThemeToggle, PreferencesSection).
export const AppProvider = ThemeProvider;
export const useApp = useTheme;
