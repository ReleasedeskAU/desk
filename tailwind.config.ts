import type { Config } from "tailwindcss";
import { palette } from "./lib/palette";


function withVars(obj: any, prefix = ""): any {
  if (typeof obj === "string") return `rgb(var(--color-${prefix}) / <alpha-value>)`;
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, withVars(v, prefix ? `${prefix}-${k}` : k)])
  );
}

const semanticColors = withVars({
  brand: palette.brand,
  accent: palette.accent,
  gray: palette.gray,
  success: palette.success,
  error: palette.error,
  warning: palette.warning,
  info: palette.info,
});

const config: Config = {
  darkMode: ["class", ".theme-dark"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ...semanticColors,
        ai: palette.ai,
        sidebar: palette.sidebar,
        primary: "rgb(var(--color-brand-500) / <alpha-value>)",
        surface: "var(--surface)",
        border: "var(--border)",
      },
      fontFamily: {
        sans: ["var(--font-poppins)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains)", "ui-monospace", "monospace"],
      },
      fontSize: {
        /* design.md typography scale */
        "display-lg": ["2.25rem", { lineHeight: "1.1", fontWeight: "700", letterSpacing: "-0.02em" }],
        "headline-md": ["1.5rem", { lineHeight: "1.2", fontWeight: "600", letterSpacing: "-0.01em" }],
        "headline-sm": ["1.125rem", { lineHeight: "1.2", fontWeight: "600" }],
        "body-lg": ["1rem", { lineHeight: "1.5", fontWeight: "400" }],
        "body-md": ["0.875rem", { lineHeight: "1.5", fontWeight: "400" }],
        "body-sm": ["0.8125rem", { lineHeight: "1.4", fontWeight: "400" }],
        "label-md": ["0.75rem", { lineHeight: "1", fontWeight: "600", letterSpacing: "0.05em" }],
        "code-sm": ["0.75rem", { lineHeight: "1.4", fontWeight: "400" }],
        /* legacy aliases kept for compatibility */
        "title-sm": ["1.875rem", { lineHeight: "2.375rem" }],
        "theme-sm": ["0.875rem", { lineHeight: "1.25rem" }],
        "theme-xs": ["0.75rem", { lineHeight: "1.125rem" }],
      },
      borderRadius: {
        /* design.md rounded scale */
        sm: "0.25rem",
        DEFAULT: "0.5rem",
        md: "0.75rem",
        lg: "1rem",
        xl: "1.5rem",
        full: "9999px",
        materio: "0.5rem",
      },
      boxShadow: {
        /* modern glassmorphism elevation system */
        "level-1": "0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)",
        "level-2": "0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -2px rgba(0, 0, 0, 0.04)",
        "level-3": "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
        "glass-sm": "0 4px 30px rgba(0, 0, 0, 0.05)",
        "glass-md": "0 8px 32px rgba(31, 38, 135, 0.07)",
        "focus-ring": "0 0 0 3px rgb(var(--color-brand-500) / 0.15)",
        "glow-brand": "0 0 20px rgb(var(--color-brand-500) / 0.3)",
        /* legacy aliases mapped to new levels */
        "theme-sm": "0 4px 6px -1px rgba(0, 0, 0, 0.05)",
        "theme-md": "0 10px 15px -3px rgba(0, 0, 0, 0.08)",
        materio: "0 2px 4px rgba(0,0,0,0.05)",
      },
      spacing: {
        gutter: "20px",
        "margin-mobile": "16px",
        "margin-desktop": "32px",
      },
      animation: {
        shimmer: "shimmer 1.5s infinite",
        pulseDot: "pulseDot 2s infinite",
        "text-shimmer": "text-shimmer 4s linear infinite",
        marquee: "marquee 40s linear infinite",
        "border-beam": "border-beam 4s linear infinite",
        float: "float 5s ease-in-out infinite",
        glow: "glow 2s ease-in-out infinite",
        "fade-in-up": "fadeInUp 0.5s ease-out",
        "scale-in": "scaleIn 0.3s ease-out",
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "text-shimmer": {
          "0%": { backgroundPosition: "0% center" },
          "100%": { backgroundPosition: "200% center" },
        },
        marquee: {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(calc(-100% - var(--gap, 1rem)))" },
        },
        pulseDot: {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.5", transform: "scale(1.2)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        glow: {
          "0%, 100%": { opacity: "0.5" },
          "50%": { opacity: "1" },
        },
        "border-beam": {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        fadeInUp: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        scaleIn: {
          "0%": { opacity: "0", transform: "scale(0.95)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
