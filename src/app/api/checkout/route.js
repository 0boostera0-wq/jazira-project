import { createClient } from "@/lib/supabase-server";
import { DEFAULT_LOCALE, isLocale, localizeHref } from "@/i18n/config";
import { isSameOrigin } from "@/lib/http-guards";
import { isRateLimited } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Creates a Lemon Squeezy hosted checkout for the signed-in user.
//
//   POST /api/checkout   body: { locale?: "ar" | "en" }
//
//   200 { configured: true, url }      → send the browser to `url`
//   200 { configured: false }          → payments not set up (env missing) — truthful "coming soon"
//   401 { error: "unauthorized" }      · 403 { error: "forbidden" } (cross-site)
//   409 { error: "already_elite" }     · 429 { error: "rate_limited" }
//   502 { error: "provider_error" }    · 503 { error: "not_configured" } (Supabase missing)
//
// The Supabase user id travels as checkout custom data so the verified webhook
// (src/app/api/webhooks/lemonsqueezy) can map the payment back — that webhook
// is the ONLY place Elite is granted. This route never marks anything as paid.
// After payment the provider redirects to the localized /checkout/success page
// on the SAME origin the request came from (never a client-supplied URL).

const NO_STORE = { "Cache-Control": "no-store" };
const reply = (body, status = 200) => Response.json(body, { status, headers: NO_STORE });

// Each call hits the provider's API: 6 per minute per member, shared by
// every server instance (public.rate_limit_hit; per-instance memory only as
// a fallback). Same-origin guard: src/lib/http-guards.js.
const LIMIT = { max: 6, windowSeconds: 60 };

export async function POST(req) {
  if (!isSameOrigin(req)) return reply({ error: "forbidden" }, 403);

  const supabase = await createClient();
  if (!supabase) return reply({ error: "not_configured" }, 503);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return reply({ error: "unauthorized" }, 401);

  const apiKey = process.env.LEMONSQUEEZY_API_KEY;
  const storeId = process.env.LEMONSQUEEZY_STORE_ID;
  const variantId = process.env.LEMONSQUEEZY_VARIANT_ID;
  if (!apiKey || !storeId || !variantId) return reply({ configured: false });

  // Don't sell a second subscription to an active member (DB-verified flag).
  try {
    const { data: profile } = await supabase.from("profiles").select("is_elite").eq("id", user.id).maybeSingle();
    if (profile?.is_elite) return reply({ error: "already_elite" }, 409);
  } catch {
    /* profile read failed — let the checkout proceed */
  }

  if (await isRateLimited({ bucket: "checkout", key: user.id, ...LIMIT })) return reply({ error: "rate_limited" }, 429);

  // Locale only selects which localized page to return to; validated against LOCALES.
  const body = await req.json().catch(() => ({}));
  const locale = isLocale(body?.locale) ? body.locale : DEFAULT_LOCALE;
  const redirectUrl = new URL(localizeHref("/checkout/success", locale), new URL(req.url).origin).toString();

  try {
    const res = await fetch("https://api.lemonsqueezy.com/v1/checkouts", {
      method: "POST",
      headers: {
        "Content-Type": "application/vnd.api+json",
        Accept: "application/vnd.api+json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        data: {
          type: "checkouts",
          attributes: {
            checkout_data: { custom: { user_id: user.id } },
            product_options: { redirect_url: redirectUrl },
          },
          relationships: {
            store: { data: { type: "stores", id: String(storeId) } },
            variant: { data: { type: "variants", id: String(variantId) } },
          },
        },
      }),
    });
    const json = await res.json().catch(() => null);
    const url = json?.data?.attributes?.url;
    if (!res.ok || typeof url !== "string" || !url.startsWith("https://")) {
      console.error("[checkout] provider error", res.status, json?.errors?.[0]?.detail || "no checkout url");
      return reply({ error: "provider_error" }, 502);
    }
    return reply({ configured: true, url });
  } catch (e) {
    console.error("[checkout] request failed", e?.message || e);
    return reply({ error: "provider_error" }, 502);
  }
}
