/**
 * Page explain catalog — professional release-manager briefing for each shell page.
 * Used by explain_page (no screen share required).
 */
import { normalizeVoicePath } from "@/lib/voice/route-allowlist";
import { resolveVoiceNavTarget } from "@/lib/voice/sidebar-catalog";
import { findFilterPageForPathname } from "@/lib/voice/list-filters-catalog";

export type VoicePageExplain = {
  path: string;
  title: string;
  /** What this page is for (release-manager framing). */
  purpose: string;
  /** What the user can do here with voice. */
  canDo: string[];
  /** Typical next steps / related pages. */
  nextSteps: string[];
};

const PAGES: readonly VoicePageExplain[] = [
  {
    path: "/inbox",
    title: "Morning Inbox",
    purpose:
      "Daily briefing surface — what needs attention first: blockers, approvals, conflicts, and upcoming go-lives.",
    canDo: [
      "Ask what is urgent today",
      "Open a related list (blockers, approvals, conflicts)",
      "Search a release and ask if it is ready or blocked",
    ],
    nextSteps: ["Open Blockers or Approvals", "Ask for a release readiness summary"],
  },
  {
    path: "/dashboard",
    title: "Dashboard",
    purpose:
      "Portfolio health overview — counts and signals across releases, risks, and operational issues.",
    canDo: [
      "Navigate to a deep list for investigation",
      "Search a release and ask why it is blocked or ready",
      "Walk through critical blockers",
    ],
    nextSteps: ["Releases", "Blockers", "Risks"],
  },
  {
    path: "/releases",
    title: "Releases",
    purpose:
      "Master release register — status, readiness, conflicts, and ownership for every change going to production.",
    canDo: [
      "Filter by status, priority, department, or hasBlockers",
      "Open a release and get a readiness verdict (ready / blocked / at risk)",
      "Ask why a release is blocked",
    ],
    nextSteps: ["Blockers", "Approvals", "Env Booking", "Conflicts"],
  },
  {
    path: "/calendar",
    title: "Calendar",
    purpose:
      "Go-live and change calendar — when releases, freezes, and maintenance land on the timeline.",
    canDo: [
      "Filter by department or date range",
      "Open related releases from the table",
      "Check for change freeze / vendor maintenance collisions",
    ],
    nextSteps: ["Releases", "Planned Maintenance"],
  },
  {
    path: "/booking",
    title: "Env Booking",
    purpose:
      "Environment booking board — who has which env, and whether bookings conflict.",
    canDo: [
      "Filter by app, env, or conflict",
      "Open a booking and relate it to its release",
      "Find conflicted bookings that threaten go-live",
    ],
    nextSteps: ["Conflicts", "Releases"],
  },
  {
    path: "/blockers",
    title: "Blockers",
    purpose:
      "Active impediments preventing releases from going live — severity, owner, and linked release.",
    canDo: [
      "Filter by severity, status, or release",
      "Open a blocker detail",
      "Ask which release a blocker is holding",
    ],
    nextSteps: ["Releases", "Risks"],
  },
  {
    path: "/conflicts",
    title: "Conflicts",
    purpose:
      "Environment and schedule conflicts between releases that must be resolved before go-live.",
    canDo: ["Filter by status or app", "Open a conflict and linked releases"],
    nextSteps: ["Env Booking", "Releases"],
  },
  {
    path: "/dependencies",
    title: "Dependencies",
    purpose: "Upstream/downstream release dependencies that can cascade delays.",
    canDo: ["Filter by status or type", "Trace a dependency chain via search"],
    nextSteps: ["Releases", "Blockers"],
  },
  {
    path: "/risks",
    title: "Risk",
    purpose:
      "Risk register — likelihood, impact, and owners for threats to release success.",
    canDo: ["Filter by band, status, or release", "Open a risk and link to release readiness"],
    nextSteps: ["Releases", "Blockers"],
  },
  {
    path: "/approvals",
    title: "Approval Queue",
    purpose:
      "CAB / approval decisions waiting — approve or acknowledge only after explicit confirmation.",
    canDo: [
      "Filter by decision or type",
      "Propose an approval decision (then confirm with yes)",
      "Ask which releases are waiting on approval",
    ],
    nextSteps: ["Releases"],
  },
  {
    path: "/drifts",
    title: "Drift Dashboard",
    purpose: "Config/version drift that can break promotions or UAT fidelity.",
    canDo: ["Filter by severity or app", "Open a drift linked to a release"],
    nextSteps: ["Versions & Config", "Releases"],
  },
  {
    path: "/monitoring-alerts",
    title: "Monitoring Alerts",
    purpose: "Live ops alerts — acknowledge only after you confirm.",
    canDo: ["Filter by severity or status", "Propose acknowledge_alert then confirm"],
    nextSteps: ["Incidents", "Application Status"],
  },
  {
    path: "/incidents",
    title: "Incidents",
    purpose: "Production/incident records that may freeze or reverse a release decision.",
    canDo: ["Filter by severity or status", "Relate an incident to a release via search"],
    nextSteps: ["Monitoring Alerts", "Releases"],
  },
  {
    path: "/executive",
    title: "Executive",
    purpose: "Leadership view of portfolio risk and go-live readiness at a glance.",
    canDo: ["Drill into Releases, Blockers, or Risks for evidence"],
    nextSteps: ["Dashboard", "Releases"],
  },
  {
    path: "/system-mapping",
    title: "System Mapping",
    purpose:
      "Visual map of applications, environments, and how they connect for change impact.",
    canDo: [
      "Open related apps or environments",
      "Search an application and ask what releases touch it",
    ],
    nextSteps: ["Applications", "Integration Flows", "Versions & Config"],
  },
  {
    path: "/integration-flows",
    title: "Integration Flows",
    purpose: "End-to-end integration paths between systems that releases can disrupt.",
    canDo: [
      "Filter or open a flow",
      "Relate a flow to apps and releases via search",
    ],
    nextSteps: ["System Mapping", "Applications", "Conflicts"],
  },
  {
    path: "/environments",
    title: "Versions & Config",
    purpose:
      "Environment versions and config baselines used for booking and promotion fidelity.",
    canDo: [
      "Inspect env/version state",
      "Jump to Env Booking or Drift when versions diverge",
    ],
    nextSteps: ["Env Booking", "Drift Dashboard", "System Mapping"],
  },
  {
    path: "/leaves",
    title: "Leave Calendar",
    purpose:
      "People availability that can delay approvals, UAT, or go-live coverage.",
    canDo: [
      "Check who is out around a go-live date",
      "Cross-check owners on critical releases",
    ],
    nextSteps: ["Calendar", "Approvals", "Releases"],
  },
  {
    path: "/application-status",
    title: "Application Status",
    purpose:
      "Operational health of applications that may freeze or reverse a release.",
    canDo: [
      "Filter by status or app",
      "Relate status to monitoring alerts and incidents",
    ],
    nextSteps: ["Monitoring Alerts", "Incidents", "Applications"],
  },
  {
    path: "/planned-maintenance",
    title: "Planned Maintenance",
    purpose:
      "Scheduled maintenance windows that collide with go-lives and env bookings.",
    canDo: [
      "Find maintenance near a release date",
      "Open Calendar to see collisions",
    ],
    nextSteps: ["Calendar", "Env Booking", "Releases"],
  },
  {
    path: "/compare",
    title: "Compare",
    purpose:
      "Side-by-side comparison of releases or change sets before a go decision.",
    canDo: [
      "Ask to compare two releases (compare_releases)",
      "Open either release for readiness",
    ],
    nextSteps: ["Releases", "Executive"],
  },
  {
    path: "/insights",
    title: "Insights",
    purpose:
      "Analytics, predictive forecasts, and trend patterns across the release portfolio.",
    canDo: [
      "Drill into Releases, Risks, or Blockers for evidence behind a trend",
      "Ask what needs attention via get_attention_brief",
    ],
    nextSteps: ["Executive", "Dashboard", "Releases"],
  },
  {
    path: "/departments",
    title: "Departments",
    purpose:
      "Master list of departments used for ownership and filtering across Release Desk.",
    canDo: [
      "Open a department",
      "Filter releases or blockers by department on list pages",
    ],
    nextSteps: ["Users", "Releases", "Applications"],
  },
  {
    path: "/applications",
    title: "Applications",
    purpose:
      "Application catalog — systems touched by releases, bookings, and conflicts.",
    canDo: [
      "Open an application",
      "Search conflicts or releases for an app name",
    ],
    nextSteps: ["Conflicts", "Env Booking", "System Mapping"],
  },
  {
    path: "/users",
    title: "Users",
    purpose: "People and roles who own approvals, blockers, and release work.",
    canDo: [
      "Find an owner",
      "Relate a user to Approvals or Leave Calendar",
    ],
    nextSteps: ["Departments", "Approvals", "Leave Calendar"],
  },
  {
    path: "/risk-factors",
    title: "Risk Factors",
    purpose: "Reusable risk factor definitions that feed the risk register.",
    canDo: [
      "Browse factors",
      "Open Risks to see live scored risks on releases",
    ],
    nextSteps: ["Risk", "Releases"],
  },
  {
    path: "/knowledge-graph",
    title: "Knowledge Graph",
    purpose:
      "Relationship graph across releases, apps, and dependencies for impact analysis.",
    canDo: [
      "Explore linked entities",
      "Search a release and ask what depends on it",
    ],
    nextSteps: ["Dependencies", "System Mapping", "Releases"],
  },
  {
    path: "/agents",
    title: "Agents",
    purpose:
      "Agent control room — AI agents watching releases, connectors, and deployments.",
    canDo: [
      "Review which agents are active or paused",
      "Return to operational lists for release work",
    ],
    nextSteps: ["Settings", "Dashboard"],
  },
  {
    path: "/history",
    title: "History Log",
    purpose:
      "Audit trail of system actions and release cycles across the workspace.",
    canDo: [
      "Scan recent activity",
      "Open a related release or entity via search",
    ],
    nextSteps: ["Releases", "Connectors"],
  },
  {
    path: "/connectors",
    title: "Connectors",
    purpose:
      "External system connectors that sync tickets, alerts, or change data into Release Desk.",
    canDo: [
      "Check connector health",
      "Relate synced entities back to releases via search",
    ],
    nextSteps: ["History Log", "Reference Data", "Settings"],
  },
  {
    path: "/admin/reference-data",
    title: "Reference Data",
    purpose:
      "Admin reference values (statuses, types, lookups) that drive filters and forms.",
    canDo: [
      "Review lookup values",
      "Avoid inventing filter values — use spoken names from lists",
    ],
    nextSteps: ["Settings", "Connectors"],
  },
  {
    path: "/settings",
    title: "Settings",
    purpose:
      "Workspace and user preferences, including voice usage where enabled.",
    canDo: [
      "Review preferences",
      "Check voice usage ceilings if available",
    ],
    nextSteps: ["Users", "Reference Data"],
  },
];

/** Exported for drift tests against VOICE_SIDEBAR_CATALOG. */
export const VOICE_PAGE_EXPLAIN_CATALOG = PAGES;

const BY_PATH = new Map(PAGES.map((p) => [p.path, p]));

/**
 * Resolve a page explain entry from a path hint or current href.
 */
export function resolveVoicePageExplain(
  raw?: string,
  currentHref?: string
): VoicePageExplain | null {
  const candidates: string[] = [];
  if (raw?.trim()) {
    const spoken = resolveVoiceNavTarget(raw.trim());
    if (spoken?.path) candidates.push(spoken.path);
    candidates.push(raw.trim());
  }
  if (currentHref?.trim()) candidates.push(currentHref.trim());

  for (const c of candidates) {
    const pathname = normalizeVoicePath(c.split(/[?#]/)[0] ?? c);
    if (!pathname) continue;
    const parts = pathname.split("/").filter(Boolean);
    for (let len = parts.length; len >= 1; len--) {
      const candidate = `/${parts.slice(0, len).join("/")}`;
      const hit = BY_PATH.get(candidate);
      if (hit) return hit;
    }
  }
  return null;
}

/**
 * Build spoken explain text for a page (optionally noting active filters).
 */
export function formatPageExplainSpeech(
  page: VoicePageExplain,
  opts?: { activeQuery?: string }
): string {
  const filterPage = findFilterPageForPathname(page.path);
  const filterHint = filterPage
    ? `You can filter/sort here with apply_list_filters using keys like ${filterPage.commonKeys.slice(0, 6).join(", ")}, plus sort and dir. Manage Columns/Filters via configure_table_view; scroll with scroll_page; open a row with navigate_to after search_entity.`
    : null;
  const active =
    opts?.activeQuery && opts.activeQuery.length > 1
      ? `Current URL filters: ${opts.activeQuery.replace(/^\?/, "")}.`
      : null;

  return [
    `${page.title}: ${page.purpose}`,
    `With voice you can: ${page.canDo.slice(0, 3).join("; ")}.`,
    filterHint,
    active,
    `Typical next: ${page.nextSteps.slice(0, 3).join(", ")}.`,
    "Ask about a release by code or name and I will say whether it is ready, blocked, or at risk — and why.",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Compact brief for Live systemInstruction.
 */
export function voicePageExplainBrief(): string {
  return [
    "explain_page: brief the current (or named) page like a release manager — purpose, what voice can do, filters, next steps. No screen share required.",
    "For release readiness / why blocked / why ready: search_entity then get_summary (verdict + reasons).",
    "run_walkthrough: guided multi-step tours (critical blockers, release readiness, pending approvals, conflicts).",
  ].join(" ");
}
