import { Tajawal } from "next/font/google";
import { AppProvider } from "@/context/AppContext";
import { AuthProvider } from "@/context/AuthProvider";
import { AuthProvider as FormAuthProvider } from "@/hooks/useAuth";
import { PreferencesProvider } from "@/context/PreferencesProvider";
import Starfield from "@/components/Starfield";
import ReferralCapture from "@/components/ReferralCapture";
import "./globals.css";

// Apply saved theme + language before first paint to avoid a flash / wrong dir.
const themeScript = `
(function(){try{var t=JSON.parse(localStorage.getItem("jazira_theme_v1"));if(t==="dark"){document.documentElement.classList.add("dark");}}catch(e){}
try{var p=JSON.parse(localStorage.getItem("jazira_user_prefs_v1"));if(p&&p.language==="en"){document.documentElement.lang="en";document.documentElement.dir="ltr";}}catch(e){}})();
`;

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
    <html lang="ar" dir="rtl" className={tajawal.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen antialiased">
        {/* Animated starfield — vivid in dark mode, hidden in light */}
        <Starfield />
        {/* Captures ?ref= invite codes and attributes successful invitations */}
        <ReferralCapture />
        {/* AuthProvider: app-wide Supabase auth state (isSignedIn, userId, name…) */}
        <AuthProvider>
          {/* FormAuthProvider: signIn / signUp / signOut actions for form pages */}
          <FormAuthProvider>
            <AppProvider>
              {/* PreferencesProvider: per-account sound / language / AI suggestions */}
              <PreferencesProvider>
                {children}
              </PreferencesProvider>
            </AppProvider>
          </FormAuthProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
