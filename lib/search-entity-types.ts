/**
 * Canonical searchable / voice-filterable entity kinds.
 * Keep tool-manifest, spoken-query, and search filters aligned with this list.
 */

export const SEARCH_ENTITY_TYPES = [
  "release",
  "risk",
  "application",
  "blocker",
  "drift",
  "approval",
  "incident",
  "booking",
  "conflict",
  "dependency",
  "leave",
  "alert",
  "maintenance",
  "flow",
  "department",
  "user",
  "environment",
  "version",
  "risk-factor",
  "status",
] as const;

export type SearchEntityType = (typeof SEARCH_ENTITY_TYPES)[number];

/** SearchResult.type — extends legacy release|ticket|change with domain kinds. */
export type SearchResultType = SearchEntityType | "ticket" | "change";

/** href prefix for voice entityType filter. */
export const ENTITY_HREF_PREFIX: Record<string, string> = {
  release: "/releases",
  risk: "/risks",
  application: "/applications",
  blocker: "/blockers",
  drift: "/drifts",
  approval: "/approvals",
  incident: "/incidents",
  booking: "/booking",
  conflict: "/conflicts",
  dependency: "/dependencies",
  leave: "/leaves",
  alert: "/monitoring-alerts",
  maintenance: "/planned-maintenance",
  flow: "/integration-flows",
  department: "/departments",
  user: "/users",
  environment: "/environments",
  version: "/environments/versions",
  "risk-factor": "/risk-factors",
  status: "/application-status",
};

/** Human labels for ordinal prompts. */
export const ENTITY_VOICE_LABEL: Record<string, string> = {
  release: "Release",
  risk: "Risk",
  application: "Application",
  blocker: "Blocker",
  drift: "Drift",
  approval: "Approval",
  incident: "Incident",
  booking: "Env booking",
  conflict: "Conflict",
  dependency: "Dependency",
  leave: "Leave",
  alert: "Monitoring alert",
  maintenance: "Planned maintenance",
  flow: "Integration flow",
  department: "Department",
  user: "User",
  environment: "Environment",
  version: "Environment version",
  "risk-factor": "Risk factor",
  status: "Application status",
};
