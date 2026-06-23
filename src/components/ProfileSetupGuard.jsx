"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthUser } from "@/context/AuthProvider";

// Silently redirects newly-signed-in users (Google OAuth etc.) to profile setup
// when their display_name is not yet set in the profiles table.
export default function ProfileSetupGuard() {
  const { isLoaded, isSignedIn, needsProfileSetup } = useAuthUser();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    if (needsProfileSetup && pathname !== "/profile-setup") {
      router.replace("/profile-setup");
    }
  }, [isLoaded, isSignedIn, needsProfileSetup, pathname, router]);

  return null;
}
