import { createAdminClient } from "@/lib/supabase-admin";
import {
  PROVIDER, decideEntitlement, eventKey, isProductionEnv, verifySignature,
} from "@/lib/payments/lemonsqueezy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Verified payment webhook — the ONLY place Elite is activated/deactivated.
// Elite is never set from the browser. Required server env:
//   LEMONSQUEEZY_WEBHOOK_SECRET, LEMONSQUEEZY_STORE_ID, LEMONSQUEEZY_VARIANT_ID,
//   SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL
// Optional: LEMONSQUEEZY_ALLOW_TEST_EVENTS=true accepts test-mode events in
// production (they are always accepted outside production).
//
//   200 { ok: true, result }  result: applied | duplicate | stale | recorded | unknown_user
//   400 bad_payload · 401 invalid_signature · 413 payload_too_large
//   500 persist_failed (nothing was recorded → the provider's retry is processed)
//   501 not_configured
//
// Idempotency is per delivery (hash of the signed body), and recording the
// event + changing the subscription + the Elite flag happen in ONE database
// transaction (public.apply_payment_event), so an event is never marked
// processed unless its state change was saved.
const MAX_BODY_BYTES = 256 * 1024;
const reply = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req) {
  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
  const storeId = process.env.LEMONSQUEEZY_STORE_ID;
  const variantId = process.env.LEMONSQUEEZY_VARIANT_ID;
  const admin = createAdminClient();
  if (!secret || !storeId || !variantId || !admin) {
    console.error("[webhook] Missing env: LEMONSQUEEZY_WEBHOOK_SECRET / LEMONSQUEEZY_STORE_ID / LEMONSQUEEZY_VARIANT_ID / SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL");
    return reply({ error: "not_configured" }, 501);
  }

  // 1) Bounded raw body, then the HMAC over exactly those bytes.
  if (Number(req.headers.get("content-length") || 0) > MAX_BODY_BYTES) return reply({ error: "payload_too_large" }, 413);
  let raw;
  try {
    raw = await req.text();
  } catch {
    return reply({ error: "bad_payload" }, 400);
  }
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) return reply({ error: "payload_too_large" }, 413);
  if (!verifySignature(raw, req.headers.get("x-signature") || "", secret)) {
    return reply({ error: "invalid_signature" }, 401);
  }

  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return reply({ error: "bad_payload" }, 400);
  }
  if (!event || typeof event !== "object") return reply({ error: "bad_payload" }, 400);

  // 2) What the event means (store / variant / test mode / status checks).
  const allowTestMode = !isProductionEnv() || process.env.LEMONSQUEEZY_ALLOW_TEST_EVENTS === "true";
  const d = decideEntitlement(event, { storeId, variantId, allowTestMode });

  // 3) Record + apply atomically.
  let data;
  let error;
  try {
    ({ data, error } = await admin.rpc("apply_payment_event", {
      p_provider: PROVIDER,
      p_event_id: eventKey(raw),
      p_event_type: d.eventName || null,
      p_raw: event,
      p_user: d.entitled === null ? null : d.userId,
      p_entitled: d.entitled,
      p_subscription_id: d.subscriptionId,
      p_provider_status: d.providerStatus,
      p_period_end: d.periodEnd,
      p_event_at: d.eventAt,
    }));
  } catch (e) {
    error = { message: String(e?.message || e) };
  }
  if (error) {
    console.error("[webhook] persist failed:", error.code || "", String(error.message || "").slice(0, 200));
    return reply({ error: "persist_failed" }, 500);
  }
  if (d.entitled === null && d.reason !== "not_entitling") {
    console.warn(`[webhook] ${d.eventName || "event"} recorded without an entitlement change: ${d.reason}`);
  }
  if (data === "unknown_user") console.error("[webhook] custom_data.user_id does not match an account");
  return reply({ ok: true, result: data });
}
