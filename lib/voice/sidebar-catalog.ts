/**
 * Sidebar navigation catalog for voice — sections, labels, routes, and spoken synonyms.
 * Kept icon-free (unlike lib/navigation.ts) so the voice client chunk stays light.
 *
 * When the user says “calendar tab”, “env booking page”, or a near-miss path like
 * `/bookings`, resolveVoiceNavTarget maps it to the real allowlisted href.
 */

export type VoiceSidebarItem = {
  /** Canonical App Router path. */
  href: string;
  /** Sidebar label as shown in the UI. */
  label: string;
  /** Optional section title from the left nav. */
  section: string;
  /** Extra spoken / typed phrases that must resolve to href. */
  synonyms: readonly string[];
};

/**
 * Full product sidebar inventory (mirrors NAV_SECTIONS in lib/navigation.ts).
 */
export const VOICE_SIDEBAR_CATALOG: readonly VoiceSidebarItem[] = [
  {
    href: "/inbox",
    label: "Morning Inbox",
    section: "Top",
    synonyms: ["inbox", "morning inbox", "morning tab"],
  },
  {
    href: "/dashboard",
    label: "Dashboard",
    section: "Top",
    synonyms: ["dashboard", "home", "home page", "main dashboard"],
  },
  {
    href: "/releases",
    label: "Releases",
    section: "Release Desk",
    synonyms: ["releases", "release list", "release desk releases"],
  },
  {
    href: "/calendar",
    label: "Calendar",
    section: "Release Desk",
    synonyms: ["calendar", "release calendar", "calender", "schedule"],
  },
  {
    href: "/booking",
    label: "Env Booking",
    section: "Release Desk",
    synonyms: [
      "env booking",
      "environment booking",
      "booking",
      "bookings",
      "env book",
      "environment book",
      "uat booking",
    ],
  },
  {
    href: "/dependencies",
    label: "Dependencies",
    section: "Release Desk",
    synonyms: ["dependencies", "dependency", "deps"],
  },
  {
    href: "/conflicts",
    label: "Conflicts",
    section: "Release Desk",
    synonyms: ["conflicts", "conflict list"],
  },
  {
    href: "/blockers",
    label: "Blockers",
    section: "Release Desk",
    synonyms: ["blockers", "blocker list"],
  },
  {
    href: "/system-mapping",
    label: "System Mapping",
    section: "Release Desk",
    synonyms: ["system mapping", "sys mapping", "mapping"],
  },
  {
    href: "/integration-flows",
    label: "Integration Flows",
    section: "Release Desk",
    synonyms: ["integration flows", "flows", "integration flow"],
  },
  {
    href: "/environments",
    label: "Versions & Config",
    section: "Release Desk",
    synonyms: [
      "versions and config",
      "versions & config",
      "environments",
      "env config",
      "versions",
    ],
  },
  {
    href: "/risks",
    label: "Risk",
    section: "Governance",
    synonyms: ["risk", "risks", "risk register"],
  },
  {
    href: "/drifts",
    label: "Drift Dashboard",
    section: "Governance",
    synonyms: ["drift", "drifts", "drift dashboard"],
  },
  {
    href: "/approvals",
    label: "Approval Queue",
    section: "Governance",
    synonyms: ["approvals", "approval queue", "approval tab"],
  },
  {
    href: "/leaves",
    label: "Leave Calendar",
    section: "Governance",
    synonyms: ["leave calendar", "leaves", "leave"],
  },
  {
    href: "/monitoring-alerts",
    label: "Monitoring Alerts",
    section: "Monitoring",
    synonyms: ["monitoring alerts", "alerts", "monitoring"],
  },
  {
    href: "/incidents",
    label: "Incidents",
    section: "Monitoring",
    synonyms: ["incidents", "incident list"],
  },
  {
    href: "/application-status",
    label: "Application Status",
    section: "Monitoring",
    synonyms: ["application status", "app status"],
  },
  {
    href: "/planned-maintenance",
    label: "Planned Maintenance",
    section: "Monitoring",
    synonyms: ["planned maintenance", "maintenance"],
  },
  {
    href: "/executive",
    label: "Executive",
    section: "Portfolio",
    synonyms: ["executive", "exec"],
  },
  {
    href: "/compare",
    label: "Compare",
    section: "Portfolio",
    synonyms: ["compare"],
  },
  {
    href: "/insights",
    label: "Insights",
    section: "Portfolio",
    synonyms: ["insights"],
  },
  {
    href: "/departments",
    label: "Departments",
    section: "Master Data",
    synonyms: ["departments", "depts"],
  },
  {
    href: "/applications",
    label: "Applications",
    section: "Master Data",
    synonyms: ["applications", "apps"],
  },
  {
    href: "/users",
    label: "Users",
    section: "Master Data",
    synonyms: ["users", "user list"],
  },
  {
    href: "/risk-factors",
    label: "Risk Factors",
    section: "Master Data",
    synonyms: ["risk factors"],
  },
  {
    href: "/lifecycle",
    label: "Lifecycle Settings",
    section: "Lifecycle",
    synonyms: [
      "lifecycle",
      "lifecycle settings",
      "release lifecycle",
      "blocker lifecycle",
      "approval lifecycle",
      "sign-off lifecycle",
      "signoff lifecycle",
      "risk lifecycle",
      "incident lifecycle",
      "dependency lifecycle",
      "conflict lifecycle",
      "drift lifecycle",
      "config drift lifecycle",
      "alert lifecycle",
      "alerts lifecycle",
      "monitoring alert lifecycle",
    ],
  },
  {
    href: "/knowledge-graph",
    label: "Knowledge Graph",
    section: "Operations",
    synonyms: ["knowledge graph", "kg"],
  },
  {
    href: "/agents",
    label: "Agents",
    section: "Operations",
    synonyms: ["agents"],
  },
  {
    href: "/history",
    label: "History Log",
    section: "Operations",
    synonyms: ["history", "history log"],
  },
  {
    href: "/connectors",
    label: "Connectors",
    section: "Operations",
    synonyms: ["connectors"],
  },
  {
    href: "/admin/reference-data",
    label: "Reference Data",
    section: "Operations",
    synonyms: ["reference data"],
  },
  {
    href: "/settings",
    label: "Settings",
    section: "Operations",
    synonyms: ["settings", "preferences"],
  },
] as const;

/**
 * Common wrong / alternate paths the model or user may invent.
 * Always resolve to the canonical href before allowlist checks.
 */

export const VOICE_PATH_ALIASES: Readonly<Record<string, string>> = {
  "/bookings": "/booking",
  "/env-booking": "/booking",
  "/envbooking": "/booking",
  "/environment-booking": "/booking",
  "/environment-bookings": "/booking",
  "/calender": "/calendar",
  "/release": "/releases",
  "/blocker": "/blockers",
  "/conflict": "/conflicts",
  "/dependency": "/dependencies",
  "/approval": "/approvals",
  "/alert": "/monitoring-alerts",
  "/alerts": "/monitoring-alerts",
  "/incident": "/incidents",
  "/risk": "/risks",
  "/drift": "/drifts",
  "/home": "/dashboard",
};

const FILLER_RE =
  /^(?:please\s+)?(?:open|go\s+to|goto|show|navigate\s+to|take\s+me\s+to|switch\s+to)\s+/i;
const SURFACE_RE =
  /\b(?:page|tab|section|screen|view|menu|link|area)\b/gi;

/**
 * Normalize spoken / typed nav language for catalog matching.
 * @param raw - User or model phrase (may include “tab”/“page”).
 */
export function normalizeSpokenNavPhrase(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(FILLER_RE, "")
    .replace(SURFACE_RE, " ")
    .replace(/^(?:the|a|an)\s+/i, "")
    .replace(/[_/]+/g, " ")
    .replace(/[^a-z0-9\s&-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Resolve a spoken name, label, synonym, or near-miss path to a sidebar href.
 * @param raw - e.g. "calendar tab", "env booking page", "/bookings".
 * @returns Canonical path + label, or null if unknown.
 */
export function resolveVoiceNavTarget(
  raw: string
): { path: string; label: string; section: string } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Path-shaped input (with optional alias).
  if (trimmed.startsWith("/") || /^https?:\/\//i.test(trimmed)) {
    let pathname = trimmed;
    try {
      if (/^https?:\/\//i.test(trimmed)) pathname = new URL(trimmed).pathname;
    } catch {
      return null;
    }
    pathname = pathname.split(/[?#]/)[0] ?? pathname;
    if (pathname.length > 1 && pathname.endsWith("/")) {
      pathname = pathname.slice(0, -1);
    }
    const aliased = VOICE_PATH_ALIASES[pathname.toLowerCase()] ?? pathname;
    const hit = VOICE_SIDEBAR_CATALOG.find((i) => i.href === aliased);
    if (hit) return { path: hit.href, label: hit.label, section: hit.section };
    // Non-sidebar but may still be an allowlisted detail path — return as-is.
    if (aliased.startsWith("/")) {
      return { path: aliased, label: aliased, section: "" };
    }
    return null;
  }

  const phrase = normalizeSpokenNavPhrase(trimmed);
  if (!phrase) return null;

  for (const item of VOICE_SIDEBAR_CATALOG) {
    const keys = [
      item.label.toLowerCase(),
      ...item.synonyms.map((s) => s.toLowerCase()),
    ];
    for (const key of keys) {
      const nk = normalizeSpokenNavPhrase(key);
      if (phrase === nk || phrase === `${nk}s`) {
        return { path: item.href, label: item.label, section: item.section };
      }
    }
  }

  // Loose contains: "the env booking thing" → env booking
  for (const item of VOICE_SIDEBAR_CATALOG) {
    for (const syn of [item.label, ...item.synonyms]) {
      const nk = normalizeSpokenNavPhrase(syn);
      if (nk.length >= 4 && (phrase.includes(nk) || nk.includes(phrase))) {
        return { path: item.href, label: item.label, section: item.section };
      }
    }
  }

  return null;
}

/**
 * Full sidebar inventory for Live systemInstruction.
 * Built from VOICE_SIDEBAR_CATALOG so the model never “forgets” tabs that
 * resolveVoiceNavTarget can already open (truncated briefs caused false “I don’t know that tab”).
 */
export function voiceSidebarCatalogBrief(): string {
  const entries = VOICE_SIDEBAR_CATALOG.map(
    (i) => `${i.label}=${i.href}`
  ).join("; ");
  return [
    "Sidebar tabs (ALL navigable via navigate_to with label or synonym):",
    `${entries}.`,
    "Aliases: bookings→/booking, calender→/calendar, versions and config→/environments, reference data→/admin/reference-data.",
    "tab/page/section mean the same. Never say you cannot open a listed sidebar tab — call navigate_to with the spoken name.",
  ].join(" ");
}
