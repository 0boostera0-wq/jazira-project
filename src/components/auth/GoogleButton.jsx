"use client";

import { useEffect, useState } from "react";
import { useLocale, useT } from "@/i18n/client";
import { localizeHref } from "@/i18n/config";
import { getSupabase } from "@/lib/supabase-lazy";
import Button from "@/components/ui/Button";
import { authErrorKey, DEFAULT_NEXT } from "./authUtils";

// Google "G" mark in its official colours (brand asset, not a theme colour).
function GoogleMark({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.09A6.6 6.6 0 0 1 5.49 12c0-.73.13-1.43.35-2.09V7.07H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.93l3.66-2.84Z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z" />
    </svg>
  );
}

/**
 * "Continue with Google". OAuth returns through /auth/callback, which exchanges
 * the code server-side (cookies) and forwards to the localized `next`.
 * `onError(key | null)` receives an `auth.errors.*` key.
 */
export default function GoogleButton({ next = DEFAULT_NEXT, onError }) {
  const t = useT("auth");
  const { locale } = useLocale();
  const [loading, setLoading] = useState(false);

  // Coming back with the browser's Back button restores this page from the
  // bfcache with the spinner still on — reset it.
  useEffect(() => {
    const onShow = (e) => { if (e.persisted) setLoading(false); };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  const start = async () => {
    onError?.(null);
    setLoading(true);
    try {
      const supabase = await getSupabase();
      if (!supabase) {
        onError?.("notConfigured");
        setLoading(false);
        return;
      }
      const target = localizeHref(next, locale);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(target)}`,
          // Always show Google's account chooser (never silently reuse the last account).
          queryParams: { prompt: "select_account" },
        },
      });
      if (error) throw error;
      // Success: the browser is navigating to Google — keep the spinner.
    } catch (err) {
      onError?.(authErrorKey(err, "oauth"));
      setLoading(false);
    }
  };

  return (
    <Button variant="secondary" size="lg" block loading={loading} iconStart={GoogleMark} onClick={start}>
      {loading ? t("google.loading") : t("google.label")}
    </Button>
  );
}
