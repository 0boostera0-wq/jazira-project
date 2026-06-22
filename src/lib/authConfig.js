// Central place to know whether real Clerk auth is configured.
// If no publishable key is present we fall back to a guest/demo mode so the
// whole platform still runs out-of-the-box for local development.

export const clerkPublishableKey =
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || "";

export const isClerkEnabled =
  clerkPublishableKey.startsWith("pk_test_") ||
  clerkPublishableKey.startsWith("pk_live_");
