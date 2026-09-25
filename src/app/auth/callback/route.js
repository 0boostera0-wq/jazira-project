import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { safeNextPath } from "@/i18n/config";

export const dynamic = "force-dynamic";

// OAuth (Google) + e-mail link (confirm sign-up, password recovery) callback.
// Exchanges the PKCE `?code=` for a session and sets the auth cookies
// server-side, then forwards to `next` — which must be a same-site path
// (safeNextPath blocks open redirects such as `next=@evil.com` or `//evil.com`).
export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"), "/dashboard");
  const failure = next.startsWith("/en") ? "/en/sign-in?error=auth" : "/sign-in?error=auth";

  const supabase = await createClient();
  if (code && supabase) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, origin));
  }
  return NextResponse.redirect(new URL(failure, origin));
}
