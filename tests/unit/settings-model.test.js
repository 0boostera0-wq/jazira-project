import { describe, it, expect } from "vitest";
import {
  SECTION_IDS, sectionFrom, cooldownMs, cooldownLeft, cooldownEndsAt, splitDuration, DAY_MS, HOUR_MS, MINUTE_MS,
  errorCode, settingsError, deleteErrorCode, phraseMatches, signInMethods, deviceInfo, sortSessions,
  isRecentlyActive, effectiveNotificationPrefs, PROFILE_FLAG_COLUMNS, AVATAR_TYPES,
} from "@/components/settings/model";
import { parseDevice } from "@/lib/device";

const NOW = Date.UTC(2026, 8, 25, 12, 0, 0);

describe("sections", () => {
  it("accepts known ids only", () => {
    expect(sectionFrom("privacy")).toBe("privacy");
    expect(sectionFrom(["danger", "x"])).toBe("danger");
    expect(sectionFrom("admin")).toBeNull();
    expect(sectionFrom(undefined)).toBeNull();
  });
  it("lists every section once", () => expect(new Set(SECTION_IDS).size).toBe(SECTION_IDS.length));
});

describe("cooldowns (mirror the RPCs)", () => {
  it("name: 14 days free, 24 h Elite", () => {
    expect(cooldownMs("name", false)).toBe(14 * DAY_MS);
    expect(cooldownMs("name", true)).toBe(DAY_MS);
  });
  it("avatar: 10 days free, none for Elite", () => {
    expect(cooldownMs("avatar", false)).toBe(10 * DAY_MS);
    expect(cooldownMs("avatar", true)).toBe(0);
  });
  it("phone: 24 h for everyone", () => {
    expect(cooldownMs("phone", false)).toBe(DAY_MS);
    expect(cooldownMs("phone", true)).toBe(DAY_MS);
  });
  it("time left from the last change", () => {
    const changed = new Date(NOW - 3 * DAY_MS).toISOString();
    expect(cooldownLeft("name", changed, false, NOW)).toBe(11 * DAY_MS);
    expect(cooldownLeft("name", changed, true, NOW)).toBe(0);
    expect(cooldownLeft("avatar", changed, true, NOW)).toBe(0);
    expect(cooldownLeft("phone", null, false, NOW)).toBe(0);
    expect(cooldownLeft("phone", "garbage", false, NOW)).toBe(0);
    expect(cooldownEndsAt("name", changed, false, NOW)).toBe(NOW + 11 * DAY_MS);
    expect(cooldownEndsAt("name", changed, true, NOW)).toBeNull();
  });
  it("splits durations coarsely and never shows zero minutes", () => {
    expect(splitDuration(2 * DAY_MS + 5 * HOUR_MS + 30 * MINUTE_MS)).toEqual({ days: 2, hours: 5, minutes: 0 });
    expect(splitDuration(3 * HOUR_MS + 1)).toEqual({ days: 0, hours: 3, minutes: 1 });
    expect(splitDuration(20 * 1000)).toEqual({ days: 0, hours: 0, minutes: 1 });
    expect(splitDuration(0)).toEqual({ days: 0, hours: 0, minutes: 0 });
  });
});

describe("error mapping", () => {
  it("maps RPC exception codes", () => {
    expect(errorCode({ code: "P0001", message: "name_cooldown" })).toBe("nameCooldown");
    expect(errorCode({ code: "P0001", message: "invalid_name_format" })).toBe("invalidName");
    expect(errorCode({ message: "phone_cooldown" })).toBe("phoneCooldown");
    expect(errorCode({ message: "invalid_phone" })).toBe("invalidPhone");
    expect(errorCode({ message: "bio_too_long" })).toBe("bioTooLong");
    expect(errorCode({ message: "avatar_cooldown" })).toBe("avatarCooldown");
    expect(errorCode({ message: "invalid_avatar_url" })).toBe("avatarInvalid");
    expect(errorCode({ message: "not_authenticated" })).toBe("sessionExpired");
  });
  it("maps missing RPCs / tables to unavailable", () => {
    for (const code of ["PGRST202", "PGRST205", "42P01", "42883"]) expect(errorCode({ code, message: "x" })).toBe("unavailable");
    expect(errorCode({ message: "Could not find the function public.update_bio in the schema cache" })).toBe("unavailable");
  });
  it("maps privilege, network and unknown errors", () => {
    expect(errorCode({ code: "42501", message: "profiles.bio is not client-writable" })).toBe("forbidden");
    expect(errorCode(new TypeError("Failed to fetch"))).toBe("network");
    expect(errorCode({ message: "boom" })).toBe("generic");
    expect(errorCode(null)).toBe("generic");
  });
  it("keeps codes of settings errors", () => expect(errorCode(settingsError("avatarSize"))).toBe("avatarSize"));
});

describe("account deletion responses", () => {
  it("501 not_configured is reported honestly", () => expect(deleteErrorCode(501, { error: "not_configured" })).toBe("notConfigured"));
  it("503 means Supabase itself is missing", () => expect(deleteErrorCode(503, { error: "not_configured" })).toBe("unavailable"));
  it("401 needs a new sign-in", () => expect(deleteErrorCode(401, { error: "unauthorized" })).toBe("unauthorized"));
  it("anything else failed", () => {
    expect(deleteErrorCode(500, { error: "delete_failed" })).toBe("failed");
    expect(deleteErrorCode(502, null)).toBe("failed");
  });
  it("typed phrase ignores case, spacing and direction marks", () => {
    expect(phraseMatches("  Delete   MY account ", "delete my account")).toBe(true);
    expect(phraseMatches("\u200fاحذف حسابي", "احذف حسابي")).toBe(true);
    expect(phraseMatches("احذف", "احذف حسابي")).toBe(false);
    expect(phraseMatches("", "")).toBe(false);
  });
});

describe("sign-in methods", () => {
  it("email users can change their password", () => {
    expect(signInMethods({ identities: [{ provider: "email" }], app_metadata: { provider: "email" } })).toMatchObject({ email: true, google: false, canChangePassword: true });
  });
  it("Google-only users cannot", () => {
    expect(signInMethods({ identities: [{ provider: "google" }], app_metadata: { provider: "google", providers: ["google"] } })).toMatchObject({ email: false, google: true, canChangePassword: false });
  });
  it("both linked", () => {
    expect(signInMethods({ identities: [{ provider: "google" }, { provider: "email" }] })).toMatchObject({ email: true, google: true });
  });
  it("no identity info keeps the password form available", () => {
    expect(signInMethods({}).canChangePassword).toBe(true);
    expect(signInMethods(null).canChangePassword).toBe(true);
  });
  it("reports other providers", () => expect(signInMethods({ identities: [{ provider: "apple" }] }).others).toEqual(["apple"]));
});

describe("sessions", () => {
  it("normalizes the labels lib/device.js stores", () => {
    const iphone = parseDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1");
    expect(deviceInfo({ os: iphone.os, browser: iphone.browser, device_type: iphone.deviceType })).toEqual({ type: "mobile", os: "iOS", browser: "Safari", location: null });
    const unknown = parseDevice("curl/8");
    expect(deviceInfo({ os: unknown.os, browser: unknown.browser, device_type: unknown.deviceType, location: " Riyadh, SA " })).toEqual({ type: "desktop", os: null, browser: null, location: "Riyadh, SA" });
    expect(deviceInfo({ device_type: "جهاز لوحي" }).type).toBe("tablet");
    expect(deviceInfo({}).type).toBe("unknown");
  });
  it("puts the current device first, then most recent", () => {
    const rows = [
      { session_id: "a", last_active_at: new Date(NOW - 3 * HOUR_MS).toISOString() },
      { session_id: "b", last_active_at: new Date(NOW - 1 * HOUR_MS).toISOString() },
      { session_id: "me", last_active_at: new Date(NOW - 9 * HOUR_MS).toISOString() },
    ];
    expect(sortSessions(rows, "me").map((r) => r.session_id)).toEqual(["me", "b", "a"]);
  });
  it("recent activity window", () => {
    expect(isRecentlyActive(new Date(NOW - 2 * MINUTE_MS).toISOString(), NOW)).toBe(true);
    expect(isRecentlyActive(new Date(NOW - 20 * MINUTE_MS).toISOString(), NOW)).toBe(false);
    expect(isRecentlyActive(null, NOW)).toBe(false);
  });
});

describe("guards", () => {
  it("only the two client-writable profile flags", () => expect(PROFILE_FLAG_COLUMNS).toEqual(["show_elite_badge", "anonymous_community"]));
  it("never accepts SVG avatars", () => expect(AVATAR_TYPES).not.toContain("image/svg+xml"));
  it("mentions are on only when both database switches are on", () => {
    expect(effectiveNotificationPrefs({ mentions: true, likes: true }, { notify_mentions: false })).toEqual({ mentions: false, likes: true });
    expect(effectiveNotificationPrefs({ mentions: true }, { notify_mentions: true }).mentions).toBe(true);
    expect(effectiveNotificationPrefs({ mentions: false }, null).mentions).toBe(false);
  });
});
