"use client";

import { AuthProvider } from "@/context/AuthProvider";
import { AppProvider } from "@/context/AppContext";
import { PreferencesProvider } from "@/context/PreferencesProvider";
import MotionProvider from "@/components/motion/MotionProvider";
import ReferralCapture from "@/components/ReferralCapture";
import RouteProgress from "./RouteProgress";

// App-wide client providers. Order matters: Preferences reads Auth; App reads Auth.
// MotionProvider remains only while legacy components still use framer-motion.
export default function Providers({ children }) {
  return (
    <AuthProvider>
      <AppProvider>
        <PreferencesProvider>
          <MotionProvider>
            <RouteProgress />
            <ReferralCapture />
            {children}
          </MotionProvider>
        </PreferencesProvider>
      </AppProvider>
    </AuthProvider>
  );
}
