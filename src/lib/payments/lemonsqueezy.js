// ============================================================================
// Lemon Squeezy webhook logic (server only; pure + node:crypto, unit-tested in
// tests/unit/payments.test.js). The route handler is
// src/app/api/webhooks/lemonsqueezy/route.js; the state change itself is the
// service-role RPC public.apply_payment_event() (migration 0013).
//
// What decides Elite (docs: https://docs.lemonsqueezy.com/help/webhooks):
//   subscriptions  status active | on_trial | past_due (payment retries run) → Elite
//                  cancelled → Elite until ends_at (the paid period), then not
//                  paused | unpaid | expired → not Elite
//   orders         paid → Elite (one-time purchase of the Elite variant);
//                  refunded → not Elite; pending / failed → record only
//   anything else (invoices, license keys…) → recorded, no entitlement change
// Only events for OUR store and the Elite variant can change anything, test
// mode events are ignored in production, and an event older than what was
// already applied is ignored (ordering is by the object's updated_at).
// ============================================================================
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const PROVIDER = "lemonsqueezy";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIGNATURE_RE = /^[0-9a-f]{64}$/i;

/** HMAC-SHA256 (hex) of the raw body, compared in constant time. Never throws. */
export function verifySignature(raw, signature, secret) {
  if (typeof raw !== "string" || typeof signature !== "string" || !secret || !SIGNATURE_RE.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(raw, "utf8").digest();
  const given = Buffer.from(signature, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Idempotency key of ONE delivery: a hash of the signed body. Retries of a
 * delivery repeat the same body; two lifecycle events of one subscription
 * never do (event name / updated_at differ). meta.webhook_id is NOT used:
 * it identifies the webhook endpoint, not the delivery.
 */
export const eventKey = (raw) => `sha256:${createHash("sha256").update(String(raw), "utf8").digest("hex")}`;

const iso = (v) => {
  if (typeof v !== "string" || !v) return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
};
const sameId = (a, b) => a !== undefined && a !== null && b !== undefined && b !== null && String(a) === String(b);

/** Is this deployment production (test-mode events are ignored there)? */
export function isProductionEnv(env = process.env) {
  if (env.VERCEL_ENV) return env.VERCEL_ENV === "production";
  return env.NODE_ENV === "production";
}

/**
 * What an event means for the member's entitlement.
 * @param {object} event   parsed webhook payload
 * @param {{ storeId: string, variantId: string, allowTestMode?: boolean, now?: number }} cfg
 * @returns {{ userId: string|null, entitled: boolean|null, subscriptionId: string|null,
 *             providerStatus: string|null, periodEnd: string|null, eventAt: string|null,
 *             eventName: string, reason: string }}
 *   entitled null = record the event only (reason says why)
 */
export function decideEntitlement(event, { storeId, variantId, allowTestMode = false, now = Date.now() } = {}) {
  const meta = event?.meta || {};
  const data = event?.data || {};
  const attrs = data.attributes || {};
  const eventName = typeof meta.event_name === "string" ? meta.event_name.slice(0, 100) : "";
  const rawUser = meta.custom_data?.user_id ?? attrs.custom_data?.user_id ?? null;
  const userId = typeof rawUser === "string" && UUID_RE.test(rawUser) ? rawUser.toLowerCase() : null;
  const out = {
    userId,
    entitled: null,
    subscriptionId: null,
    providerStatus: typeof attrs.status === "string" ? attrs.status.slice(0, 40) : null,
    periodEnd: null,
    eventAt: iso(attrs.updated_at) || iso(attrs.created_at),
    eventName,
    reason: "",
  };
  const skip = (reason) => ({ ...out, entitled: null, reason });

  if (!userId) return skip("no_user");
  const testMode = meta.test_mode === true || attrs.test_mode === true;
  if (testMode && !allowTestMode) return skip("test_mode");
  if (!storeId || !variantId) return skip("not_configured");
  if (!sameId(attrs.store_id, storeId)) return skip("other_store");

  if (data.type === "subscriptions") {
    if (!sameId(attrs.variant_id, variantId)) return skip("other_variant");
    const status = out.providerStatus;
    const endsAt = iso(attrs.ends_at);
    out.subscriptionId = data.id !== undefined && data.id !== null ? String(data.id) : null;
    if (status === "active" || status === "on_trial" || status === "past_due") {
      return { ...out, entitled: true, periodEnd: iso(attrs.renews_at) || endsAt, reason: status };
    }
    if (status === "cancelled") {
      const inGrace = Boolean(endsAt) && Date.parse(endsAt) > now;
      return { ...out, entitled: inGrace, periodEnd: endsAt, reason: inGrace ? "cancelled_grace" : "cancelled_ended" };
    }
    if (status === "paused" || status === "unpaid" || status === "expired") {
      return { ...out, entitled: false, periodEnd: endsAt, reason: status };
    }
    return skip("unknown_status");
  }

  if (data.type === "orders") {
    const item = attrs.first_order_item || {};
    if (!sameId(item.variant_id, variantId)) return skip("other_variant");
    if (attrs.status === "refunded" || attrs.refunded === true || eventName === "order_refunded") {
      return { ...out, entitled: false, reason: "order_refunded" };
    }
    if (attrs.status === "paid") return { ...out, entitled: true, reason: "order_paid" };
    return skip("order_not_paid");
  }

  // subscription invoices, license keys, affiliates… → no entitlement change
  // (every status change also arrives as a subscription_* event).
  return skip("not_entitling");
}
