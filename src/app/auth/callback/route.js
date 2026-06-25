import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// OAuth (Google) + magic-link callback.
// Exchanges the `?code=` for a session and sets the auth cookies SERVER-SIDE,
// so middleware and SSR see the logged-in user immediately on the next request
// — no client-side refresh needed.
export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") || "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // No code or exchange failed — send to sign-in with a friendly hint.
  return NextResponse.redirect(`${origin}/sign-in?error=auth`);
}
