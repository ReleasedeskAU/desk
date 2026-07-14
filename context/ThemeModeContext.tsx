"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { isColorThemeId, type ColorThemeId } from "@/lib/color-themes";
import type { ActiveThemeMode as ThemeMode } from "@/lib/materio/theme";

const MODE_STORAGE_KEY = "sentinel-theme-mode";
const COLOR_STORAGE_KEY = "sentinel-color-theme";
const DEFAULT_COLOR_THEME: ColorThemeId = "sky";

type ThemeModeContextValue = {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  cycleMode: () => void;
  colorTheme: ColorThemeId;
  setColorTheme: (colorTheme: ColorThemeId) => void;
};

const ThemeModeContext = createContext<ThemeModeContextValue | null>(null);

const MODES: ThemeMode[] = ["light", "dark"];

function normalizeMode(v: string | null): ThemeMode {
  if (v === "dark" || v === "semi-dark") return "dark";
  if (v === "light") return "light";
  return "light";
}

function applyDomMode(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.theme = mode;
  root.classList.remove("theme-light", "theme-dark", "theme-semi-dark");
  root.classList.add(`theme-${mode}`);
  root.style.colorScheme = mode === "dark" ? "dark" : "light";
}

function applyDomColorTheme(colorTheme: ColorThemeId) {
  if (typeof document !== "undefined") {
    document.documentElement.dataset.colorTheme = colorTheme;
  }
}

function readStoredColorTheme(): ColorThemeId {
  try {
    const stored = localStorage.getItem(COLOR_STORAGE_KEY);
    return isColorThemeId(stored) ? stored : DEFAULT_COLOR_THEME;
  } catch {
    return DEFAULT_COLOR_THEME;
  }
}

function extractColorTheme(payload: unknown): ColorThemeId | null {
  if (!payload || typeof payload !== "object") return null;
  const response = payload as Record<string, unknown>;
  const nested = response.preferences;
  const value =
    response.colorTheme ??
    (nested && typeof nested === "object"
      ? (nested as Record<string, unknown>).colorTheme
      : undefined);
  return isColorThemeId(value) ? value : null;
}

/** Provides the active display mode and runtime brand theme to the application. */
export function ThemeModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("light");
  const [colorTheme, setColorThemeState] = useState<ColorThemeId>(DEFAULT_COLOR_THEME);
  const colorChangedByUser = useRef(false);

  useEffect(() => {
    const stored = localStorage.getItem(MODE_STORAGE_KEY);
    const resolved = normalizeMode(stored);
    setModeState(resolved);
    applyDomMode(resolved);
    if (stored === "semi-dark") {
      localStorage.setItem(MODE_STORAGE_KEY, "dark");
    }
  }, []);

  useEffect(() => {
    let active = true;
    const cached = readStoredColorTheme();
    setColorThemeState(cached);
    applyDomColorTheme(cached);

    void fetch("/api/appearance-preferences")
      .then((response) => (response.ok ? response.json() as Promise<unknown> : null))
      .then((payload) => {
        const authoritative = extractColorTheme(payload);
        if (!active || !authoritative || colorChangedByUser.current) return;
        setColorThemeState(authoritative);
        applyDomColorTheme(authoritative);
        try {
          localStorage.setItem(COLOR_STORAGE_KEY, authoritative);
        } catch {
          // Storage can be unavailable in privacy modes; the DOM state still applies.
        }
      })
      .catch(() => {
        // The validated local cache remains the secure fallback when sync is unavailable.
      });

    return () => {
      active = false;
    };
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    localStorage.setItem(MODE_STORAGE_KEY, next);
    applyDomMode(next);
  }, []);

  const cycleMode = useCallback(() => {
    setModeState((current) => {
      const idx = MODES.indexOf(current);
      const next = MODES[(idx + 1) % MODES.length];
      localStorage.setItem(MODE_STORAGE_KEY, next);
      applyDomMode(next);
      return next;
    });
  }, []);

  const setColorTheme = useCallback((next: ColorThemeId) => {
    // A late initial GET must never overwrite a selection the user just made.
    colorChangedByUser.current = true;
    setColorThemeState(next);
    applyDomColorTheme(next);
    try {
      localStorage.setItem(COLOR_STORAGE_KEY, next);
    } catch {
      // Persistence sync below can still save the account preference.
    }

    void fetch("/api/appearance-preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ colorTheme: next }),
    }).catch(() => {
      // Keep the instant local selection; a later change can retry account sync.
    });
  }, []);

  const value = useMemo(
    () => ({ mode, setMode, cycleMode, colorTheme, setColorTheme }),
    [mode, setMode, cycleMode, colorTheme, setColorTheme],
  );

  return <ThemeModeContext.Provider value={value}>{children}</ThemeModeContext.Provider>;
}

/** Returns display and color-theme controls from the nearest theme provider. */
export function useThemeMode() {
  const ctx = useContext(ThemeModeContext);
  if (!ctx) throw new Error("useThemeMode must be used within ThemeModeProvider");
  return ctx;
}
