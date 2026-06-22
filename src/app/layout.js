import { Tajawal } from "next/font/google";
import { AppProvider } from "@/context/AppContext";
import { AuthProvider } from "@/context/AuthProvider";
import { AuthProvider as FormAuthProvider } from "@/hooks/useAuth";
import "./globals.css";

const tajawal = Tajawal({
  subsets: ["arabic"],
  weight: ["400", "500", "700", "800"],
  variable: "--font-arabic",
  display: "swap",
});

export const metadata = {
  title: "منصة جزيرة | بيئة تعليمية فاخرة",
  description:
    "منصة جزيرة التعليمية التفاعلية — اختبارات القدرات والتحصيلي، مسارات دراسية، ومجتمع تعليمي فاخر.",
};

export const viewport = {
  themeColor: "#FBF6EC",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="ar" dir="rtl" className={tajawal.variable}>
      <body className="min-h-screen antialiased">
        {/* AuthProvider: app-wide Supabase auth state (isSignedIn, userId, name…) */}
        <AuthProvider>
          {/* FormAuthProvider: signIn / signUp / signOut actions for form pages */}
          <FormAuthProvider>
            <AppProvider>
              {children}
            </AppProvider>
          </FormAuthProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
