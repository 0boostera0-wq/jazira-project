import { Tajawal } from "next/font/google";
import { AppProvider } from "@/context/AppContext";
import { AuthProvider } from "@/context/AuthProvider";
import { AuthProvider as FormAuthProvider } from "@/hooks/useAuth";
import { PreferencesProvider } from "@/context/PreferencesProvider";
import Starfield from "@/components/Starfield";
import ReferralCapture from "@/components/ReferralCapture";
import { SITE_URL, SITE_NAME, SITE_DESC, OG_IMAGE, organizationJsonLd } from "@/lib/seo";
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
  metadataBase: new URL(SITE_URL),
  title: {
    default: "منصة جزيرة | بيئة تعليمية فاخرة",
    template: "%s | منصة جزيرة",
  },
  description: SITE_DESC,
  applicationName: SITE_NAME,
  keywords: [
    "منصة جزيرة", "اختبار القدرات", "التحصيلي", "قياس", "تعليم", "مسارات دراسية",
    "مساعد ذكي", "ابتدائي", "متوسط", "ثانوي", "Jazira", "education", "aptitude test",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "ar_SA",
    siteName: SITE_NAME,
    title: "منصة جزيرة | بيئة تعليمية فاخرة",
    description: SITE_DESC,
    url: SITE_URL,
    images: [{ url: OG_IMAGE, width: 1200, height: 1200, alt: SITE_NAME }],
  },
  twitter: {
    card: "summary_large_image",
    title: "منصة جزيرة | بيئة تعليمية فاخرة",
    description: SITE_DESC,
    images: [OG_IMAGE],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
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
        {/* Organization + WebSite structured data (rich results) */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd()) }}
        />
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
