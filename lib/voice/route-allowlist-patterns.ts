/**
 * Detail / nested App Router path patterns for voice navigate_to.
 * Kept separate from the sidebar registry so nav-agent and allowlist share one list.
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
