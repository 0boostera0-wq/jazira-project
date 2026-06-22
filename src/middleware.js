import { NextResponse } from "next/server";
import { clerkMiddleware } from "@clerk/nextjs/server";
import { isClerkEnabled } from "@/lib/authConfig";

// When Clerk keys are configured we run the real Clerk middleware.
// Otherwise (demo mode) we let every request pass through untouched so the
// platform still works out-of-the-box.
const handler = isClerkEnabled ? clerkMiddleware() : () => NextResponse.next();

export default handler;

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
