import type { Config } from "tailwindcss";
import colors from "tailwindcss/colors";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          ...colors.emerald,
          DEFAULT: colors.emerald[500],
        },
        secondary: {
          DEFAULT: colors.emerald[800],
          light: colors.emerald[700],
          dark: colors.emerald[900],
        },
        accent: {
          ...colors.teal,
          DEFAULT: colors.teal[500],
        },
        background: colors.slate[50],
        foreground: colors.slate[900],
        muted: {
          DEFAULT: colors.slate[500],
          foreground: colors.slate[400],
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      fontSize: {
        h1: ["2.5rem", { lineHeight: "1.15", fontWeight: "700", letterSpacing: "-0.02em" }],
        h2: ["1.875rem", { lineHeight: "1.2", fontWeight: "700", letterSpacing: "-0.01em" }],
        h3: ["1.375rem", { lineHeight: "1.3", fontWeight: "600" }],
        body: ["1rem", { lineHeight: "1.6", fontWeight: "400" }],
        small: ["0.875rem", { lineHeight: "1.5", fontWeight: "400" }],
        button: ["0.9375rem", { lineHeight: "1", fontWeight: "600" }],
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.25rem",
        "3xl": "1.75rem",
      },
      boxShadow: {
        soft: "0 2px 8px -2px rgb(15 23 42 / 0.06), 0 1px 2px -1px rgb(15 23 42 / 0.04)",
        card: "0 4px 20px -4px rgb(15 23 42 / 0.08)",
        "card-hover": "0 12px 32px -8px rgb(16 185 129 / 0.18)",
      },
      keyframes: {
        fadeInUp: {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
      animation: {
        "fade-in-up": "fadeInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "fade-in": "fadeIn 0.4s ease-out forwards",
      },
      transitionTimingFunction: {
        smooth: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
