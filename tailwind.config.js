/** @type {import('tailwindcss').Config} */

// All brand colours resolve to CSS variables defined in src/app/globals.css so
// light and dark themes switch without touching components. Channels are RGB
// triplets, which keeps Tailwind opacity modifiers working: bg-surface/80.
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

module.exports = {
  content: ["./src/**/*.{js,jsx}"],
  darkMode: "class",
  theme: {
    extend: {
      screens: { xs: "400px", "3xl": "1680px" },
      // Design-system alpha steps (border-line/12, bg-surface-2/8…) not in Tailwind's default scale.
      opacity: { 8: "0.08", 12: "0.12", 18: "0.18" },
      colors: {
        canvas: v("c-canvas"),
        surface: { DEFAULT: v("c-surface"), 2: v("c-surface-2"), 3: v("c-surface-3") },
        line: v("c-line"),
        // form-control boundaries (inputs, selects, switch track): ≥3:1 on surface & canvas
        field: v("c-field"),
        ink: {
          DEFAULT: v("c-ink"),
          2: v("c-ink-2"),
          3: v("c-ink-3"),
          4: v("c-ink-4"),
        },
        gold: {
          50: v("c-gold-50"), 100: v("c-gold-100"), 200: v("c-gold-200"), 300: v("c-gold-300"),
          400: v("c-gold-400"), 500: v("c-gold-500"), 600: v("c-gold-600"), 700: v("c-gold-700"),
          800: v("c-gold-800"),
        },
        green: {
          50: v("c-green-50"), 100: v("c-green-100"), 200: v("c-green-200"), 400: v("c-green-400"),
          500: v("c-green-500"), 600: v("c-green-600"), 700: v("c-green-700"),
        },
        danger: { DEFAULT: v("c-danger"), soft: v("c-danger-soft"), fg: v("c-on-danger") },
        warning: { DEFAULT: v("c-warning"), soft: v("c-warning-soft") },
        info: { DEFAULT: v("c-info"), soft: v("c-info-soft") },
        primary: { DEFAULT: v("c-primary"), fg: v("c-on-primary") },
      },
      fontFamily: {
        // var() fallbacks keep these valid where the next/font variable class is absent
        sans: ["var(--font-ar, JaziraArabicFallback, Tahoma)", "system-ui", "sans-serif"],
        ar: ["var(--font-ar, JaziraArabicFallback, Tahoma)", "system-ui", "sans-serif"],
        en: ["var(--font-en, Arial)", "var(--font-ar, JaziraArabicFallback)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        xs: "var(--radius-xs)",
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
      },
      boxShadow: {
        xs: "var(--shadow-xs)",
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        gold: "var(--shadow-gold)",
      },
      maxWidth: { container: "var(--container)", prose: "72ch" },
      transitionTimingFunction: { out: "var(--ease-out)", spring: "var(--ease-spring)" },
      transitionDuration: { fast: "140ms", DEFAULT: "220ms", slow: "420ms" },
      spacing: { topbar: "var(--topbar-h)", bottomnav: "var(--bottomnav-h)", sidebar: "var(--sidebar-w)" },
    },
  },
  plugins: [],
};
