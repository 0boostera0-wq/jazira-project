import { createClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Creates a Lemon Squeezy checkout for the signed-in user, passing their
// Supabase user id as custom_data so the webhook can map the payment back.
// If checkout env vars are not configured, returns a truthful "coming soon"
// state — it NEVER fakes a successful payment or grants Elite.
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const apiKey = process.env.LEMONSQUEEZY_API_KEY;
  const storeId = process.env.LEMONSQUEEZY_STORE_ID;
  const variantId = process.env.LEMONSQUEEZY_VARIANT_ID;

  if (!apiKey || !storeId || !variantId) {
    return Response.json({ configured: false, message: "سيتم تفعيل الدفع قريبًا" });
  }

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
          attributes: { checkout_data: { custom: { user_id: user.id } } },
          relationships: {
            store: { data: { type: "stores", id: String(storeId) } },
            variant: { data: { type: "variants", id: String(variantId) } },
          },
        },
      }),
    });
    const json = await res.json();
    const url = json?.data?.attributes?.url;
    if (!url) {
      console.error("[checkout] no url in response");
      return Response.json({ configured: false, message: "سيتم تفعيل الدفع قريبًا" });
    }
    return Response.json({ configured: true, url });
  } catch (e) {
    console.error("[checkout]", e?.message || e);
    return Response.json({ configured: false, message: "سيتم تفعيل الدفع قريبًا" });
  }
}
