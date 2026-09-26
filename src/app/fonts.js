import { IBM_Plex_Sans_Arabic, IBM_Plex_Sans } from "next/font/google";

// Shared by the locale root layout (app/[locale]/layout.js) and the
// last-resort documents (app/not-found.js, which renders its own <html>).
//
// Typography: IBM Plex Sans Arabic for Arabic (and Latin runs inside Arabic
// text) — a humanist sans with excellent long-form readability — paired with
// its designed sibling IBM Plex Sans for the English interface.
//
// Neither face is preloaded. One layout serves both locales, so a preload is
// emitted on every route: preloading the Arabic face made English pages fetch
// ~103KB of unused high-priority Arabic fonts (and Arabic pages preload three
// weights that compete with the CSS). With display: swap text paints at once in
// the fallback. The Arabic fallback is Arabic-aware: "JaziraArabicFallback"
// (globals.css) is Arial size-adjusted from ARABIC text measurements, instead of
// next/font's automatic Arial fallback, whose size-adjust comes from Latin
// metrics and re-wrapped Arabic lines when the webfont arrived (CLS).
export const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "500", "700"],
  variable: "--font-ar",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  fallback: ["JaziraArabicFallback", "Tahoma", "Geeza Pro", "system-ui", "sans-serif"],
});

export const plexLatin = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-en",
  display: "swap",
  preload: false,
});

/** className for <html>: exposes --font-ar / --font-en. */
export const fontVariables = `${plexArabic.variable} ${plexLatin.variable}`;

/** Apply the saved theme before first paint (no light→dark flash). */
export const THEME_SCRIPT = `(function(){try{var t=JSON.parse(localStorage.getItem("jazira_theme_v1"));if(t==="dark")document.documentElement.classList.add("dark")}catch(e){}})();`;
