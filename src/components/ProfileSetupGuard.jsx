"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "@/i18n/navigation";
import { useAuthUser } from "@/context/AuthProvider";
import { withNext } from "@/components/auth/authUtils";

// Silently redirects newly-signed-in users (Google OAuth etc.) to profile setup
// when their display_name is not yet set in the profiles table — carrying the
// page they were heading to as ?next= so setup returns them there (auth pages
// and unsafe targets are filtered by resolveNext() on the setup page).
export default function ProfileSetupGuard() {
  const { isLoaded, isSignedIn, needsProfileSetup } = useAuthUser();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    if (needsProfileSetup && pathname !== "/profile-setup") {
      const search = typeof window !== "undefined" ? window.location.search : "";
      router.replace(withNext("/profile-setup", `${pathname}${search}`));
    }
  }, [isLoaded, isSignedIn, needsProfileSetup, pathname, router]);

  return null;
}
