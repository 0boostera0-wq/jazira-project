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
        ink: {
          DEFAULT: v("c-ink"),
          2: v("c-ink-2"),
          3: v("c-ink-3"),
          4: v("c-ink-4"),
          // legacy aliases (pre-redesign components)
          soft: v("c-ink-2"),
          muted: v("c-ink-3"),
        },
        gold: {
          50: v("c-gold-50"), 100: v("c-gold-100"), 200: v("c-gold-200"), 300: v("c-gold-300"),
          400: v("c-gold-400"), 500: v("c-gold-500"), 600: v("c-gold-600"), 700: v("c-gold-700"),
          800: v("c-gold-800"),
          // legacy aliases
          light: v("c-gold-300"), DEFAULT: v("c-gold-500"), dark: v("c-gold-700"),
        },
        green: {
          50: v("c-green-50"), 100: v("c-green-100"), 200: v("c-green-200"), 400: v("c-green-400"),
          500: v("c-green-500"), 600: v("c-green-600"), 700: v("c-green-700"),
        },
        danger: { DEFAULT: v("c-danger"), soft: v("c-danger-soft") },
        warning: { DEFAULT: v("c-warning"), soft: v("c-warning-soft") },
        info: { DEFAULT: v("c-info"), soft: v("c-info-soft") },
        primary: { DEFAULT: v("c-primary"), fg: v("c-on-primary") },

        // ── legacy palettes (static) — used only by not-yet-migrated components
        cream: { 50: "#FFFDF9", 100: "#FBF6EC", 200: "#F5EBD9", 300: "#EADFC8", 400: "#DCCBA8" },
        champagne: {
          DEFAULT: "#C9A86A", 50: "#FAF4E8", 100: "#F1E4C8", 200: "#E3CD9E", 300: "#D4B984",
          400: "#C9A86A", 500: "#B8923F", 600: "#9C7A32", 700: "#7C6028",
        },
      },
      fontFamily: {
        sans: ["var(--font-ar)", "system-ui", "sans-serif"],
        ar: ["var(--font-ar)", "system-ui", "sans-serif"],
        en: ["var(--font-en)", "var(--font-ar)", "system-ui", "sans-serif"],
        arabic: ["var(--font-ar)", "system-ui", "sans-serif"], // legacy
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
        // legacy
        glass: "0 8px 32px rgba(150, 120, 60, 0.12)",
        "glass-lg": "0 20px 60px rgba(150, 120, 60, 0.18)",
      },
      maxWidth: { container: "var(--container)", prose: "72ch" },
      transitionTimingFunction: { out: "var(--ease-out)", spring: "var(--ease-spring)" },
      transitionDuration: { fast: "140ms", DEFAULT: "220ms", slow: "420ms" },
      spacing: { topbar: "var(--topbar-h)", bottomnav: "var(--bottomnav-h)", sidebar: "var(--sidebar-w)" },
      backgroundImage: {
        // legacy
        "cream-gradient": "linear-gradient(135deg, #FFFDF9 0%, #FBF6EC 40%, #F5EBD9 100%)",
        "gold-gradient": "linear-gradient(135deg, #E6C77E 0%, #C9A86A 50%, #B8923F 100%)",
      },
      keyframes: {
        float: { "0%, 100%": { transform: "translateY(0px)" }, "50%": { transform: "translateY(-6px)" } },
        shimmer: { "0%": { backgroundPosition: "-200% 0" }, "100%": { backgroundPosition: "200% 0" } },
      },
      animation: {
        float: "float 3s ease-in-out infinite",
        shimmer: "shimmer 2.5s linear infinite",
      },
    },
  },
  plugins: [],
};
