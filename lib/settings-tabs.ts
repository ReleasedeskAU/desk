/**
 * Settings left-nav tabs — single source for UI + voice explain/tour.
 * Icon-free so voice can import without lucide.
 */

export type SettingsTabDef = {
  id: string;
  label: string;
  /** One-line purpose for explain_page / current_page tour. */
  summary: string;
};

/**
 * Canonical Settings tabs (order matches the Settings page sidebar).
 */
export const SETTINGS_TABS: readonly SettingsTabDef[] = [
  {
    id: "general",
    label: "General",
    summary: "Workspace-level preferences (module still growing).",
  },
  {
    id: "appearance",
    label: "Appearance",
    summary: "Theme and visual preferences for the shell.",
  },
  {
    id: "risk-engine",
    label: "Risk Engine",
    summary: "Simple/weighted risk bands and score cutoffs used across Risk views.",
  },
  {
    id: "team",
    label: "Team Members",
    summary: "Who has access to this workspace and their roles.",
  },
  {
    id: "departments",
    label: "Departments",
    summary: "Master-data departments used on releases and filters.",
  },
  {
    id: "applications",
    label: "Applications",
    summary: "Master-data applications linked to releases and bookings.",
  },
  {
    id: "environments",
    label: "Environments",
    summary: "Environment catalog for booking and deployment context.",
  },
  {
    id: "users",
    label: "Users",
    summary: "User directory used for ownership and assignments.",
  },
  {
    id: "notifications",
    label: "Notifications",
    summary: "Notification preferences (module still growing).",
  },
  {
    id: "integrations",
    label: "Integrations",
    summary: "Integrations including Release Desk Voice usage ceilings.",
  },
  {
    id: "security",
    label: "Security",
    summary: "Security settings (module still growing).",
  },
];

export const SETTINGS_TAB_IDS: ReadonlySet<string> = new Set(
  SETTINGS_TABS.map((t) => t.id)
);

/**
 * Build a Settings deep-link for a tab id.
 * @param tabId - Settings tab id (team omits ?tab=).
 */
export function settingsHrefForTab(tabId: string): string {
  if (tabId === "team") return "/settings";
  return `/settings?tab=${encodeURIComponent(tabId)}`;
}
