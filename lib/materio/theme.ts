import { alpha, createTheme, type Theme, type ThemeOptions } from "@mui/material/styles";
import {
  COLOR_THEME_BY_ID,
  type ColorThemeDefinition,
  type ColorThemeId,
} from "@/lib/color-themes";
import { palette } from "@/lib/palette";

/** Legacy-compatible mode type; new runtime state only exposes ActiveThemeMode. */
export type ThemeMode = "light" | "dark" | "semi-dark";

/** Light and dark modes supported by the current application shell. */
export type ActiveThemeMode = Exclude<ThemeMode, "semi-dark">;

const materioSuccess = palette.success[500];
const materioWarning = palette.warning[500];
const materioError = palette.error[500];
const materioInfo = palette.info[500];

const sharedTypography: ThemeOptions["typography"] = {
  fontFamily: "var(--font-poppins), system-ui, sans-serif",
  h4: { fontWeight: 600, fontSize: "1.5rem", lineHeight: 1.2, letterSpacing: "-0.01em" },
  h5: { fontWeight: 600, fontSize: "1.125rem", lineHeight: 1.2 },
  h6: { fontWeight: 600, fontSize: "0.9375rem", lineHeight: 1.4667 },
  body1: { fontSize: "0.875rem", lineHeight: 1.5 },
  body2: { fontSize: "0.8125rem", lineHeight: 1.4 },
  caption: { fontSize: "0.75rem", lineHeight: 1, fontWeight: 600, letterSpacing: "0.05em" },
};

const sharedShape: ThemeOptions["shape"] = { borderRadius: 8 };

function lightPalette(colorTheme: ColorThemeDefinition): ThemeOptions["palette"] {
  return {
    mode: "light",
    primary: {
      main: colorTheme.palette[500],
      light: colorTheme.palette[400],
      dark: colorTheme.palette[600],
      contrastText: colorTheme.onAccent,
    },
    secondary: { main: palette.gray[600], light: palette.gray[500], dark: palette.gray[700], contrastText: "#fff" },
    success: { main: materioSuccess, light: palette.success[50], dark: palette.success[700], contrastText: "#fff" },
    warning: { main: materioWarning, light: palette.warning[50], dark: palette.warning[700], contrastText: "#fff" },
    error: { main: materioError, light: palette.error[50], dark: palette.error[700], contrastText: "#fff" },
    info: { main: materioInfo, light: palette.info[50], dark: palette.info[700], contrastText: "#fff" },
    background: { default: palette.surface, paper: "#ffffff" },
    text: { primary: palette.foreground, secondary: palette.gray[600], disabled: palette.gray[400] },
    divider: palette.border,
  };
}

function darkPalette(colorTheme: ColorThemeDefinition): ThemeOptions["palette"] {
  return {
    mode: "dark",
    primary: {
      main: colorTheme.darkPalette[500],
      light: colorTheme.darkPalette[600],
      dark: colorTheme.darkPalette[400],
      contrastText: colorTheme.palette[950],
    },
    secondary: { main: palette.gray[500], light: palette.gray[300], dark: palette.gray[700], contrastText: "#fff" },
    success: { main: materioSuccess, light: palette.success[700], dark: palette.success[500], contrastText: "#fff" },
    warning: { main: materioWarning, light: palette.warning[700], dark: palette.warning[500], contrastText: "#fff" },
    error: { main: materioError, light: palette.error[700], dark: palette.error[500], contrastText: "#fff" },
    info: { main: materioInfo, light: palette.info[700], dark: palette.info[500], contrastText: "#fff" },
    background: { default: "#1a1f2e", paper: "#2a3142" },
    text: { primary: "#ffffff", secondary: "rgba(255, 255, 255, 0.75)", disabled: "rgba(255, 255, 255, 0.45)" },
    divider: "rgba(235, 241, 250, 0.12)",
  };
}

function componentOverrides(
  mode: ActiveThemeMode,
  colorTheme: ColorThemeDefinition,
): ThemeOptions["components"] {
  const isDark = mode === "dark";
  const primary = isDark ? colorTheme.darkPalette[500] : colorTheme.palette[500];
  const paperBg = isDark ? "#2a3142" : "#ffffff";
  const shadow = isDark ? "0px 2px 4px rgba(0, 0, 0, 0.2)" : "0 2px 4px rgba(0,0,0,0.05)";

  return {
    MuiCssBaseline: {
      styleOverrides: {
        body: { scrollbarColor: isDark ? "#495057 #1a1f2e" : "#dee2e6 #f8f9fa" },
      },
    },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          borderRadius: 8,
          border: `1px solid ${isDark ? "rgba(235, 241, 250, 0.12)" : palette.border}`,
          boxShadow: shadow,
          backgroundImage: "none",
        },
      },
    },
    MuiCardHeader: {
      styleOverrides: {
        root: { padding: "20px 24px 12px" },
        title: { fontSize: "1.125rem", fontWeight: 600 },
        subheader: { fontSize: "0.8125rem", marginTop: 2 },
      },
    },
    MuiCardContent: {
      styleOverrides: { root: { padding: "12px 24px 24px", "&:last-child": { paddingBottom: 24 } } },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: "none",
          fontWeight: 500,
          borderRadius: 8,
          "&.MuiButton-containedPrimary": { boxShadow: `0 2px 6px ${alpha(primary, 0.4)}` },
        },
      },
    },
    MuiChip: {
      styleOverrides: { root: { fontWeight: 500, borderRadius: 6 } },
    },
    MuiTableCell: {
      styleOverrides: {
        head: { fontWeight: 600, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em" },
        root: { borderColor: isDark ? "rgba(235, 241, 250, 0.12)" : palette.border },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: "none", backgroundColor: paperBg },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: isDark ? "#2a3142" : "#ffffff",
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: isDark ? "rgba(235, 241, 250, 0.16)" : palette.border,
          },
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: isDark ? "rgba(235, 241, 250, 0.28)" : palette.border,
          },
        },
        input: { color: isDark ? "#ffffff" : undefined },
      },
    },
    MuiSelect: {
      styleOverrides: {
        icon: { color: isDark ? "rgba(255, 255, 255, 0.65)" : undefined },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          backgroundColor: isDark ? "#212738" : "#ffffff",
          backgroundImage: "none",
          border: isDark ? "1px solid rgba(235, 241, 250, 0.16)" : undefined,
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          "&:hover": { backgroundColor: isDark ? "rgba(255, 255, 255, 0.08)" : undefined },
          "&.Mui-selected": { backgroundColor: isDark ? alpha(primary, 0.22) : undefined },
        },
      },
    },
  };
}

/**
 * Creates the MUI theme for a display mode and runtime color theme.
 * Accepts either a public color-theme id or its resolved configuration.
 */
export function createMaterioTheme(
  mode: ActiveThemeMode,
  colorTheme: ColorThemeId | ColorThemeDefinition = "sky",
): Theme {
  const muiMode = mode === "dark" ? "dark" : "light";
  const resolvedColorTheme =
    typeof colorTheme === "string" ? COLOR_THEME_BY_ID[colorTheme] : colorTheme;
  const paletteConfig =
    muiMode === "dark"
      ? darkPalette(resolvedColorTheme)
      : lightPalette(resolvedColorTheme);

  return createTheme({
    palette: paletteConfig,
    typography: sharedTypography,
    shape: sharedShape,
    components: componentOverrides(mode, resolvedColorTheme),
  });
}
