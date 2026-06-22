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
    setHydrated(true);
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

  // Simulate a successful referral (in production a webhook would call this).
  const addReferral = useCallback(() => {
    setReferrals((prev) => {
      const next = Math.min(prev + 1, REFERRAL_TARGET);
      persist(STORAGE.referrals, next);
      return next;
    });
  }, []);

  const resetReferrals = useCallback(() => {
    setReferrals(0);
    persist(STORAGE.referrals, 0);
  }, []);

  // Premium access: subscribed OR reached the referral target.
  const hasPremiumAccess = isElite || referrals >= REFERRAL_TARGET;

  const value = {
    hydrated,
    isElite,
    hasPremiumAccess,
    xp,
    freeTrialUsed,
    referrals,
    referralTarget: REFERRAL_TARGET,
    referralCode,
    subscribeElite,
    cancelElite,
    addXp,
    markFreeTrialUsed,
    addReferral,
    resetReferrals,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within <AppProvider>");
  return ctx;
}
