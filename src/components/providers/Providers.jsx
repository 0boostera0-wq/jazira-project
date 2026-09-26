"use client";

import { AuthProvider } from "@/context/AuthProvider";
import { AppProvider } from "@/context/AppContext";
import { PreferencesProvider } from "@/context/PreferencesProvider";
import ReferralCapture from "@/components/ReferralCapture";
import RouteProgress from "./RouteProgress";

// App-wide client providers. Order matters: Preferences reads Auth; App reads Auth.
export default function Providers({ children }) {
  return (
    <AuthProvider>
      <AppProvider>
        <PreferencesProvider>
          <RouteProgress />
          <ReferralCapture />
          {children}
        </PreferencesProvider>
      </AppProvider>
    </AuthProvider>
  );
}
