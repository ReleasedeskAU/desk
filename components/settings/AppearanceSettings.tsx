"use client";

import { Check, Moon, Sun } from "lucide-react";
import { useThemeMode } from "@/context/ThemeModeContext";
import { COLOR_THEMES, type ColorThemeId } from "@/lib/color-themes";

type SelectableMode = "light" | "dark";

type ColorThemeDefinition = (typeof COLOR_THEMES)[number];
type ColorThemeOption = Omit<ColorThemeDefinition, "id"> & {
  id: ColorThemeId;
  label: string;
  description: string;
  swatches: readonly string[];
};

const MODE_OPTIONS: Array<{
  id: SelectableMode;
  label: string;
  description: string;
  icon: typeof Sun;
}> = [
  { id: "light", label: "Light", description: "Bright and clear", icon: Sun },
  { id: "dark", label: "Dark", description: "Easy on the eyes", icon: Moon },
];

const CONTROL_MOTION =
  "transition-[transform,box-shadow,border-color,background-color] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.97]";

const COLOR_THEME_OPTIONS: readonly ColorThemeOption[] = COLOR_THEMES.map((theme) => ({
  ...theme,
  label: theme.name,
  description: theme.sub,
  swatches: [theme.palette[400], theme.accent, theme.palette[700]],
}));

/**
 * Renders appearance controls for light/dark mode and the workspace color theme.
 *
 * Selections are applied immediately through ThemeModeContext and persisted by its provider.
 */
export function AppearanceSettings() {
  const { mode, setMode, colorTheme, setColorTheme } = useThemeMode();
  const selectedTheme =
    COLOR_THEME_OPTIONS.find((theme) => theme.id === colorTheme) ?? COLOR_THEME_OPTIONS[0];

  return (
    <section className="font-sans text-gray-900 dark:text-white" aria-labelledby="appearance-title">
      <div className="mb-7">
        <h2 id="appearance-title" className="text-[24px] font-bold tracking-[-0.02em]">
          Appearance
        </h2>
        <p className="mt-1.5 max-w-2xl text-[14px] font-medium leading-6 text-gray-500 dark:text-gray-300">
          Personalize how Sentinel looks and feels. Your changes are applied instantly.
        </p>
      </div>

      <div className="space-y-6">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_30px_rgba(15,23,42,0.06)] dark:border-[var(--border)] dark:bg-[var(--card)] dark:shadow-[0_2px_3px_rgba(0,0,0,0.18),0_14px_36px_rgba(0,0,0,0.22)] sm:p-6">
          <div className="mb-4">
            <h3 className="text-[16px] font-bold">Mode</h3>
            <p className="mt-1 text-[13px] text-gray-500 dark:text-gray-300">
              Choose the brightness that works best for you.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3" role="group" aria-label="Appearance mode">
            {MODE_OPTIONS.map(({ id, label, description, icon: Icon }) => {
              const isSelected = mode === id;

              return (
                <button
                  key={id}
                  type="button"
                  aria-label={`Use ${label.toLowerCase()} mode`}
                  aria-pressed={isSelected}
                  onClick={() => setMode(id)}
                  className={`group flex min-h-[72px] items-center gap-3 rounded-xl border px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent,#3154D5)] focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#2a3142] ${CONTROL_MOTION} ${
                    isSelected
                      ? "scale-[1.015] border-[var(--theme-accent,#3154D5)] bg-[var(--theme-accent-soft,rgba(49,84,213,0.08))] shadow-[0_8px_18px_rgba(15,23,42,0.09)] dark:shadow-[0_8px_22px_rgba(0,0,0,0.24)]"
                      : "border-gray-200 bg-gray-50/70 hover:scale-[1.01] hover:border-gray-300 hover:shadow-[0_7px_16px_rgba(15,23,42,0.07)] dark:border-[var(--border)] dark:bg-white/[0.035] dark:hover:border-white/25"
                  }`}
                >
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors duration-200 ${
                      isSelected
                        ? "bg-[var(--theme-accent,#3154D5)] text-[var(--theme-on-accent,#fff)]"
                        : "bg-white text-gray-500 shadow-sm dark:bg-white/10 dark:text-gray-200"
                    }`}
                  >
                    <Icon aria-hidden="true" className="h-[18px] w-[18px]" />
                  </span>
                  <span>
                    <span className="block text-[14px] font-bold">{label}</span>
                    <span className="mt-0.5 block text-[12px] font-medium text-gray-500 dark:text-gray-300">
                      {description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_30px_rgba(15,23,42,0.06)] dark:border-[var(--border)] dark:bg-[var(--card)] dark:shadow-[0_2px_3px_rgba(0,0,0,0.18),0_14px_36px_rgba(0,0,0,0.22)] sm:p-6">
          <div className="mb-5">
            <h3 className="text-[16px] font-bold">Color Theme</h3>
            <p className="mt-1 text-[13px] text-gray-500 dark:text-gray-300">
              Pick an accent palette that matches your style.
            </p>
          </div>

          <div
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
            role="group"
            aria-label="Color theme"
          >
            {COLOR_THEME_OPTIONS.map((theme) => {
              const isSelected = theme.id === colorTheme;

              return (
                <button
                  key={theme.id}
                  type="button"
                  aria-label={`Use ${theme.label} color theme`}
                  aria-pressed={isSelected}
                  onClick={() => setColorTheme(theme.id)}
                  className={`group relative overflow-hidden rounded-xl border bg-white p-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent,#3154D5)] focus-visible:ring-offset-2 dark:bg-white/[0.035] dark:focus-visible:ring-offset-[#2a3142] ${CONTROL_MOTION} ${
                    isSelected
                      ? "scale-[1.015] shadow-[0_10px_24px_rgba(15,23,42,0.12)] dark:shadow-[0_12px_26px_rgba(0,0,0,0.28)]"
                      : "border-gray-200 hover:scale-[1.015] hover:border-gray-300 hover:shadow-[0_9px_22px_rgba(15,23,42,0.09)] dark:border-[var(--border)] dark:hover:border-white/25"
                  }`}
                  style={
                    isSelected
                      ? {
                          borderColor: theme.accent,
                          boxShadow: `0 0 0 1px ${theme.accent}, 0 10px 24px rgba(15, 23, 42, 0.12)`,
                        }
                      : undefined
                  }
                >
                  <span
                    aria-hidden="true"
                    className="relative block h-[72px] overflow-hidden rounded-lg"
                    style={{ background: theme.gradient }}
                  >
                    <span className="absolute -right-3 -top-6 h-16 w-16 rounded-full bg-white/25 blur-sm" />
                    <span className="absolute bottom-2 left-2 h-2.5 w-[52%] rounded-full bg-white/90 shadow-sm" />
                    <span className="absolute bottom-2 right-2 h-2.5 w-[24%] rounded-full bg-white/55" />
                  </span>

                  <span className="flex items-start justify-between gap-2 px-1 pb-0.5 pt-3">
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-bold">{theme.label}</span>
                      <span className="mt-0.5 block truncate text-[10px] font-medium text-gray-500 dark:text-gray-300">
                        {theme.description}
                      </span>
                      <span className="mt-1 flex items-center gap-1.5" aria-hidden="true">
                        {theme.swatches.map((color, index) => (
                          <span
                            key={`${theme.id}-${color}-${index}`}
                            className="h-2.5 w-2.5 rounded-full ring-1 ring-black/10 dark:ring-white/20"
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </span>
                    </span>
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-[transform,opacity] duration-200 ${
                        isSelected ? "scale-100 opacity-100" : "scale-75 opacity-0"
                      }`}
                      style={{ backgroundColor: theme.accent, color: theme.onAccent }}
                      aria-hidden="true"
                    >
                      <Check className="h-3.5 w-3.5" strokeWidth={3} />
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {selectedTheme && (
            <div className="mt-5 overflow-hidden rounded-xl border border-gray-200 bg-gray-50 dark:border-[var(--border)] dark:bg-black/10">
              <div className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400 dark:text-gray-400">
                    Live preview
                  </p>
                  <p className="mt-0.5 truncate text-[13px] font-semibold">
                    {selectedTheme.label} workspace
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className="h-2.5 w-16 rounded-full"
                    style={{
                      background: `linear-gradient(90deg, ${selectedTheme.swatches[0]}, var(--theme-accent, ${selectedTheme.accent}))`,
                    }}
                  />
                  <span
                    className="rounded-lg px-3 py-1.5 text-[11px] font-bold text-white shadow-sm"
                    style={{
                      backgroundColor: `var(--theme-accent, ${selectedTheme.accent})`,
                      color: selectedTheme.onAccent,
                    }}
                  >
                    Action
                  </span>
                </div>
              </div>
              <div className="h-1" style={{ background: selectedTheme.gradient }} />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
