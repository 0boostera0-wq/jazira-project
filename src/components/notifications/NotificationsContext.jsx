"use client";

import { createContext, useContext } from "react";
import { useAuthUser } from "@/context/AuthProvider";
import {
  getNotificationPreferences, getUnreadCount, listNotifications, markAllNotificationsRead, markNotificationsRead,
} from "@/lib/data/notifications";
import { effectiveNotificationPrefs } from "@/components/settings/model";

// Dependency seam: real auth + src/lib/data/notifications by default. A
// visual-QA harness may wrap the page in <NotificationsOverride auth api>.
// Mentions are gated by two switches in the database; report the effective one.
async function getPreferences(userId) {
  const [prefs, social] = await Promise.all([
    getNotificationPreferences(),
    userId ? import("@/lib/social").then((m) => m.getSocialSettings(userId)).catch(() => null) : null,
  ]);
  return effectiveNotificationPrefs(prefs, social);
}

const REAL_API = { listNotifications, getUnreadCount, markNotificationsRead, markAllNotificationsRead, getNotificationPreferences: getPreferences };
const OverrideContext = createContext(null);

export function NotificationsOverride({ auth, api, children }) {
  return <OverrideContext.Provider value={{ auth, api }}>{children}</OverrideContext.Provider>;
}

export function useNotificationsAuth() {
  const real = useAuthUser();
  const o = useContext(OverrideContext);
  return o?.auth ? { ...real, ...o.auth } : real;
}

export function useNotificationsApi() {
  const o = useContext(OverrideContext);
  return o?.api || REAL_API;
}
