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
];

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
    ? `You can filter here with apply_list_filters using keys like ${filterPage.commonKeys.slice(0, 6).join(", ")}.`
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
