/**
 * Per-page embedded documentation for Release Desk "orange tab" screens.
 * Quick Reference summaries reuse / extend copy from lib/page-guide.ts where available.
 */

export type PageDocKey =
  | "releases"
  | "calendar"
  | "env-booking"
  | "dependencies"
  | "conflicts"
  | "blockers"
  | "system-mapping"
  | "environments"
  | "risks"
  | "risk-factors"
  | "drifts"
  | "approvals"
  | "leaves"
  | "monitoring-alerts"
  | "incidents"
  | "application-status"
  | "planned-maintenance"
  | "integration-flows"
  | "departments"
  | "applications"
  | "users"
  | "reference-data";

export type PageDocumentationEntry = {
  pageKey: PageDocKey;
  title: string;
  /** Short page-purpose blurb (~2 sentences) shown under the title on table pages. */
  summary: string;
  quickReference: string[];
  fullDocumentation: string[];
};

const CATEGORY_WEIGHTS_VERIFIED =
  "Technical Complexity 18%, Testing Quality 26%, Security & Compliance 8%, Data Migration 4%, Resource & Schedule 14%, Env & Dependencies 9%, Operational Readiness 10%, Performance & Scalability 4%, Release History 5%, Business Criticality 2%.";

export const PAGE_DOCUMENTATION: Record<PageDocKey, PageDocumentationEntry> = {
  releases: {
    pageKey: "releases",
    title: "Releases",
    summary:
      "Central register of every release in flight — database-backed REL- rows and demo command-center releases. Filter, sort, and open a release to manage readiness, blockers, bookings, and CAB gates in one place.",
    quickReference: [
      "Master list of database releases (editable) and demo command-center releases.",
      "Filter by department, application, environment, status, priority, and impact.",
      "Sort by Release ID, target date, readiness, or blockers.",
      "DB rows are editable; open a release code to view its command center.",
      "Use Needs attention to focus on blocked or at-risk releases.",
    ],
    fullDocumentation: [
      "The Releases page is the central register for everything in flight. Database-backed releases (REL- codes) support create, edit, and delete for editors; each row links to a live release detail view with readiness, live blockers, drift, dependencies, and approvals.",
      "The shared filter bar scopes the list to a department, application, or environment. Column visibility is saved per user — hide non-essential columns via the Columns picker without affecting other team members.",
      "Readiness is computed from live desk data (bookings, dependencies, decision, P1 issues). Open blockers and drift on release detail come from the Blockers and Drift registers.",
    ],
  },
  calendar: {
    pageKey: "calendar",
    title: "Release Calendar",
    summary:
      "See CAB meetings, release dates, freezes, and governance events on one timeline. Switch Month, Timeline, or Table views — all share the same filters and period so you can plan around freezes without losing context.",
    quickReference: [
      "Three views: Month grid, Timeline, and Table — same filtered event set.",
      "Shows CAB meetings, release dates, freezes, and governance events.",
      "Filter by dept/app/env and change Month / Quarter / Year period.",
      "Click a release event to open its detail page.",
      "Table view lists Month, Week, Date, Event Type, Release ID, and notes.",
    ],
    fullDocumentation: [
      "The calendar reads CalendarEvent rows seeded from the source workbook — each CAB meeting and each release/deployment date is a separate event. The month grid colours events by type (RELEASE, CAB MEETING, CHANGE FREEZE, etc.).",
      "Timeline view plots filtered releases on a horizontal axis by target date. Year period uses a minimal dot-and-stem style (status-colored dots, thin stems, plain text labels) with density clustering for close dates; Expand View opens a fit-to-year popup with zoom and pan. Table view mirrors the Excel Calendar sheet columns including week-of-month (1–5) derived from the event date.",
      "All three views honour the same ReleaseFiltersBar filters and period navigation.",
    ],
  },
  "env-booking": {
    pageKey: "env-booking",
    title: "Environment Booking",
    summary:
      "Reserve TEST and UAT windows for releases across shared infrastructure. Spot overlapping bookings on the same environment before they become go-live blockers.",
    quickReference: [
      "Book TEST and UAT windows for releases across applications.",
      "Filter by department, application, environment, and conflict flag.",
      "Conflict flag highlights overlapping bookings on shared environments.",
      "Booking codes link to the underlying release where applicable.",
      "Columns mirror the Env Booking sheet — use the picker to hide fields.",
    ],
    fullDocumentation: [
      "Environment Booking is the operational schedule for shared infrastructure. Each row represents a reservation with test/UAT start and end dates, environment codes, and dependency notes from the seed workbook.",
      "The conflict flag is set when two bookings overlap on the same environment window — resolve these before approving a release for that env. Filters align with the rest of Release Desk so you can isolate a single application train.",
      "Editors manage bookings through the API; the table is read-only for readonly roles. Cross-check System Mapping before finalising dates that depend on downstream environments.",
    ],
  },
  dependencies: {
    pageKey: "dependencies",
    title: "Release Dependencies",
    summary:
      "Track and resolve dependency chains between releases. See which releases are blocked waiting on others to complete, and reassess dates when an upstream slip hits downstream work.",
    quickReference: [
      "Lists upstream/downstream release dependencies with status and impact.",
      "Filter by status (Open, Blocked, At Risk, etc.), type, and impact.",
      "Blocked or at-risk dependencies surface in the page subtitle count.",
      "Release and depends-on codes link to their release detail pages.",
      "Review before changing a release date — downstream releases may slip.",
    ],
    fullDocumentation: [
      "Dependencies encode which releases must complete before another can proceed. Each row shows the dependent release, what it waits on, dependency type, current status, and the business impact if the link is blocked.",
      "Status pills follow the same vocabulary as the source Dependencies sheet. Use filters to isolate Blocked or At Risk items during stand-up. The dependency graph on an individual release detail page shows the same relationships visually.",
      "When a upstream release slips, open its downstream dependents from this list and reassess CAB dates and environment bookings in the same filter scope.",
    ],
  },
  conflicts: {
    pageKey: "conflicts",
    title: "Conflict Resolution Queue",
    summary:
      "Triage environment and resource conflicts between concurrent releases — shared test beds, competing CAB slots, or capacity clashes. Clear open and escalated items before confirming bookings.",
    quickReference: [
      "Tracks environment and resource conflicts between concurrent releases.",
      "Filter by department, application, status, and priority.",
      "Open or Escalated conflicts are highlighted in the subtitle.",
      "Each conflict links to the two affected releases.",
      "Assignee and remediation notes drive resolution workflow.",
    ],
    fullDocumentation: [
      "The Conflict Queue is the triage desk for overlapping release activity — shared test environments, competing CAB slots, or resource contention. Rows are seeded from the Conflicts sheet with priority, status, and assigned owner.",
      "Use department and application filters to narrow to your train. High-priority open items should be cleared before env bookings are confirmed. Release ID columns navigate to each side of the conflict for context.",
      "Conflict status is independent of release readiness; a release can show Ready while a conflict row remains Open until explicitly resolved.",
    ],
  },
  blockers: {
    pageKey: "blockers",
    title: "Blockers",
    summary:
      "Track open release blockers from the Blockers sheet — severity, escalation, owners, and impact — so blocked work is visible across the portfolio before CAB and go-live.",
    quickReference: [
      "One row per Blocker ID from the V0.6 Blockers sheet (25 seed records).",
      "Filter by status, severity, type, department, assignee, and release.",
      "Release ID links to the related release detail page.",
      "Days Open and Escalation Level highlight aging critical items.",
      "Use Manage Columns / Manage Filters to tailor the triage view.",
    ],
    fullDocumentation: [
      "Blockers are first-class operational records, separate from the free-text Blockers column on Releases. Each row carries type, description, severity, raised/assigned owners, resolution dates, escalation, root cause, and release impact.",
      "Default filters surface status, severity, type, department, assignee, and release ID. Additional columns (description, dates, root cause, notes) are available via Manage Filters and Manage Columns, with search inside those pickers.",
      "This list is the source of truth for live blocker counts on release detail. Release detail loads Blockers via /api/blockers?release=…, supports + Add Blocker for editors, and shows the live Drift list for the same release.",
    ],
  },
  "system-mapping": {
    pageKey: "system-mapping",
    title: "System Mapping",
    summary:
      "Plan releases across the system catalog, a readable Visual Map (one system at a time), department matrix, shared environments, and critical paths. Keep release-manager notes in view and run real date-range booking-conflict checks without leaving the workspace.",
    quickReference: [
      "Systems Hub records system ownership, integration reach, data flow, and exchanged data.",
      "Visual Map: Knowledge-Graph-style canvas with Focus / All systems, legend filters, pan/zoom/minimap, and Expand for a full detail workspace.",
      "Department Matrix is an editable 8×8 view: Primary, Secondary, or None.",
      "Shared Environments supports server-side filters, sorting, and saved table preferences.",
      "Critical Paths capture coordinated upstream/downstream release sequences and blackout windows.",
      "The persistent sidebar shows all six release-manager notes and real booking-conflict analysis (hidden on Visual Map for width).",
    ],
    fullDocumentation: [
      "System Mapping is organized into operational tabs. Systems Hub and Critical Paths are database-backed catalogs with create, edit, and delete controls for editors. Department Matrix preserves the stored directional relationship for every pair of the eight supported departments; mirroring the reverse direction is enabled by default when editing.",
      "Visual Map collapses environment-level edges into system-to-system links and renders them like the Knowledge Graph: color-coded nodes, labeled feeds edges, Controls, and MiniMap. Focus mode lays out upstream → selected → downstream; All systems shows every application in a circular layout. Click a node to focus, click an edge for env pairs, or use Expand for a larger modal with the same controls and a full connection-info panel. Open via Visual Map or /system-mapping?tab=visual.",
      "Shared Environments follows the common Sentinel table pattern: URL-driven server filters, sortable headers, a sort summary, saved Manage Filters and Manage Columns preferences, sticky headings and identifier, and horizontal scrolling on small screens.",
      "Release Manager Notes remain visible beside the active tab on desktop (except Visual Map) and appear expanded before the tab content on mobile. Booking conflicts call the existing real analysis endpoint for the chosen date range and report environment reservations that overlap mapped dependencies.",
    ],
  },
  environments: {
    pageKey: "environments",
    title: "Versions & Config",
    summary:
      "Answer what is deployed where with the version matrix across PROD, TEST, and UAT. Spot drift between tiers and confirm the target environment before CAB approval.",
    quickReference: [
      "Environment desk: version matrix, booking timeline, and topology.",
      "Compare PROD vs TEST/UAT versions before approving a release.",
      "Filter by application to focus the version matrix.",
      "Bookings panel reflects live env reservations in scope.",
      "Use topology view for service dependency overview.",
    ],
    fullDocumentation: [
      "Versions & Config (Environment Desk) answers \"what is deployed where?\" for each application and environment tier. The version matrix highlights drift between production and lower environments — a common gate for CAB approval.",
      "Data is loaded from the environment-desk API and respects the same department/application filters as the rest of Release Desk. Promotion actions (where enabled) update tracked versions; bookings shown here align with the Env Booking register.",
      "Before go-live, verify the target environment row shows the expected version and that no conflicting booking overlaps the deployment window.",
    ],
  },
  risks: {
    pageKey: "risks",
    title: "Risk",
    summary:
      "Qualitative risks per release scored as likelihood × impact (1–25). Use the heat map and filters to focus CAB discussion on High and Critical items still open.",
    quickReference: [
      "Qualitative risks per release: likelihood × impact = risk score (1–25).",
      "Bands: Low ≤5, Medium ≤11, High ≤19, Critical ≥20.",
      "5×5 heat map summarises likelihood vs impact for filtered risks.",
      "Filter by status and category; sort by risk score descending.",
      "Each risk links to its parent release.",
    ],
    fullDocumentation: [
      "The Risk Register holds narrative risks from the source Risk sheet — resource gaps, schedule threats, technical concerns, and compliance items. Risk score is computed as likelihood × impact (each 1–5), matching the embedded scoring matrix in the workbook.",
      "Risk level bands (LOW / MEDIUM / HIGH / CRITICAL) follow thresholds verified against all seeded scores in the Risk sheet summary — they are display-only and not stored as a separate column. Status tracks mitigation workflow: Open, Monitoring, Mitigating, Accepted, etc.",
      "This register is separate from the Weighted Risk Score on the Risk Factors page. Use both: qualitative risks here for CAB discussion, weighted factor scoring for data-driven go/no-go.",
    ],
  },
  "risk-factors": {
    pageKey: "risk-factors",
    title: "Risk Factors",
    summary:
      "Master list of weighted scoring factors that drive the release Weighted Risk Score. Edit weights carefully — they feed go/no-go math on every release detail page.",
    quickReference: [
      "44 weighted factors across 10 categories (editable weights in master data).",
      `Category weight budget: ${CATEGORY_WEIGHTS_VERIFIED}`,
      "Per-factor weight is stored in DB; banding rules live in code (lib/risk-scoring/factors.ts).",
      "Weighted score = Σ(bandScore × weight); bands: Low / Medium / High / Critical / Severe.",
      "Do NOT use the Excel \"10 categories\" alternate percentages or worked example — they are stale.",
    ],
    fullDocumentation: [
      "Risk Factors defines the Weighted Risk Score model (System 2) used on release detail. Each factor has a category, name, weight, and description. Raw inputs on a release are converted to a 1–5 band via factor-specific rules in code, then multiplied by the factor weight and summed.",
      `Verified category weight budget (sums to ~99.2% by design, not normalized to 100%): ${CATEGORY_WEIGHTS_VERIFIED} Individual factor weights within a category are listed in the table and match lib/risk-scoring/factors.ts.`,
      "DISCREPANCY NOTE: The source Excel contains an alternate \"10 Factor Categories\" prose block with different percentages and a worked example whose arithmetic does not reconcile (claims 1.45 but factors sum differently). The app uses the per-factor weights in factors.ts — they reproduce all 12 ground-truth release scores exactly. Documentation and UI must reference the verified breakdown above, not the stale prose.",
    ],
  },
  drifts: {
    pageKey: "drifts",
    title: "Drift Dashboard",
    summary:
      "Capture environment and config differences found while validating a release — version gaps, timeouts, stale data. Triage by severity so Critical drift does not slip into UAT sign-off.",
    quickReference: [
      "Tracks environment/application drift found during release testing.",
      "Drift Type values come from Reference Data (category drift_type).",
      "Filter by drift type, severity, status, and release.",
      "Severity drives triage: Critical drift can block UAT sign-off.",
      "Each row links to the affected release.",
    ],
    fullDocumentation: [
      "Drift records capture differences between environments — database versions, config timeouts, stale test data, memory allocation, etc. — discovered while validating a release. Data is seeded from the Drift sheet with remediation actions and ETAs.",
      "Drift Type is a governed lookup (Reference Data → drift_type), not free text. Creating drift via API validates against active reference values. Severity and status columns match the source workbook vocabulary.",
      "Resolve high-severity drift before promoting to pre-prod or prod; the drift list complements Versions & Config by describing qualitative gaps that version numbers alone may not show.",
      "Release detail includes a live Drift panel for the open release, linking each row through to its drift detail page.",
    ],
  },
  approvals: {
    pageKey: "approvals",
    title: "Approval Queue",
    summary:
      "CAB and gate sign-offs across in-scope releases in one queue. Filter to Pending items that still need a decision before go-live.",
    quickReference: [
      "CAB and gate approvals across all in-scope releases.",
      "Filter by decision (Pending, Approved, Rejected), type, and approver.",
      "Pending items need action before go-live.",
      "Each row links to the parent release.",
      "Submitted and decision dates track SLA progress.",
    ],
    fullDocumentation: [
      "The Approval Queue centralises sign-off records from the Approvals sheet — CAB, technical, security, and business gates. Decision status drives release readiness calculations on the Releases list.",
      "Use approver filter to see your personal queue. Rejected approvals should carry comments explaining required remediation. Approved items still respect other blockers (conflicts, drift, open P1s).",
      "Approval types and decisions are filterable via URL params so you can share a pending-CAB view with stakeholders.",
    ],
  },
  leaves: {
    pageKey: "leaves",
    title: "Leave & Resource Availability",
    summary:
      "See who is unavailable during the planning horizon and which releases lose coverage. High-risk leave overlapping a release window needs a backup plan before CAB.",
    quickReference: [
      "Staff leave records that may affect release windows.",
      "Risk level (Low / Medium / High) flags coverage gaps.",
      "Filter by leave type, department, and risk level.",
      "Cross-reference with Risk Register for resource-category risks.",
      "High-risk leave overlapping a release window needs backup planning.",
    ],
    fullDocumentation: [
      "Leave Calendar shows who is unavailable during the planning horizon and which releases are affected. Rows link leave records to impacted releases via the seed data relationships.",
      "Risk level is a desk-assigned indicator for capacity planning — not the same as Risk Register scores. Filter High risk during sprint planning to ensure test and release manager coverage.",
      "Mitigation typically appears as a Risk Register entry (resource category) referencing the leave code in notes.",
    ],
  },
  "monitoring-alerts": {
    pageKey: "monitoring-alerts",
    title: "Monitoring Alerts",
    summary:
      "Open monitoring signals across applications and environments — threshold breaches and integration failures. Review P1/P2 alerts in the same env as a planned deploy before CAB.",
    quickReference: [
      "Open monitoring alerts across applications and environments.",
      "Filter by severity, status, application, alert type, and environment.",
      "P1/P2 severities may block deployment depending on scope.",
      "Alert type and environment columns help route to the right team.",
      "Cross-check Application Status for current env health.",
    ],
    fullDocumentation: [
      "Monitoring Alerts aggregates active signals from the monitoring sheet — threshold breaches, integration failures, and observability gaps. Each alert is tied to an application and environment.",
      "Severity and status filters support war-room triage. Alerts in the same environment as a planned deployment should be reviewed in CAB even if the release itself is low impact.",
      "This page is read-only for most roles; resolution happens in the incident or monitoring toolchain, with status updated when cleared.",
    ],
  },
  incidents: {
    pageKey: "incidents",
    title: "Incidents",
    summary:
      "Production and pre-prod incidents (P1–P3) tied to applications and environments. Open P1s block deploy to affected envs and surface on Dashboard and Morning Inbox.",
    quickReference: [
      "Production and pre-prod incidents (P1–P3) across applications.",
      "Filter by severity, status, application, department, and environment.",
      "Open P1s surface on Dashboard and Morning Inbox.",
      "Related release column links cross-release impact.",
      "Status badges track active vs resolved incidents.",
    ],
    fullDocumentation: [
      "Incidents is the system of record for live outages and degradations during the release horizon. P1 items block deployment to affected environments per Application Status rules.",
      "Each incident includes impact narrative, assigned owner, and optional related release for change correlation. Department and environment filters align with the portfolio filter bar used elsewhere.",
      "Morning Inbox and Dashboard pull open P1 counts from the same dataset — clearing an incident here updates those widgets on refresh.",
    ],
  },
  "application-status": {
    pageKey: "application-status",
    title: "Application Status",
    summary:
      "Point-in-time health per application × environment — Healthy, Degraded, or Down. Confirm the target env is Healthy before you deploy.",
    quickReference: [
      "One row per application × environment health snapshot.",
      "Status: Healthy ✅ | Degraded ⚠️ | Down 🛑 — target env must be Healthy before deploy.",
      "Uptime below 95% signals instability; check Last Check freshness.",
      "Filter by status, environment, and application.",
      "Down or Degraded prod rows often correlate with open incidents.",
    ],
    fullDocumentation: [
      "Application Status answers \"can we deploy here right now?\" with a point-in-time health row per application and environment tier. Status values match the Quick Reference legend embedded in the source Application Status sheet.",
      "Uptime percentage and last-check timestamp indicate data freshness — stale checks may warrant a manual probe before go-live. Degraded or Down in the target environment should block deployment unless an explicit CAB exemption exists.",
      "Use alongside Monitoring Alerts and Incidents: status is the summary view, incidents carry the narrative, alerts carry the triggering signal.",
    ],
  },
  "planned-maintenance": {
    pageKey: "planned-maintenance",
    title: "Planned Maintenance",
    summary:
      "Scheduled vendor patches and infrastructure windows that may collide with release dates. Approved maintenance in your go-live week means reschedule or get an explicit exemption.",
    quickReference: [
      "Scheduled maintenance windows that may overlap release dates.",
      "Filter by type, approval status, application, environment, and impact.",
      "Approved maintenance in a release window requires rescheduling or exemption.",
      "Impact column indicates user-facing blast radius.",
      "Cross-check Calendar for freeze and maintenance events.",
    ],
    fullDocumentation: [
      "Planned Maintenance lists vendor patches, infrastructure work, and scheduled outages from the seed workbook. Approval status tracks whether the window is confirmed or pending.",
      "High-impact maintenance overlapping a release deployment window should trigger a schedule risk in the Risk Register. Calendar events may also reference vendor maintenance at the portfolio level.",
      "Filter by environment to see if your target prod/test tier has upcoming work during the proposed go-live week.",
    ],
  },
  "integration-flows": {
    pageKey: "integration-flows",
    title: "Key Integration Flows",
    summary:
      "Catalog of system-to-system integrations (source → target) with type, frequency, and purpose. Use it when a release touches either end so coordinated testing is not missed.",
    quickReference: [
      "Catalog of system-to-system integration flows (source → target).",
      "Filter by integration type, frequency, source/target system, and purpose.",
      "Source and target are plain-text system names (not linked to Applications yet).",
      "Use with System Mapping for a fuller picture of cross-system dependencies.",
      "Frequency and type indicate blast radius when a release touches either end.",
    ],
    fullDocumentation: [
      "Key Integration Flows lists how enterprise systems exchange data — API, batch, SCIM, and hybrid patterns — with frequency and business purpose for each flow.",
      "System names are stored as free text because they only partially match seeded Application records. Linking to Applications is a future reconciliation task.",
      "When planning a release that changes Salesforce, SAP, Workday, or similar platforms, filter this list by source or target to identify downstream consumers that may need coordinated testing.",
    ],
  },
  departments: {
    pageKey: "departments",
    title: "Departments",
    summary:
      "Organizational units that own applications and releases in Sentinel. Keep this catalog accurate so filters, ownership, and reporting stay aligned across Release Desk.",
    quickReference: [
      "Master list of departments used across releases, apps, and filters.",
      "Editors can create, rename, and deactivate organizational units.",
      "Department filters on other pages read from this catalog.",
      "Deactivating a department does not delete historical release rows.",
    ],
    fullDocumentation: [
      "Departments are the top-level org structure for portfolio filtering. Every application and many release records reference a department so Release Desk views can be scoped to a train or business unit.",
      "Editors maintain the catalog here. Prefer deactivate over hard-delete when a unit is retired so historical releases keep a readable department label.",
      "Changes appear immediately in department dropdowns on Releases, Env Booking, Conflicts, and related pages.",
    ],
  },
  applications: {
    pageKey: "applications",
    title: "Applications",
    summary:
      "Application catalog with owning department and environment instances. This is the source of truth for app filters and for booking TEST/UAT windows against the right system.",
    quickReference: [
      "Master list of applications in the release portfolio.",
      "Each app belongs to a department and can own multiple environments.",
      "Open an app to manage its environment instances.",
      "Application filters across Release Desk read from this catalog.",
    ],
    fullDocumentation: [
      "Applications define the systems you release and book environments for. Each row links to a department and can expand into environment instances (TEST, UAT, PROD, etc.).",
      "Editors add or update applications and nested environments here. Env Booking and Versions & Config depend on these records being complete and correctly named.",
      "Retire unused apps carefully — releases and bookings may still reference them historically.",
    ],
  },
  users: {
    pageKey: "users",
    title: "Users",
    summary:
      "Release stakeholders and approvers used for ownership, CAB queues, and assignment fields. Keep names and roles current so approval and risk-owner filters match real people.",
    quickReference: [
      "Directory of release stakeholders, owners, and approvers.",
      "Used by approval queues, risk owners, and assignment fields.",
      "Editors can add or update user records for desk workflows.",
      "Prefer matching live user data in person filters — never hardcode names.",
    ],
    fullDocumentation: [
      "Users stores the people referenced across Release Desk — release owners, risk owners, approvers, and assignees. Person filters on table pages match against this live catalog.",
      "Editors maintain the directory so CAB queues and ownership fields stay accurate. Do not replace person filters with hardcoded name dropdowns; that has caused stale-data bugs before.",
      "Clerk authentication is separate — this catalog is operational master data for release workflows, not the login identity store.",
    ],
  },
  "reference-data": {
    pageKey: "reference-data",
    title: "Reference Data",
    summary:
      "Governed lookup values (statuses, types, severities, drift types, and more) that power dropdowns and validation. Change a category here and every page that uses it stays consistent.",
    quickReference: [
      "Category-based lookup values for filters and form validation.",
      "Examples: drift_type, statuses, severities, and other desk enums.",
      "Editors add categories and values; inactive values stop appearing in new picks.",
      "API create/update paths validate against active reference values where required.",
    ],
    fullDocumentation: [
      "Reference Data is the controlled vocabulary for Release Desk. Categories group related values (for example drift_type) that appear in filters, forms, and API validation.",
      "Editors manage categories and individual values. Mark values inactive instead of deleting when historical rows still reference them.",
      "Pages such as Drift Dashboard require reference-backed types — free-text substitutes are rejected so reporting stays clean.",
    ],
  },
};

const PATH_TO_DOC_KEY: Record<string, PageDocKey> = {
  "/releases": "releases",
  "/calendar": "calendar",
  "/booking": "env-booking",
  "/dependencies": "dependencies",
  "/conflicts": "conflicts",
  "/blockers": "blockers",
  "/system-mapping": "system-mapping",
  "/environments": "environments",
  "/risks": "risks",
  "/risk-factors": "risk-factors",
  "/drifts": "drifts",
  "/approvals": "approvals",
  "/leaves": "leaves",
  "/monitoring-alerts": "monitoring-alerts",
  "/incidents": "incidents",
  "/application-status": "application-status",
  "/planned-maintenance": "planned-maintenance",
  "/integration-flows": "integration-flows",
  "/departments": "departments",
  "/applications": "applications",
  "/users": "users",
  "/admin/reference-data": "reference-data",
};

export function getPageDocumentation(pageKey: PageDocKey): PageDocumentationEntry {
  return PAGE_DOCUMENTATION[pageKey];
}

export function resolvePageDocKey(pathname: string): PageDocKey | null {
  return PATH_TO_DOC_KEY[pathname] ?? null;
}

/** Discrepancies between source sheets and verified app logic (for implementation reports). */
export const DOCUMENTATION_DISCREPANCIES: { page: PageDocKey; issue: string }[] = [
  {
    page: "risk-factors",
    issue:
      "Excel alternate \"10 Factor Categories\" percentages and worked example do not match lib/risk-scoring/factors.ts. App uses per-factor weights (category budget 18/26/8/4/14/9/10/4/5/2%) which reproduce ground-truth scores.",
  },
  {
    page: "releases",
    issue: "page-guide.ts mentions \"Playbooks & clone\" on Releases — that UI was removed; documentation here omits it.",
  },
  {
    page: "calendar",
    issue: "page-guide.ts describes only timeline/heat; app now has Month, Timeline, and Table views sharing calendarEvents.",
  },
  {
    page: "risks",
    issue: "Risk sheet embeds a likelihood/impact legend in data rows; bands in app follow risk-level.ts thresholds verified against summary stats, not prose in row 6+.",
  },
];
