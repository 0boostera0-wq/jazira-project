// The real root layout (<html>, <body>, fonts, providers) is app/[locale]/layout.js,
// because `lang` and `dir` depend on the locale segment. This pass-through keeps
// Next.js happy for the few root-level files (not-found, route handlers).
import "./globals.css";

export default function RootLayout({ children }) {
  return children;
}
