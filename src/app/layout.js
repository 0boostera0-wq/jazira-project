// The real root layout (<html>, <body>, fonts, providers) is app/[locale]/layout.js,
// because `lang` and `dir` depend on the locale segment. This pass-through keeps
// Next.js happy for the root-level files that render their own document:
// not-found.js (every unmatched URL, server-rendered 404) and global-error.js.
import "./globals.css";
// Fonts are imported here too so their @font-face CSS belongs to the root
// layout, which is the only layout of the root not-found / global-error
// documents. (In `next dev` Next 14 still attributes it to the first layout
// that compiled it; globals.css falls back to the Arabic-metric fallback face.)
import "./fonts";

export default function RootLayout({ children }) {
  return children;
}
