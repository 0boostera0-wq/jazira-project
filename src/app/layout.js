import { Tajawal } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { arSA } from "@clerk/localizations";
import { isClerkEnabled } from "@/lib/authConfig";
import { AppProvider } from "@/context/AppContext";
import { AuthProvider } from "@/context/AuthProvider";
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
  const tree = (
    <html lang="ar" dir="rtl" className={tajawal.variable}>
      <body className="min-h-screen antialiased">
        <AppProvider>
          <AuthProvider>{children}</AuthProvider>
        </AppProvider>
      </body>
    </html>
  );

  // Only mount ClerkProvider when real keys exist, otherwise run in demo mode.
  if (isClerkEnabled) {
    return (
      <ClerkProvider
        localization={arSA}
        appearance={{
          variables: {
            colorPrimary: "#C9A86A",
            colorText: "#4A3F2F",
            colorBackground: "#FFFDF9",
            borderRadius: "1rem",
          },
        }}
      >
        {tree}
      </ClerkProvider>
    );
  }

  return tree;
}
