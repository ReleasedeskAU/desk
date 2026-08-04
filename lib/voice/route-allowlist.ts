/**
 * Voice navigate_to allowlist.
 *
 * Static href/label pairs mirror lib/navigation.ts NAV_ITEMS (kept icon-free so
 * the voice client chunk does not pull lucide-react via navigation.ts).
 * Detail patterns match App Router pages under app/(main).
 *
 * Intentionally excludes /dev/*, auth routes, and anything not in the product shell.
 */

/** Sidebar routes — keep in sync with NAV_ITEMS in lib/navigation.ts. */
export const VOICE_NAV_ROUTES: readonly { href: string; label: string }[] = [
  { href: "/inbox", label: "Morning Inbox" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/releases", label: "Releases" },
  { href: "/calendar", label: "Calendar" },
  { href: "/booking", label: "Env Booking" },
  { href: "/dependencies", label: "Dependencies" },
  { href: "/conflicts", label: "Conflicts" },
  { href: "/blockers", label: "Blockers" },
  { href: "/system-mapping", label: "System Mapping" },
  { href: "/integration-flows", label: "Integration Flows" },
  { href: "/environments", label: "Versions & Config" },
  { href: "/risks", label: "Risk" },
  { href: "/drifts", label: "Drift Dashboard" },
  { href: "/approvals", label: "Approval Queue" },
  { href: "/leaves", label: "Leave Calendar" },
  { href: "/monitoring-alerts", label: "Monitoring Alerts" },
  { href: "/incidents", label: "Incidents" },
  { href: "/application-status", label: "Application Status" },
  { href: "/planned-maintenance", label: "Planned Maintenance" },
  { href: "/executive", label: "Executive" },
  { href: "/compare", label: "Compare" },
  { href: "/insights", label: "Insights" },
  { href: "/departments", label: "Departments" },
  { href: "/applications", label: "Applications" },
  { href: "/users", label: "Users" },
  { href: "/risk-factors", label: "Risk Factors" },
  { href: "/knowledge-graph", label: "Knowledge Graph" },
  { href: "/agents", label: "Agents" },
  { href: "/history", label: "History Log" },
  { href: "/connectors", label: "Connectors" },
  { href: "/admin/reference-data", label: "Reference Data" },
  { href: "/settings", label: "Settings" },
];

/** Exact paths from sidebar nav. */
export const VOICE_STATIC_ROUTES: readonly string[] = VOICE_NAV_ROUTES.map((i) => i.href);

/**
 * Path patterns for detail / nested pages that exist in the App Router
 * but are not listed as top-level nav hrefs.
 * `:id` matches a single non-empty path segment.
 */
export const VOICE_DYNAMIC_ROUTE_PATTERNS: readonly string[] = [
  "/releases/:id",
  "/releases/:id/dependencies",
  "/booking/:id",
  "/dependencies/:id",
  "/conflicts/:id",
  "/blockers/:id",
  "/integration-flows/:id",
  "/environments/versions/:id",
  "/risks/:id",
  "/drifts/:id",
  "/approvals/:id",
  "/leaves/:id",
  "/monitoring-alerts/:id",
  "/incidents/:id",
  "/planned-maintenance/:id",
  "/admin/users",
];

const DYNAMIC_REGEXES: readonly { pattern: string; re: RegExp }[] =
  VOICE_DYNAMIC_ROUTE_PATTERNS.map((pattern) => ({
    pattern,
    re: patternToRegex(pattern),
  }));

/**
 * Convert `/releases/:id` → `/^\/releases\/[^/]+\/?$/`.
 * @param pattern - Allowlist pattern with optional `:param` segments.
 */
export function patternToRegex(pattern: string): RegExp {
  const body = pattern
    .split("/")
    .map((seg) => {
      if (!seg) return "";
      if (seg.startsWith(":")) return "[^/]+";
      return seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/");
  return new RegExp(`^${body}/?$`);
}

/**
 * Normalize a candidate path for allowlist matching.
 * Strips query/hash, ensures leading slash, rejects traversal.
 * @returns Normalized pathname or null if unusable.
 */
export function normalizeVoicePath(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let pathname: string;
  try {
    if (/^https?:\/\//i.test(trimmed)) {
      pathname = new URL(trimmed).pathname;
    } else {
      pathname = trimmed.split(/[?#]/)[0] ?? "";
    }
  } catch {
    return null;
  }
  if (!pathname.startsWith("/")) pathname = `/${pathname}`;
  if (pathname.includes("..") || pathname.includes("//")) return null;
  if (pathname.length > 1 && pathname.endsWith("/")) {
    pathname = pathname.slice(0, -1);
  }
  return pathname;
}

/**
 * Whether `path` is an allowed voice navigation target.
 * @param path - Candidate path (may include query; normalized first).
 */
export function isAllowedVoicePath(path: string): boolean {
  const normalized = normalizeVoicePath(path);
  if (!normalized) return false;
  if ((VOICE_STATIC_ROUTES as readonly string[]).includes(normalized)) return true;
  return DYNAMIC_REGEXES.some(({ re }) => re.test(normalized));
}

/**
 * Human-readable label for a path (nav label or last segment).
 * @param path - Allowed or candidate path.
 * @param label - Optional label from the tool call.
 */
export function labelForVoicePath(path: string, label?: string): string {
  if (label?.trim()) return label.trim();
  const normalized = normalizeVoicePath(path) ?? path;
  const nav = VOICE_NAV_ROUTES.find((i) => i.href === normalized);
  if (nav) return nav.label;
  const parts = normalized.split("/").filter(Boolean);
  const last = parts[parts.length - 1] ?? "page";
  return decodeURIComponent(last).replace(/[-_]+/g, " ");
}

/** Full allowlist inventory for audits / proof. */
export function listVoiceAllowlistEntries(): {
  staticRoutes: string[];
  dynamicPatterns: string[];
} {
  return {
    staticRoutes: [...VOICE_STATIC_ROUTES],
    dynamicPatterns: [...VOICE_DYNAMIC_ROUTE_PATTERNS],
  };
}
