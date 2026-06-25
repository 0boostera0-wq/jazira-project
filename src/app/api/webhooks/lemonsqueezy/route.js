import crypto from "crypto";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Verified payment webhook — the ONLY place Elite is activated/deactivated.
// Elite is never set from the browser. Configure these server env vars to enable:
//   LEMONSQUEEZY_WEBHOOK_SECRET, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL
export async function POST(req) {
  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secret || !url || !serviceKey) {
    console.error("[webhook] Missing env: LEMONSQUEEZY_WEBHOOK_SECRET / SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL");
    return Response.json({ error: "not_configured" }, { status: 501 });
  }

  // 1) Verify HMAC signature over the raw body.
  const raw = await req.text();
  const signature = req.headers.get("x-signature") || "";
  const digest = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const ok =
    signature.length === digest.length &&
    crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
  if (!ok) {
    return Response.json({ error: "invalid_signature" }, { status: 401 });
  }

  let event;
  try { event = JSON.parse(raw); } catch {
    return Response.json({ error: "bad_payload" }, { status: 400 });
  }

  const admin = createAdminClient(url, serviceKey, { auth: { persistSession: false } });

  const eventName = event?.meta?.event_name || "";
  const eventId = event?.meta?.webhook_id || event?.data?.id || crypto.randomUUID();
  // The app passes the Supabase user id as custom data at checkout.
  const userId =
    event?.meta?.custom_data?.user_id ||
    event?.data?.attributes?.custom_data?.user_id ||
    null;

  // 2) Idempotency — ignore replays.
  try {
    const { error: dupe } = await admin.from("payment_events").insert({
      provider: "lemonsqueezy", event_id: String(eventId), event_type: eventName, raw: event,
    });
    if (dupe && /duplicate|unique/i.test(dupe.message || "")) {
      return Response.json({ ok: true, duplicate: true });
    }
  } catch (e) {
    console.error("[webhook] payment_events insert", e?.message || e);
  }

  if (!userId) {
    console.error("[webhook] missing custom_data.user_id");
    return Response.json({ ok: true, note: "no user mapping" });
  }

  const status = event?.data?.attributes?.status || "";
  const active = ["active", "on_trial", "paid"].includes(status) ||
    ["subscription_created", "subscription_payment_success", "order_created"].includes(eventName);
  const ended = ["expired", "cancelled", "unpaid"].includes(status) ||
    ["subscription_expired", "subscription_cancelled"].includes(eventName);

  const isElite = active && !ended;

  // 3) Persist the source-of-truth subscription + the public Elite flag.
  try {
    await admin.from("subscriptions").upsert({
      user_id: userId,
      tier: isElite ? "elite" : "free",
      status: isElite ? "active" : "inactive",
      provider: "lemonsqueezy",
      provider_subscription_id: event?.data?.id ? String(event.data.id) : null,
      current_period_end: event?.data?.attributes?.renews_at || event?.data?.attributes?.ends_at || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

    await admin.from("profiles").update({ is_elite: isElite }).eq("id", userId);
  } catch (e) {
    console.error("[webhook] persist failed", e?.message || e);
    return Response.json({ error: "persist_failed" }, { status: 500 });
  }

  return Response.json({ ok: true });
}
