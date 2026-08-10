/**
 * Voice navigate_to allowlist.
 *
 * Static sidebar routes are derived from the navigation agent registry
 * (lib/nav-data.ts → listSidebarNavRoutes). Detail patterns live in
 * route-allowlist-patterns.ts.
 */

import { listSidebarNavRoutes, normalizeNavPath } from "@/lib/voice/nav-agent";
import { VOICE_DYNAMIC_ROUTE_PATTERNS } from "@/lib/voice/route-allowlist-patterns";

/** Sidebar routes — derived from nav registry (not a duplicated hardcoded list). */
export function getVoiceNavRoutes(): readonly { href: string; label: string }[] {
  return listSidebarNavRoutes();
}

/** @deprecated Use getVoiceNavRoutes() — kept as a snapshot getter for older imports. */
export const VOICE_NAV_ROUTES: readonly { href: string; label: string }[] =
  listSidebarNavRoutes();

/** Exact paths from sidebar nav (+ extras). */
export function getVoiceStaticRoutes(): readonly string[] {
  return listSidebarNavRoutes().map((i) => i.href);
}

export const VOICE_STATIC_ROUTES: readonly string[] = listSidebarNavRoutes().map(
  (i) => i.href
);

export { VOICE_DYNAMIC_ROUTE_PATTERNS };

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
 * Strips query/hash, collapses `//`, ensures leading slash, rejects traversal.
 * @returns Normalized pathname or null if unusable.
 */
export function normalizeVoicePath(raw: string): string | null {
  return normalizeNavPath(raw);
}

/**
 * Whether `path` is an allowed voice navigation target.
 * @param path - Candidate path (may include query; normalized first).
 */
export function isAllowedVoicePath(path: string): boolean {
  const normalized = normalizeVoicePath(path);
  if (!normalized) return false;
  if (getVoiceStaticRoutes().includes(normalized)) return true;
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
  const nav = getVoiceNavRoutes().find((i) => i.href === normalized);
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
    staticRoutes: [...getVoiceStaticRoutes()],
    dynamicPatterns: [...VOICE_DYNAMIC_ROUTE_PATTERNS],
  };
}
