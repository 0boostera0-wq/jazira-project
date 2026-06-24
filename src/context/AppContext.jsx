"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { STORAGE, REFERRAL_TARGET } from "@/lib/constants";

const AppContext = createContext(null);

function readJSON(key, fallback) {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function makeReferralCode() {
  return "JZR-" + Math.random().toString(36).slice(2, 8).toUpperCase();
}

export function AppProvider({ children }) {
  const [isElite, setIsElite] = useState(false);
  const [xp, setXp] = useState(0);
  const [freeTrialUsed, setFreeTrialUsed] = useState(false);
  const [referrals, setReferrals] = useState(0);
  const [referralCode, setReferralCode] = useState("");
  const [theme, setThemeState] = useState("light");
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage on mount.
  useEffect(() => {
    setIsElite(readJSON(STORAGE.subscription, { isElite: false }).isElite);
    setXp(readJSON(STORAGE.xp, 0));
    setFreeTrialUsed(readJSON(STORAGE.freeTrialUsed, false));
    setReferrals(readJSON(STORAGE.referrals, 0));

    let code = readJSON(STORAGE.referralCode, "");
    if (!code) {
      code = makeReferralCode();
      window.localStorage.setItem(STORAGE.referralCode, JSON.stringify(code));
    }
    setReferralCode(code);

    // Theme: read saved preference (falls back to light)
    const savedTheme = readJSON(STORAGE.theme, "light");
    setThemeState(savedTheme === "dark" ? "dark" : "light");

    setHydrated(true);
  }, []);

  // Keep <html class="dark"> in sync with the theme state.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
  }, [theme]);

  const setTheme = useCallback((next) => {
    const value = next === "dark" ? "dark" : "light";
    setThemeState(value);
    window.localStorage.setItem(STORAGE.theme, JSON.stringify(value));
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      window.localStorage.setItem(STORAGE.theme, JSON.stringify(next));
      return next;
    });
  }, []);

  const persist = (key, value) =>
    window.localStorage.setItem(key, JSON.stringify(value));

  const subscribeElite = useCallback(() => {
    setIsElite(true);
    persist(STORAGE.subscription, { isElite: true, since: Date.now() });
  }, []);

  const cancelElite = useCallback(() => {
    setIsElite(false);
    persist(STORAGE.subscription, { isElite: false });
  }, []);

  const addXp = useCallback((amount) => {
    setXp((prev) => {
      const next = prev + amount;
      persist(STORAGE.xp, next);
      return next;
    });
  }, []);

  const markFreeTrialUsed = useCallback(() => {
    setFreeTrialUsed(true);
    persist(STORAGE.freeTrialUsed, true);
  }, []);

  // Invitations are UNLIMITED — there is no cap on how many friends a user invites.
  const addReferral = useCallback(() => {
    setReferrals((prev) => {
      const next = prev + 1;
      persist(STORAGE.referrals, next);
      return next;
    });
  }, []);

  // Set the count from an authoritative source (Supabase count of successful invites).
  const syncReferrals = useCallback((n) => {
    const next = Math.max(0, Number(n) || 0);
    setReferrals(next);
    persist(STORAGE.referrals, next);
  }, []);

  const resetReferrals = useCallback(() => {
    setReferrals(0);
    persist(STORAGE.referrals, 0);
  }, []);

  // Referral REWARD (limited bonus features) unlocks at REFERRAL_TARGET invites.
  const referralRewardUnlocked = referrals >= REFERRAL_TARGET;

  // Premium access: real subscription OR the referral reward threshold.
  const hasPremiumAccess = isElite || referralRewardUnlocked;

  const value = {
    hydrated,
    isElite,
    hasPremiumAccess,
    xp,
    freeTrialUsed,
    referrals,
    referralTarget: REFERRAL_TARGET,
    referralRewardUnlocked,
    referralCode,
    theme,
    isDark: theme === "dark",
    setTheme,
    toggleTheme,
    subscribeElite,
    cancelElite,
    addXp,
    markFreeTrialUsed,
    addReferral,
    syncReferrals,
    resetReferrals,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within <AppProvider>");
  return ctx;
}
