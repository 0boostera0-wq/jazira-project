/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/app/**/*.{js,jsx}",
    "./src/components/**/*.{js,jsx}",
    "./src/context/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Sophisticated Beige palette
        cream: {
          50: "#FFFDF9",
          100: "#FBF6EC",
          200: "#F5EBD9",
          300: "#EADFC8",
          400: "#DCCBA8",
        },
        champagne: {
          DEFAULT: "#C9A86A",
          50: "#FAF4E8",
          100: "#F1E4C8",
          200: "#E3CD9E",
          300: "#D4B984",
          400: "#C9A86A",
          500: "#B8923F",
          600: "#9C7A32",
          700: "#7C6028",
        },
        gold: {
          light: "#E6C77E",
          DEFAULT: "#C9A227",
          dark: "#A07C1E",
        },
        ink: {
          DEFAULT: "#4A3F2F",
          soft: "#6B5E48",
          muted: "#8C7E66",
        },
      },
      fontFamily: {
        arabic: ["var(--font-arabic)", "Tajawal", "system-ui", "sans-serif"],
      },
      backgroundImage: {
        "cream-gradient":
          "linear-gradient(135deg, #FFFDF9 0%, #FBF6EC 40%, #F5EBD9 100%)",
        "gold-gradient":
          "linear-gradient(135deg, #E6C77E 0%, #C9A86A 50%, #B8923F 100%)",
      },
      boxShadow: {
        glass: "0 8px 32px rgba(150, 120, 60, 0.12)",
        "glass-lg": "0 20px 60px rgba(150, 120, 60, 0.18)",
        gold: "0 6px 24px rgba(201, 162, 39, 0.35)",
      },
      backdropBlur: {
        xs: "2px",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-6px)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        float: "float 3s ease-in-out infinite",
        shimmer: "shimmer 2.5s linear infinite",
      },
    },
  },
  plugins: [],
};
