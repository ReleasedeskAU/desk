/** Supported runtime brand color themes. */
export type ColorThemeId = "sky" | "indigo" | "emerald" | "violet" | "graphite" | "amber";

/** Numeric stops exposed through the Tailwind brand color scale. */
export type BrandShade = 25 | 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950;

/** Public metadata and functional colors for a selectable color theme. */
export type ColorThemeDefinition = {
  id: ColorThemeId;
  name: string;
  sub: string;
  accent: string;
  accentSoft: string;
  gradient: string;
  onAccent: string;
  palette: Record<BrandShade, string>;
  darkPalette: Record<BrandShade, string>;
};

const reverseForDark = (palette: Record<BrandShade, string>): Record<BrandShade, string> => ({
  25: palette[950],
  50: palette[900],
  100: palette[800],
  200: palette[700],
  300: palette[600],
  400: palette[500],
  500: palette[400],
  600: palette[300],
  700: palette[200],
  800: palette[100],
  900: palette[50],
  950: palette[25],
});

const defineTheme = (
  theme: Omit<ColorThemeDefinition, "darkPalette">,
): ColorThemeDefinition => ({ ...theme, darkPalette: reverseForDark(theme.palette) });

/** Theme picker metadata and accessible light/dark functional palettes. */
export const COLOR_THEMES: readonly ColorThemeDefinition[] = [
  defineTheme({
    id: "sky",
    name: "Sky Blue",
    sub: "Default — current brand",
    accent: "#2563eb",
    accentSoft: "#eff6ff",
    gradient: "linear-gradient(135deg,#3b82f6,#2563eb)",
    onAccent: "#ffffff",
    palette: {
      25: "#fbfcfd", 50: "#eff6ff", 100: "#dbeafe", 200: "#bfdbfe",
      300: "#93c5fd", 400: "#60a5fa", 500: "#2563eb", 600: "#1d4ed8",
      700: "#1e40af", 800: "#1e3a8a", 900: "#172554", 950: "#0a1128",
    },
  }),
  defineTheme({
    id: "indigo",
    name: "Indigo",
    sub: "Deep, focused",
    accent: "#6366f1",
    accentSoft: "#eef2ff",
    gradient: "linear-gradient(135deg,#818cf8,#6366f1)",
    onAccent: "#ffffff",
    palette: {
      25: "#fdfdff", 50: "#eef2ff", 100: "#e0e7ff", 200: "#c7d2fe",
      300: "#a5b4fc", 400: "#818cf8", 500: "#6366f1", 600: "#4f46e5",
      700: "#4338ca", 800: "#3730a3", 900: "#312e81", 950: "#1e1b4b",
    },
  }),
  defineTheme({
    id: "emerald",
    name: "Emerald",
    sub: "Calm, operational",
    accent: "#10b981",
    accentSoft: "#ecfdf5",
    gradient: "linear-gradient(135deg,#34d399,#10b981)",
    onAccent: "#052e23",
    palette: {
      25: "#f8fffc", 50: "#ecfdf5", 100: "#d1fae5", 200: "#a7f3d0",
      300: "#6ee7b7", 400: "#34d399", 500: "#10b981", 600: "#059669",
      700: "#047857", 800: "#065f46", 900: "#064e3b", 950: "#022c22",
    },
  }),
  defineTheme({
    id: "violet",
    name: "Violet",
    sub: "Premium, distinctive",
    accent: "#7c3aed",
    accentSoft: "#f5f3ff",
    gradient: "linear-gradient(135deg,#8b5cf6,#6d28d9)",
    onAccent: "#ffffff",
    palette: {
      25: "#fefdff", 50: "#f5f3ff", 100: "#ede9fe", 200: "#ddd6fe",
      300: "#c4b5fd", 400: "#8b5cf6", 500: "#7c3aed", 600: "#6d28d9",
      700: "#5b21b6", 800: "#4c1d95", 900: "#3b0764", 950: "#2e1065",
    },
  }),
  defineTheme({
    id: "graphite",
    name: "Graphite",
    sub: "Monochrome, minimal",
    accent: "#334155",
    accentSoft: "#f1f5f9",
    gradient: "linear-gradient(135deg,#64748b,#334155)",
    onAccent: "#ffffff",
    palette: {
      25: "#fcfcfd", 50: "#f8fafc", 100: "#f1f5f9", 200: "#e2e8f0",
      300: "#cbd5e1", 400: "#94a3b8", 500: "#334155", 600: "#1e293b",
      700: "#172033", 800: "#0f172a", 900: "#0b1120", 950: "#020617",
    },
  }),
  defineTheme({
    id: "amber",
    name: "Amber",
    sub: "Warm, high-visibility",
    accent: "#d97706",
    accentSoft: "#fffbeb",
    gradient: "linear-gradient(135deg,#fbbf24,#d97706)",
    onAccent: "#1c1917",
    palette: {
      25: "#fffefa", 50: "#fffbeb", 100: "#fef3c7", 200: "#fde68a",
      300: "#fcd34d", 400: "#fbbf24", 500: "#d97706", 600: "#b45309",
      700: "#92400e", 800: "#78350f", 900: "#451a03", 950: "#2b1001",
    },
  }),
] as const;

/** Fast lookup for runtime consumers such as the MUI theme factory. */
export const COLOR_THEME_BY_ID = Object.fromEntries(
  COLOR_THEMES.map((theme) => [theme.id, theme]),
) as Record<ColorThemeId, ColorThemeDefinition>;

/** Returns whether an untrusted value is a supported color theme identifier. */
export function isColorThemeId(value: unknown): value is ColorThemeId {
  return typeof value === "string" && value in COLOR_THEME_BY_ID;
}
