import type {
  ActivityFeedItem,
  AgentMeta,
  Approval,
  ApprovalGate,
  CabSession,
  Connector,
  FreezeWindow,
  HistoricalTrendPoint,
  Release,
  ReleaseStatus,
  Service,
  TeamMember,
} from "./types";

const daysAgo = (d: number) => new Date(Date.now() - d * 86400000).toISOString();
const daysFromNow = (d: number) => new Date(Date.now() + d * 86400000).toISOString();

const TEAMS = ["Platform", "Billing", "Search", "Payments", "Core", "Identity", "Mobile", "Data"] as const;
const OWNERS = ["Priya Sharma", "Alex Kim", "Mike Torres", "Raj Patel", "Sarah Chen", "Jordan Lee", "Emma Walsh"];
const TICKET_STATUSES = ["Open", "In Progress", "Done", "Blocked"] as const;

const defaultApprovals = (
  overrides: Partial<Record<ApprovalGate, Partial<Approval>>> = {}
): Approval[] => {
  const gates: ApprovalGate[] = ["QA", "Security", "Database", "Business", "Change"];
  return gates.map((gate) => ({
    gate,
    status: "Approved" as const,
    approver: "System",
    timestamp: daysAgo(5),
    ...(overrides[gate] ?? {}),
  }));
};

const typicalHours = { QA: 4, Security: 6, Database: 8, Business: 12, Change: 24 };

function generateRelease(n: number): Release {
  const shipped = n < 32;
  const team = TEAMS[n % TEAMS.length];
  const owner = OWNERS[n % OWNERS.length];
  const dateOffset = shipped ? -(n * 5 + 2) : (n - 31) * 3 + 4;
  const targetDate = dateOffset < 0 ? daysAgo(-dateOffset) : daysFromNow(dateOffset);
  const major = 2;
  const minor = 8 + Math.floor(n / 8);
  const patch = n % 20;
  const version = `v${major}.${minor}.${patch}`;
  const filesChanged = 35 + n * 17 + (n % 7) * 40;
  const svc = services[n % services.length];
  const svc2 = services[(n + 3) % services.length];

  let status: ReleaseStatus = shipped ? "Shipped" : "Scheduled";
  if (!shipped) {
    if (n % 5 === 0) status = "At Risk";
    else if (n % 11 === 0) status = "Blocked";
    else if (n % 7 === 0) status = "Ready";
  }

  const openTickets = shipped ? 0 : 1 + (n % 4);
  const tickets = Array.from({ length: openTickets + (shipped ? 2 : 1) }, (_, ti) => {
    const done = shipped || ti >= openTickets;
    return {
      id: `${team.slice(0, 3).toUpperCase()}-${2000 + n * 10 + ti}`,
      title: [`API migration`, `Security hardening`, `Performance tuning`, `Bug fixes`, `Feature flag cleanup`][ti % 5],
      status: done ? ("Done" as const) : (TICKET_STATUSES[(n + ti) % 3] as (typeof TICKET_STATUSES)[number]),
      assignee: team,
    };
  });

  const buildFailed = !shipped && n % 11 === 0;
  const buildRunning = !shipped && !buildFailed && n % 9 === 0;
  const testCount = 400 + n * 15;
  const passedTests = buildFailed ? testCount - 18 - (n % 10) : buildRunning ? Math.floor(testCount * 0.7) : testCount;

  const pendingGates: Partial<Record<ApprovalGate, Partial<Approval>>> = {};
  if (!shipped) {
    if (n % 5 === 0) pendingGates.Security = { status: "Pending", pendingSince: daysAgo(2 + (n % 3)) };
    if (n % 7 === 0) pendingGates.Business = { status: "Pending", pendingSince: daysAgo(1) };
    if (n % 4 === 0) pendingGates.QA = { status: "Pending", pendingSince: daysAgo(0.5) };
  }
  if (buildFailed) pendingGates.QA = { status: "Rejected", approver: "Mike Torres", timestamp: daysAgo(0.1) };

  const targetDay = new Date(targetDate).getDay();
  const isFriday = targetDay === 5;

  return {
    id: `rel-gen-${n}`,
    name: `${team} ${shipped ? "Release" : "Sprint Release"}`,
    version,
    team,
    owner,
    targetDate,
    status,
    decision: shipped ? (n % 9 === 0 ? "No-Go" : "Go") : null,
    filesChanged,
    typicalApprovalHours: typicalHours,
    commits: [
      { sha: `${n}a1b2c3`, message: `Feature batch ${n}`, author: team, timestamp: daysAgo(n + 2) },
      { sha: `${n}d4e5f6`, message: `Config updates for ${svc.name}`, author: owner, timestamp: daysAgo(n + 1) },
    ],
    dependsOnServices: n % 3 === 0 ? [svc.id, svc2.id] : [svc.id],
    incidentHistory:
      shipped && (n % 5 === 0 || isFriday)
        ? [{ id: `inc-g${n}`, date: daysAgo(n * 4), severity: n % 10 === 0 ? "Sev-2" : "Sev-3", summary: isFriday ? "Friday deploy rollback" : "Minor post-release incident" }]
        : [],
    tickets,
    approvals: defaultApprovals(pendingGates),
    build: {
      id: `${4300 + n}`,
      status: buildFailed ? "Failed" : buildRunning ? "Running" : "Passed",
      pipeline: n % 4 === 0 ? "Azure Pipelines" : "GitHub Actions",
      lastRun: daysAgo(n * 0.3),
      testCount,
      passedTests,
    },
    notes: isFriday ? "Friday release window — elevated rollback risk historically." : n % 6 === 0 ? "Requires coordinated DB migration." : "",
    history: [
      { id: `hg${n}-1`, timestamp: daysAgo(n + 1), actor: owner, action: `Created release ${version}`, type: "human" },
      ...(shipped
        ? [{ id: `hg${n}-2`, timestamp: daysAgo(n), actor: owner, action: `Marked Go for ${version}`, type: "human" as const }]
        : n % 5 === 0
          ? [{ id: `hg${n}-2`, timestamp: daysAgo(0.5), actor: "Risk Agent", action: `Flagged elevated file count (${filesChanged} files)`, type: "agent" as const, agent: "Risk Agent" as const }]
          : []),
    ],
  };
}

export const teamMembers: TeamMember[] = [
  { id: "u1", name: "Priya Sharma", role: "Release Manager", email: "priya@company.com" },
  { id: "u2", name: "Raj Patel", role: "DB Lead", email: "raj@company.com" },
  { id: "u3", name: "Sarah Chen", role: "Security Lead", email: "sarah@company.com" },
  { id: "u4", name: "Mike Torres", role: "QA Lead", email: "mike@company.com" },
  { id: "u5", name: "Alex Kim", role: "Engineering Manager", email: "alex@company.com" },
  { id: "u6", name: "Jordan Lee", role: "Platform Engineer", email: "jordan@company.com" },
  { id: "u7", name: "Emma Walsh", role: "SRE Lead", email: "emma@company.com" },
  { id: "u8", name: "Chris Nguyen", role: "Payments Lead", email: "chris@company.com" },
  { id: "u9", name: "Lisa Park", role: "Product Owner", email: "lisa@company.com" },
  { id: "u10", name: "Tom Bradley", role: "Change Manager", email: "tom@company.com" },
  { id: "u11", name: "Nina Okonkwo", role: "Mobile Lead", email: "nina@company.com" },
  { id: "u12", name: "David Frost", role: "Data Platform Lead", email: "david@company.com" },
];

export const services: Service[] = [
  { id: "svc-auth", name: "auth-service", dependsOn: [], criticality: "Critical", recentIncidents: [], unstable: false },
  { id: "svc-payments", name: "payments-api", dependsOn: ["svc-auth"], criticality: "Critical", recentIncidents: [{ id: "inc-1", date: daysAgo(45), severity: "Sev-2", summary: "Payment timeout spike" }], unstable: true },
  { id: "svc-billing", name: "billing-worker", dependsOn: ["svc-payments", "svc-auth"], criticality: "High", recentIncidents: [], unstable: false },
  { id: "svc-notify", name: "notification-hub", dependsOn: ["svc-auth"], criticality: "Medium", recentIncidents: [], unstable: false },
  { id: "svc-ledger", name: "ledger-service", dependsOn: ["svc-payments"], criticality: "Critical", recentIncidents: [{ id: "inc-2", date: daysAgo(60), severity: "Sev-1", summary: "Ledger reconciliation failure" }], unstable: false },
  { id: "svc-gateway", name: "api-gateway", dependsOn: ["svc-auth"], criticality: "Critical", recentIncidents: [], unstable: false },
  { id: "svc-search", name: "search-index", dependsOn: ["svc-gateway"], criticality: "Medium", recentIncidents: [], unstable: false },
  { id: "svc-report", name: "reporting-api", dependsOn: ["svc-ledger", "svc-billing"], criticality: "High", recentIncidents: [], unstable: false },
  { id: "svc-cache", name: "cache-layer", dependsOn: [], criticality: "High", recentIncidents: [], unstable: false },
  { id: "svc-audit", name: "audit-logger", dependsOn: ["svc-gateway"], criticality: "Medium", recentIncidents: [], unstable: false },
  { id: "svc-identity", name: "identity-provider", dependsOn: ["svc-auth"], criticality: "Critical", recentIncidents: [{ id: "inc-3", date: daysAgo(30), severity: "Sev-3", summary: "Token refresh latency" }], unstable: false },
  { id: "svc-mobile", name: "mobile-bff", dependsOn: ["svc-gateway", "svc-auth"], criticality: "High", recentIncidents: [], unstable: false },
  { id: "svc-analytics", name: "analytics-pipeline", dependsOn: ["svc-report", "svc-cache"], criticality: "Medium", recentIncidents: [], unstable: true },
  { id: "svc-fraud", name: "fraud-detection", dependsOn: ["svc-payments", "svc-analytics"], criticality: "Critical", recentIncidents: [{ id: "inc-4", date: daysAgo(14), severity: "Sev-2", summary: "False positive surge" }], unstable: false },
];

const anchorReleases: Release[] = [
  {
    id: "rel-v2140",
    name: "Platform Release",
    version: "v2.14.0",
    team: "Platform",
    owner: "Priya Sharma",
    targetDate: daysFromNow(1),
    status: "At Risk",
    decision: null,
    filesChanged: 847,
    typicalApprovalHours: typicalHours,
    commits: [
      { sha: "a3f9c2d", message: "Refactor payment routing logic", author: "Jordan Lee", timestamp: daysAgo(2) },
      { sha: "b7e1a04", message: "Add fraud detection hooks", author: "Chris Nguyen", timestamp: daysAgo(1) },
      { sha: "f1c8d92", message: "Update gateway rate limits", author: "Jordan Lee", timestamp: daysAgo(0.5) },
    ],
    dependsOnServices: ["svc-payments", "svc-auth", "svc-gateway", "svc-fraud"],
    incidentHistory: [{ id: "inc-r1", date: daysAgo(90), severity: "Sev-2", summary: "Post-release latency on payments-api" }],
    tickets: [
      { id: "PLAT-4412", title: "Payment routing refactor", status: "Done", assignee: "Jordan Lee" },
      { id: "PLAT-4418", title: "Security review checklist", status: "In Progress", assignee: "Sarah Chen" },
      { id: "PLAT-4420", title: "Load test payments-api", status: "Done", assignee: "Emma Walsh" },
      { id: "PLAT-4422", title: "Update runbook for migration", status: "Open", assignee: "Priya Sharma" },
    ],
    approvals: defaultApprovals({
      Security: { status: "Pending", pendingSince: daysAgo(3) },
      QA: { status: "Approved", approver: "Mike Torres", timestamp: daysAgo(1) },
      Database: { status: "Approved", approver: "Raj Patel", timestamp: daysAgo(2) },
      Business: { status: "Approved", approver: "Lisa Park", timestamp: daysAgo(1.5) },
    }),
    build: { id: "4471", status: "Passed", pipeline: "GitHub Actions", lastRun: daysAgo(0.5), testCount: 1240, passedTests: 1240 },
    notes: "Database migration needs maintenance window before ship.",
    deployment: {
      environment: "production",
      cluster: "eks-prod-01",
      pipeline: "Argo CD",
      targetNamespace: "platform",
    },
    changeRecord: {
      crNumber: "CR-8842",
      riskTier: "High",
      scheduledStart: daysFromNow(1),
      scheduledEnd: daysFromNow(1.08),
      backoutPlan:
        "Revert payment routing via blue-green switch. Run DB migration rollback script rollback_v2140.sql if schema changes applied.",
      affectedServices: ["payments-api", "auth-service", "api-gateway", "fraud-detection"],
      description: "Platform release v2.14.0 — payment routing refactor, fraud detection hooks, gateway rate limits.",
      cabStatus: "Pending",
      cabSessionDate: daysFromNow(0.5),
      submittedBy: "Tom Bradley",
    },
    history: [
      { id: "h1", timestamp: daysAgo(3), actor: "Mike Torres", action: "Approved QA gate", type: "human" },
      { id: "h2", timestamp: daysAgo(2), actor: "Risk Agent", action: "Flagged unusual file-change volume (847 files)", type: "agent", agent: "Risk Agent" },
      { id: "h3", timestamp: daysAgo(1.5), actor: "Lisa Park", action: "Approved Business gate", type: "human" },
      { id: "h4", timestamp: daysAgo(1), actor: "Dependency Agent", action: "Flagged payments-api blast radius (4 dependents)", type: "agent", agent: "Dependency Agent" },
    ],
  },
  {
    id: "rel-v2135",
    name: "Billing Hotfix",
    version: "v2.13.5",
    team: "Billing",
    owner: "Alex Kim",
    targetDate: daysFromNow(3),
    status: "Blocked",
    decision: null,
    filesChanged: 42,
    typicalApprovalHours: typicalHours,
    commits: [
      { sha: "c4d8e91", message: "Fix invoice rounding bug", author: "Chris Nguyen", timestamp: daysAgo(1) },
      { sha: "d9e2f14", message: "Add regression test for rounding", author: "Mike Torres", timestamp: daysAgo(0.8) },
    ],
    dependsOnServices: ["svc-billing", "svc-ledger"],
    incidentHistory: [{ id: "inc-r2", date: daysAgo(5), severity: "Sev-3", summary: "Customer reported incorrect invoice totals" }],
    tickets: [
      { id: "BILL-892", title: "Invoice rounding fix", status: "Done", assignee: "Chris Nguyen" },
      { id: "BILL-893", title: "Integration test failures", status: "Blocked", assignee: "Mike Torres" },
    ],
    approvals: defaultApprovals({
      QA: { status: "Rejected", approver: "Mike Torres", timestamp: daysAgo(0.1) },
      Security: { status: "Approved", approver: "Sarah Chen", timestamp: daysAgo(0.5) },
    }),
    build: { id: "4468", status: "Failed", pipeline: "GitHub Actions", lastRun: daysAgo(0.2), testCount: 320, passedTests: 298 },
    notes: "Build failed on integration tests — investigating.",
    deployment: {
      environment: "production",
      cluster: "eks-prod-02",
      pipeline: "Harness",
      targetNamespace: "billing",
    },
    history: [
      { id: "h5", timestamp: daysAgo(0.2), actor: "Build Agent", action: "Build #4468 failed — 22 test failures in invoice suite", type: "agent", agent: "Build Agent" },
      { id: "h6", timestamp: daysAgo(0.15), actor: "Mike Torres", action: "Rejected QA gate pending build fix", type: "human" },
    ],
  },
  {
    id: "rel-v2150",
    name: "Search Enhancement",
    version: "v2.15.0",
    team: "Search",
    owner: "Priya Sharma",
    targetDate: daysFromNow(7),
    status: "Scheduled",
    decision: null,
    filesChanged: 1203,
    typicalApprovalHours: typicalHours,
    commits: [
      { sha: "e5f2b33", message: "Elasticsearch index rebuild", author: "David Frost", timestamp: daysAgo(4) },
      { sha: "g7h8i99", message: "Query optimizer rewrite", author: "David Frost", timestamp: daysAgo(3) },
    ],
    dependsOnServices: ["svc-search", "svc-cache", "svc-gateway", "svc-analytics"],
    incidentHistory: [],
    tickets: [
      { id: "SRCH-201", title: "Index rebuild", status: "In Progress", assignee: "David Frost" },
      { id: "SRCH-205", title: "Query performance tests", status: "Open", assignee: "David Frost" },
      { id: "SRCH-210", title: "Security scan review", status: "Open", assignee: "Sarah Chen" },
    ],
    approvals: defaultApprovals({
      QA: { status: "Pending", pendingSince: daysAgo(1) },
      Security: { status: "Pending", pendingSince: daysAgo(1) },
      Database: { status: "Pending", pendingSince: daysAgo(1) },
      Business: { status: "Pending", pendingSince: daysAgo(1) },
      Change: { status: "Pending", pendingSince: daysAgo(1) },
    }),
    build: { id: "4465", status: "Running", pipeline: "GitHub Actions", lastRun: daysAgo(0.1), testCount: 890, passedTests: 650 },
    notes: "Large index migration — high file count release.",
    deployment: {
      environment: "staging",
      cluster: "eks-stg-01",
      pipeline: "Argo CD",
      targetNamespace: "search",
    },
    history: [
      { id: "h7", timestamp: daysAgo(4), actor: "Priya Sharma", action: "Created release v2.15.0", type: "human" },
      { id: "h8", timestamp: daysAgo(0.3), actor: "Risk Agent", action: "Flagged 1203 files — 4.3x team median", type: "agent", agent: "Risk Agent" },
    ],
  },
  {
    id: "rel-v2141",
    name: "Mobile App Release",
    version: "v2.14.1",
    team: "Mobile",
    owner: "Nina Okonkwo",
    targetDate: daysFromNow(2),
    status: "Ready",
    decision: null,
    filesChanged: 156,
    typicalApprovalHours: typicalHours,
    commits: [{ sha: "m1o2b3i", message: "Push notification improvements", author: "Nina Okonkwo", timestamp: daysAgo(1) }],
    dependsOnServices: ["svc-mobile", "svc-notify", "svc-auth"],
    incidentHistory: [],
    tickets: [
      { id: "MOB-301", title: "Push notification batching", status: "Done", assignee: "Nina Okonkwo" },
      { id: "MOB-302", title: "iOS regression suite", status: "Done", assignee: "Mike Torres" },
    ],
    approvals: defaultApprovals(),
    build: { id: "4472", status: "Passed", pipeline: "GitHub Actions", lastRun: daysAgo(0.3), testCount: 540, passedTests: 540 },
    notes: "Low-risk mobile patch — all gates green.",
    deployment: {
      environment: "production",
      cluster: "eks-prod-01",
      pipeline: "Harness",
      targetNamespace: "mobile",
    },
    history: [{ id: "h9", timestamp: daysAgo(0.5), actor: "Mike Torres", action: "Approved QA gate", type: "human" }],
  },
  {
    id: "rel-v2138",
    name: "Identity Patch",
    version: "v2.13.8",
    team: "Identity",
    owner: "Sarah Chen",
    targetDate: daysFromNow(5),
    status: "At Risk",
    decision: null,
    filesChanged: 312,
    typicalApprovalHours: typicalHours,
    commits: [{ sha: "i4d3e2n", message: "OAuth scope tightening", author: "Sarah Chen", timestamp: daysAgo(2) }],
    dependsOnServices: ["svc-identity", "svc-auth"],
    incidentHistory: [],
    tickets: [
      { id: "IDN-110", title: "OAuth scope audit", status: "In Progress", assignee: "Sarah Chen" },
      { id: "IDN-112", title: "Pen test remediation", status: "Open", assignee: "Sarah Chen" },
    ],
    approvals: defaultApprovals({
      Security: { status: "Pending", pendingSince: daysAgo(1.5) },
      Change: { status: "Pending", pendingSince: daysAgo(2) },
    }),
    build: { id: "4469", status: "Passed", pipeline: "Azure Pipelines", lastRun: daysAgo(0.4), testCount: 680, passedTests: 680 },
    notes: "Security-sensitive — awaiting pen test sign-off.",
    history: [{ id: "h10", timestamp: daysAgo(1), actor: "Approval Agent", action: "Security sign-off pending 36h (typical: 6h)", type: "agent", agent: "Approval Agent" }],
  },
];

export const releases: Release[] = [
  ...anchorReleases,
  ...Array.from({ length: 45 }, (_, i) => generateRelease(i)),
];

export const cabSessions: CabSession[] = [
  {
    id: "cab-weekly",
    title: "Weekly Production CAB",
    date: daysFromNow(0.5),
    releaseIds: ["rel-v2140", "rel-v2141"],
    chair: "Tom Bradley",
    status: "Scheduled",
  },
  {
    id: "cab-emergency",
    title: "Emergency CAB — Billing Hotfix",
    date: daysFromNow(2),
    releaseIds: ["rel-v2135"],
    chair: "Tom Bradley",
    status: "Scheduled",
  },
  {
    id: "cab-search",
    title: "Large Change Review — Search v2.15.0",
    date: daysFromNow(5),
    releaseIds: ["rel-v2150"],
    chair: "Lisa Park",
    status: "Scheduled",
  },
];

export const freezeWindows: FreezeWindow[] = [
  {
    id: "fw-month-end",
    name: "Month-end financial close",
    start: daysFromNow(12),
    end: daysFromNow(16),
    reason: "No production changes during financial reconciliation",
  },
  {
    id: "fw-holiday",
    name: "Holiday blackout",
    start: daysFromNow(45),
    end: daysFromNow(52),
    reason: "Reduced on-call coverage — all non-critical changes deferred",
  },
];

export interface SearchResult {
  id: string;
  /** Domain entity kind, or legacy ticket/change for agents/connectors/templates. */
  type:
    | "release"
    | "ticket"
    | "change"
    | "risk"
    | "application"
    | "blocker"
    | "drift"
    | "approval"
    | "incident"
    | "booking"
    | "conflict"
    | "dependency"
    | "leave"
    | "alert"
    | "maintenance"
    | "flow"
    | "department"
    | "user"
    | "environment"
    | "version"
    | "risk-factor"
    | "status";
  label: string;
  sublabel: string;
  href: string;
}

export function searchAll(query: string): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const results: SearchResult[] = [];

  releases.forEach((r) => {
    if (
      r.version.toLowerCase().includes(q) ||
      r.name.toLowerCase().includes(q) ||
      r.team.toLowerCase().includes(q) ||
      r.owner.toLowerCase().includes(q) ||
      r.id.toLowerCase().includes(q)
    ) {
      results.push({
        id: `rel-${r.id}`,
        type: "release",
        label: `${r.version} — ${r.name}`,
        sublabel: `${r.team} · ${r.status}`,
        href: `/releases/${r.id}`,
      });
    }

    r.tickets.forEach((t) => {
      if (t.id.toLowerCase().includes(q) || t.title.toLowerCase().includes(q)) {
        results.push({
          id: `tkt-${t.id}`,
          type: "ticket",
          label: t.id,
          sublabel: `${t.title} · ${r.version}`,
          href: `/releases/${r.id}`,
        });
      }
    });

    if (r.changeRecord && r.changeRecord.crNumber.toLowerCase().includes(q)) {
      results.push({
        id: `cr-${r.changeRecord.crNumber}`,
        type: "change",
        label: r.changeRecord.crNumber,
        sublabel: `${r.version} · ${r.changeRecord.riskTier} risk · CAB ${r.changeRecord.cabStatus}`,
        href: `/releases/${r.id}`,
      });
    }
  });

  const seen = new Set<string>();
  return results.filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  }).slice(0, 12);
}

export const historicalTrend: HistoricalTrendPoint[] = Array.from({ length: 26 }, (_, i) => {
  const weekDate = new Date();
  weekDate.setDate(weekDate.getDate() - (25 - i) * 7);
  const week = weekDate.toISOString().slice(0, 10);
  const dip = i >= 8 && i <= 12;
  const fridaySpike = i === 6 || i === 14 || i === 20;
  return {
    week,
    avgReadiness: dip ? 58 + (i - 8) * 4 : fridaySpike ? 71 : 78 + Math.sin(i / 3) * 8 + i * 0.25,
    rollbackCount: dip ? 5 - Math.abs(i - 10) : fridaySpike ? 3 : i % 4 === 0 ? 2 : i % 7 === 0 ? 1 : 0,
  };
});

export const connectors: Connector[] = [
  // Issue tracking
  { id: "c1", name: "Jira", category: "Issue Tracking", description: "Stories & epics — 1,842 items synced across 12 projects", status: "Connected", lastSynced: daysAgo(0.01), maskedToken: "jira_••••••••4f2a" },
  { id: "c9", name: "Azure DevOps Boards", category: "Issue Tracking", description: "Work items — Billing & Platform teams", status: "Connected", lastSynced: daysAgo(0.04), maskedToken: "ado_••••••••1b8c" },
  { id: "c10", name: "Linear", category: "Issue Tracking", description: "Mobile squad backlog — 86 open issues", status: "Connected", lastSynced: daysAgo(0.06), maskedToken: "lin_••••••••9d3e" },

  // CI/CD
  { id: "c2", name: "GitHub Actions", category: "CI/CD", description: "Primary CI — 12 active workflows, 4 org repos", status: "Connected", lastSynced: daysAgo(0.02), maskedToken: "ghp_••••••••9b1c" },
  { id: "c11", name: "Azure Pipelines", category: "CI/CD", description: "Identity & Core builds — 6 release pipelines", status: "Connected", lastSynced: daysAgo(0.03), maskedToken: "azp_••••••••5f1a" },
  { id: "c12", name: "Jenkins", category: "CI/CD", description: "Legacy payment jobs — 3 controllers, nightly builds", status: "Connected", lastSynced: daysAgo(0.08), maskedToken: "jen_••••••••2c7d" },
  { id: "c13", name: "GitLab CI", category: "CI/CD", description: "Data platform pipelines — 8 projects", status: "Connected", lastSynced: daysAgo(0.05), maskedToken: "glpat-••••••••8a4f" },
  { id: "c14", name: "Harness", category: "CI/CD", description: "Enterprise CD orchestration — prod promotion gates", status: "Connected", lastSynced: daysAgo(0.07), maskedToken: "hns_••••••••3e9b" },
  { id: "c33", name: "CircleCI", category: "CI/CD", description: "Cloud CI — 24 orbs, parallel test workflows", status: "Connected", lastSynced: daysAgo(0.04), maskedToken: "cci_••••••••2f8a" },
  { id: "c34", name: "TeamCity", category: "CI/CD", description: "On-prem build chain — Core platform nightly builds", status: "Connected", lastSynced: daysAgo(0.09), maskedToken: "tc_••••••••6d1c" },
  { id: "c35", name: "Buildkite", category: "CI/CD", description: "Agent-based pipelines — elastic QA runners", status: "Connected", lastSynced: daysAgo(0.05), maskedToken: "bk_••••••••9e4b" },
  { id: "c36", name: "Codefresh", category: "CI/CD", description: "GitOps-native CI — Docker build & deploy graphs", status: "Connected", lastSynced: daysAgo(0.08), maskedToken: "cf_••••••••1a7d" },
  { id: "c37", name: "AWS CodePipeline", category: "CI/CD", description: "AWS-native delivery — 4 cross-account pipelines", status: "Connected", lastSynced: daysAgo(0.06), maskedToken: "cp_••••••••5b2e" },
  { id: "c38", name: "Google Cloud Build", category: "CI/CD", description: "GCP builds — analytics & data platform images", status: "Connected", lastSynced: daysAgo(0.1), maskedToken: "gcb_••••••••8c3f" },

  // Source control
  { id: "c39", name: "Bitbucket", category: "Source Control", description: "Git repos — Billing monorepo, branch policies synced", status: "Connected", lastSynced: daysAgo(0.03), maskedToken: "bb_••••••••4e9a" },
  { id: "c40", name: "GitHub Enterprise Server", category: "Source Control", description: "Self-hosted Git — 142 repos, protected main branches", status: "Connected", lastSynced: daysAgo(0.02), maskedToken: "ghes_••••••••7f2c" },
  { id: "c41", name: "GitLab", category: "Source Control", description: "SCM — merge request approvals tied to release gates", status: "Connected", lastSynced: daysAgo(0.04), maskedToken: "gl_••••••••3d8b" },
  { id: "c42", name: "Azure Repos", category: "Source Control", description: "Identity team repos — policy checks on release branches", status: "Connected", lastSynced: daysAgo(0.05), maskedToken: "azr_••••••••6a1e" },

  // Change management
  { id: "c4", name: "ServiceNow", category: "Change Management", description: "ITSM change records — 6 open CRs, CAB calendar synced", status: "Connected", lastSynced: daysAgo(0.1), maskedToken: "sn_••••••••2a8f" },
  { id: "c15", name: "BMC Helix ITSM", category: "Change Management", description: "Legacy change queue — read-only bridge for audit", status: "Disconnected", lastSynced: daysAgo(14), maskedToken: "bmc_••••••••6c2a" },

  // Monitoring & observability
  { id: "c3", name: "Datadog", category: "Monitoring", description: "APM & infra — 48 services, 120+ monitors", status: "Connected", lastSynced: daysAgo(0.05), maskedToken: "dd_••••••••7e3d" },
  { id: "c16", name: "Splunk", category: "Monitoring", description: "Log aggregation — release correlation searches", status: "Connected", lastSynced: daysAgo(0.09), maskedToken: "spl_••••••••4d8e" },
  { id: "c17", name: "Grafana Cloud", category: "Monitoring", description: "Dashboards & SLO burn alerts — 34 panels linked", status: "Connected", lastSynced: daysAgo(0.04), maskedToken: "grf_••••••••7b1c" },
  { id: "c18", name: "Dynatrace", category: "Monitoring", description: "Full-stack APM — payment path synthetic checks", status: "Connected", lastSynced: daysAgo(0.06), maskedToken: "dt_••••••••9f3a" },
  { id: "c19", name: "New Relic", category: "Monitoring", description: "Mobile BFF transaction tracing", status: "Connected", lastSynced: daysAgo(0.11), maskedToken: "nr_••••••••2e5d" },
  { id: "c43", name: "Prometheus", category: "Monitoring", description: "Metrics TSDB — SLO recording rules for release windows", status: "Connected", lastSynced: daysAgo(0.04), maskedToken: "prom_••••••••2c9f" },
  { id: "c44", name: "OpenTelemetry", category: "Monitoring", description: "Unified traces & metrics — collector fleet in all clusters", status: "Connected", lastSynced: daysAgo(0.05), maskedToken: "otel_••••••••7b4a" },
  { id: "c45", name: "Jaeger", category: "Monitoring", description: "Distributed tracing — payment path span analysis", status: "Connected", lastSynced: daysAgo(0.07), maskedToken: "jgr_••••••••5e1d" },

  // Incident & on-call
  { id: "c8", name: "PagerDuty", category: "Incident", description: "On-call schedules — 2 active Sev-2 incidents", status: "Connected", lastSynced: daysAgo(0.03), maskedToken: "pd_••••••••8e2c" },
  { id: "c20", name: "Opsgenie", category: "Incident", description: "Escalation policies — SRE & Platform rotations", status: "Connected", lastSynced: daysAgo(0.05), maskedToken: "og_••••••••1a7f" },
  { id: "c21", name: "Statuspage", category: "Incident", description: "Customer comms — scheduled maintenance windows", status: "Connected", lastSynced: daysAgo(0.12), maskedToken: "sp_••••••••5c9b" },

  // Security
  { id: "c5", name: "Snyk", category: "Security", description: "SCA & container scans — 3 critical vulns open", status: "Connected", lastSynced: daysAgo(0.08), maskedToken: "sk-••••••••1c4e" },
  { id: "c22", name: "SonarQube", category: "Security", description: "Code quality gates — 2 projects below threshold", status: "Connected", lastSynced: daysAgo(0.07), maskedToken: "son_••••••••8d2e" },
  { id: "c23", name: "Checkmarx", category: "Security", description: "SAST scans — last sync failed, retry scheduled", status: "Error", lastSynced: daysAgo(0.5), maskedToken: "cx_••••••••3b6a" },
  { id: "c24", name: "Wiz", category: "Security", description: "Cloud posture — 1 high-severity misconfiguration", status: "Connected", lastSynced: daysAgo(0.1), maskedToken: "wiz_••••••••6e4c" },

  // Documentation
  { id: "c6", name: "Confluence", category: "Documentation", description: "Runbooks & release notes — 24 pages linked", status: "Connected", lastSynced: daysAgo(0.15), maskedToken: "conf_••••••••6d9b" },
  { id: "c25", name: "SharePoint", category: "Documentation", description: "CAB packs & steering committee decks", status: "Connected", lastSynced: daysAgo(0.2), maskedToken: "sp_••••••••4f8d" },

  // Communication
  { id: "c7", name: "Slack", category: "Communication", description: "Alerts — #release-ops, #platform-oncall", status: "Connected", lastSynced: daysAgo(0.01), maskedToken: "xoxb-••••••••3f7a" },
  { id: "c26", name: "Microsoft Teams", category: "Communication", description: "CAB & exec briefings — 3 channels wired", status: "Connected", lastSynced: daysAgo(0.02), maskedToken: "msteams_••••••••7c1e" },

  // Deployment & platform
  { id: "c27", name: "Argo CD", category: "Deployment", description: "GitOps — 18 apps across prod & staging clusters", status: "Connected", lastSynced: daysAgo(0.04), maskedToken: "argo_••••••••9a2b" },
  { id: "c28", name: "Kubernetes (EKS)", category: "Deployment", description: "Target clusters — 4 envs, rollout status synced", status: "Connected", lastSynced: daysAgo(0.03), maskedToken: "k8s_••••••••2d5f" },
  { id: "c29", name: "Terraform Cloud", category: "Deployment", description: "IaC state — infra drift checks pre-deploy", status: "Connected", lastSynced: daysAgo(0.09), maskedToken: "tf_••••••••8b3c" },
  { id: "c46", name: "Flux CD", category: "Deployment", description: "GitOps reconciler — staging cluster auto-sync", status: "Connected", lastSynced: daysAgo(0.04), maskedToken: "flux_••••••••9c2e" },
  { id: "c47", name: "Spinnaker", category: "Deployment", description: "Multi-cloud CD — canary & red-black strategies", status: "Connected", lastSynced: daysAgo(0.06), maskedToken: "spin_••••••••4a8f" },
  { id: "c48", name: "Octopus Deploy", category: "Deployment", description: ".NET & worker services — tenanted prod deploys", status: "Connected", lastSynced: daysAgo(0.08), maskedToken: "octo_••••••••3f7b" },
  { id: "c49", name: "OpenShift", category: "Deployment", description: "Enterprise K8s — 2 clusters, rollout monitoring", status: "Connected", lastSynced: daysAgo(0.05), maskedToken: "ocp_••••••••6d4c" },
  { id: "c50", name: "AWS CodeDeploy", category: "Deployment", description: "Blue-green & in-place — legacy billing workers", status: "Connected", lastSynced: daysAgo(0.07), maskedToken: "cd_••••••••1e9a" },
  { id: "c51", name: "Pulumi Cloud", category: "Deployment", description: "IaC deployments — preview runs on release PRs", status: "Connected", lastSynced: daysAgo(0.09), maskedToken: "plm_••••••••8b5d" },
  { id: "c52", name: "Ansible Automation Platform", category: "Deployment", description: "Config management — pre/post-deploy playbooks", status: "Disconnected", lastSynced: daysAgo(21), maskedToken: "aap_••••••••2c6e" },

  // Artifact registry
  { id: "c53", name: "JFrog Artifactory", category: "Artifact Registry", description: "Universal artifacts — Maven, npm, Docker promotion", status: "Connected", lastSynced: daysAgo(0.03), maskedToken: "jfrog_••••••••7a3f" },
  { id: "c54", name: "Sonatype Nexus", category: "Artifact Registry", description: "Binary repo — release candidate image tagging", status: "Connected", lastSynced: daysAgo(0.05), maskedToken: "nxs_••••••••4d2b" },
  { id: "c55", name: "AWS ECR", category: "Artifact Registry", description: "Container registry — 186 images across 9 repos", status: "Connected", lastSynced: daysAgo(0.02), maskedToken: "ecr_••••••••9f1c" },
  { id: "c56", name: "Harbor", category: "Artifact Registry", description: "Private registry — vulnerability scan on push", status: "Connected", lastSynced: daysAgo(0.06), maskedToken: "hrb_••••••••5c8a" },
  { id: "c57", name: "Docker Hub", category: "Artifact Registry", description: "Public base images — pinned tags in Dockerfiles", status: "Connected", lastSynced: daysAgo(0.1), maskedToken: "dhub_••••••••3e7d" },

  // Feature flags & secrets
  { id: "c30", name: "LaunchDarkly", category: "Feature Flags", description: "Progressive rollout flags — 12 tied to releases", status: "Connected", lastSynced: daysAgo(0.06), maskedToken: "ld_••••••••5e7a" },
  { id: "c31", name: "HashiCorp Vault", category: "Secrets & Config", description: "Secrets rotation — pre-deploy validation hooks", status: "Connected", lastSynced: daysAgo(0.08), maskedToken: "hvt_••••••••1f9d" },
  { id: "c32", name: "AWS Secrets Manager", category: "Secrets & Config", description: "Cloud secrets — payments & auth namespaces", status: "Connected", lastSynced: daysAgo(0.07), maskedToken: "asm_••••••••4c2b" },
  { id: "c58", name: "Consul", category: "Secrets & Config", description: "Service mesh config — traffic split during canaries", status: "Connected", lastSynced: daysAgo(0.08), maskedToken: "csl_••••••••6f3a" },
  { id: "c59", name: "etcd", category: "Secrets & Config", description: "Cluster config store — K8s backup before major releases", status: "Connected", lastSynced: daysAgo(0.11), maskedToken: "etcd_••••••••2b9e" },
];

export const activityFeed: ActivityFeedItem[] = [
  { id: "af1", timestamp: daysAgo(0.05), type: "human", actor: "Raj Patel", message: "Approved Database gate for v2.14.0", releaseId: "rel-v2140" },
  { id: "af2", timestamp: daysAgo(0.1), type: "agent", actor: "Risk Agent", agent: "Risk Agent", message: "Flagged unusual file-change volume on v2.14.0 (847 files vs ~280 median)", releaseId: "rel-v2140" },
  { id: "af3", timestamp: daysAgo(0.15), type: "human", actor: "Mike Torres", message: "Approved QA gate for v2.14.0", releaseId: "rel-v2140" },
  { id: "af4", timestamp: daysAgo(0.2), type: "agent", actor: "Build Agent", agent: "Build Agent", message: "Build #4468 failed for v2.13.5 — 22 integration test failures", releaseId: "rel-v2135" },
  { id: "af5", timestamp: daysAgo(0.25), type: "agent", actor: "Approval Agent", agent: "Approval Agent", message: "Security sign-off pending 72h on v2.14.0 (typical: 6h)", releaseId: "rel-v2140" },
  { id: "af6", timestamp: daysAgo(0.3), type: "human", actor: "Priya Sharma", message: "Created release v2.15.0", releaseId: "rel-v2150" },
  { id: "af7", timestamp: daysAgo(0.35), type: "agent", actor: "Dependency Agent", agent: "Dependency Agent", message: "v2.14.0 touches payments-api — 3 downstream services depend on it", releaseId: "rel-v2140" },
  { id: "af8", timestamp: daysAgo(0.4), type: "human", actor: "Sarah Chen", message: "Started Security review for v2.14.0", releaseId: "rel-v2140" },
  { id: "af9", timestamp: daysAgo(0.5), type: "human", actor: "Lisa Park", message: "Approved Business gate for v2.14.0", releaseId: "rel-v2140" },
  { id: "af10", timestamp: daysAgo(0.6), type: "human", actor: "Nina Okonkwo", message: "All gates green for v2.14.1 mobile patch", releaseId: "rel-v2141" },
  { id: "af11", timestamp: daysAgo(0.7), type: "agent", actor: "Ticket Agent", agent: "Ticket Agent", message: "PLAT-4422 runbook update still open for v2.14.0", releaseId: "rel-v2140" },
  { id: "af12", timestamp: daysAgo(0.8), type: "agent", actor: "Risk Agent", agent: "Risk Agent", message: "v2.15.0 file count 1203 — flagged as unusually large", releaseId: "rel-v2150" },
  { id: "af13", timestamp: daysAgo(1), type: "human", actor: "Tom Bradley", message: "Submitted change request CR-8842 for v2.14.0", releaseId: "rel-v2140" },
  { id: "af14", timestamp: daysAgo(1.2), type: "agent", actor: "Build Agent", agent: "Build Agent", message: "Build #4465 still running for v2.15.0 — 73% tests complete", releaseId: "rel-v2150" },
  { id: "af15", timestamp: daysAgo(1.5), type: "human", actor: "Mike Torres", message: "Rejected QA gate for v2.13.5 pending build fix", releaseId: "rel-v2135" },
  { id: "af16", timestamp: daysAgo(2), type: "agent", actor: "Approval Agent", agent: "Approval Agent", message: "Identity v2.13.8 Security review overdue 36h", releaseId: "rel-v2138" },
  { id: "af17", timestamp: daysAgo(2.5), type: "human", actor: "Emma Walsh", message: "Load test passed for payments-api (v2.14.0 scope)", releaseId: "rel-v2140" },
  { id: "af18", timestamp: daysAgo(3), type: "agent", actor: "Summary Agent", agent: "Summary Agent", message: "Morning digest: 5 active releases, 2 at risk, 1 blocked", releaseId: undefined },
  { id: "af19", timestamp: daysAgo(3.5), type: "human", actor: "Alex Kim", message: "Escalated v2.13.5 build failure to Platform team", releaseId: "rel-v2135" },
  { id: "af20", timestamp: daysAgo(4), type: "agent", actor: "Dependency Agent", agent: "Dependency Agent", message: "analytics-pipeline marked unstable — v2.15.0 touches this service", releaseId: "rel-v2150" },
  { id: "af21", timestamp: daysAgo(5), type: "human", actor: "David Frost", message: "Index rebuild 60% complete for v2.15.0", releaseId: "rel-v2150" },
  { id: "af22", timestamp: daysAgo(6), type: "agent", actor: "Risk Agent", agent: "Risk Agent", message: "Friday releases show 2x rollback rate in last 6 months", releaseId: undefined },
  { id: "af23", timestamp: daysAgo(7), type: "human", actor: "Chris Nguyen", message: "Shipped v2.12.4 Payments release successfully", releaseId: "rel-gen-28" },
  { id: "af24", timestamp: daysAgo(8), type: "agent", actor: "Conversation Agent", agent: "Conversation Agent", message: "Answered 14 release readiness questions today", releaseId: undefined },
  { id: "af25", timestamp: daysAgo(10), type: "human", actor: "Jordan Lee", message: "Merged payment routing PR for v2.14.0", releaseId: "rel-v2140" },
  { id: "af26", timestamp: daysAgo(12), type: "agent", actor: "Ticket Agent", agent: "Ticket Agent", message: "BILL-893 blocked — integration test suite failing", releaseId: "rel-v2135" },
  { id: "af27", timestamp: daysAgo(14), type: "human", actor: "Sarah Chen", message: "Approved Security gate for v2.13.5", releaseId: "rel-v2135" },
  { id: "af28", timestamp: daysAgo(16), type: "agent", actor: "Build Agent", agent: "Build Agent", message: "Suspect commit c4d8e91 linked to v2.13.5 test failures", releaseId: "rel-v2135" },
  { id: "af29", timestamp: daysAgo(18), type: "human", actor: "Priya Sharma", message: "Marked Go for v2.12.0 Core release", releaseId: "rel-gen-20" },
  { id: "af30", timestamp: daysAgo(21), type: "agent", actor: "Risk Agent", agent: "Risk Agent", message: "Rollback recorded for Friday v2.11.3 deploy", releaseId: "rel-gen-15" },
];

export const agents: AgentMeta[] = [
  {
    id: "ag1", name: "Ticket Agent", watches: "Linked tickets/stories", description: "Flags stuck or reopened tickets",
    tagline: "Work tracking", accent: "from-brand-400 via-brand-500 to-blue-500",
    status: "Active", lastRanMinutesAgo: 4, liveAi: true, sparkline: [2, 3, 1, 4, 2, 3, 5],
    sampleFindings: [
      { text: "PLAT-4418 Security review still in progress", releaseId: "rel-v2140", timestamp: daysAgo(0.1) },
      { text: "PLAT-4422 runbook update open — blocking documentation gate", releaseId: "rel-v2140", timestamp: daysAgo(0.3) },
      { text: "BILL-893 integration tests blocked", releaseId: "rel-v2135", timestamp: daysAgo(0.5) },
    ],
  },
  {
    id: "ag2", name: "Build Agent", watches: "CI/CD connectors", description: "Explains build failures in plain English",
    tagline: "Pipeline intel", accent: "from-orange-500 via-amber-500 to-yellow-500",
    status: "Active", lastRanMinutesAgo: 2, liveAi: true, sparkline: [1, 2, 5, 3, 2, 1, 4],
    sampleFindings: [
      { text: "Build #4468 failed — 22 invoice integration test failures", releaseId: "rel-v2135", timestamp: daysAgo(0.2) },
      { text: "Suspect commit c4d8e91 — rounding logic change", releaseId: "rel-v2135", timestamp: daysAgo(0.4) },
      { text: "Build #4465 running — 73% complete for v2.15.0", releaseId: "rel-v2150", timestamp: daysAgo(0.1) },
    ],
  },
  {
    id: "ag3", name: "Approval Agent", watches: "Approval checklist", description: "Nudges overdue sign-offs",
    tagline: "Gate keeper", accent: "from-blue-500 via-brand-500 to-indigo-500",
    status: "Active", lastRanMinutesAgo: 6, liveAi: true, sparkline: [3, 2, 4, 3, 5, 4, 3],
    sampleFindings: [
      { text: "Security pending 72h on v2.14.0 (typical: 6h)", releaseId: "rel-v2140", timestamp: daysAgo(0.5) },
      { text: "Identity v2.13.8 Security review overdue 36h", releaseId: "rel-v2138", timestamp: daysAgo(1) },
      { text: "v2.15.0 has 5 pending gates — none approved yet", releaseId: "rel-v2150", timestamp: daysAgo(0.8) },
    ],
  },
  {
    id: "ag4", name: "Dependency Agent", watches: "Service graph", description: "Cross-service impact warnings",
    tagline: "Blast radius", accent: "from-cyan-500 via-teal-500 to-emerald-500",
    status: "Active", lastRanMinutesAgo: 8, liveAi: true, sparkline: [1, 1, 2, 3, 2, 2, 3],
    sampleFindings: [
      { text: "v2.14.0 touches payments-api with 4 downstream dependents", releaseId: "rel-v2140", timestamp: daysAgo(1) },
      { text: "analytics-pipeline unstable — in v2.15.0 scope", releaseId: "rel-v2150", timestamp: daysAgo(0.6) },
      { text: "fraud-detection is Critical — included in v2.14.0", releaseId: "rel-v2140", timestamp: daysAgo(1.2) },
    ],
  },
  {
    id: "ag5", name: "Risk Agent", watches: "Release history & ML", description: "Unusual patterns and forecast flags",
    tagline: "Pattern detection", accent: "from-rose-500 via-red-500 to-orange-500",
    status: "Active", lastRanMinutesAgo: 3, liveAi: true, sparkline: [2, 4, 3, 5, 4, 6, 5],
    sampleFindings: [
      { text: "847 files changed on v2.14.0 — 3x team median", releaseId: "rel-v2140", timestamp: daysAgo(0.2) },
      { text: "Friday releases: 2x rollback rate vs weekday (6-month trend)", releaseId: undefined, timestamp: daysAgo(2) },
      { text: "v2.15.0 at 1203 files — largest release this quarter", releaseId: "rel-v2150", timestamp: daysAgo(0.4) },
    ],
  },
  {
    id: "ag6", name: "Summary Agent", watches: "All agents", description: "Daily plain-English digest",
    tagline: "Executive brief", accent: "from-brand-500 via-brand-400 to-blue-400",
    status: "Active", lastRanMinutesAgo: 1, liveAi: false, sparkline: [1, 1, 1, 2, 1, 1, 1],
    sampleFindings: [
      { text: "Morning digest: 5 active releases, 2 at risk, 1 blocked", timestamp: daysAgo(0.05) },
      { text: "Weekly summary: 8 releases shipped, 2 rollbacks", timestamp: daysAgo(7) },
    ],
  },
  {
    id: "ag7", name: "Conversation Agent", watches: "All data", description: "Free-text Q&A with citations",
    tagline: "Ask anything", accent: "from-fuchsia-500 via-pink-500 to-rose-500",
    status: "Active", lastRanMinutesAgo: 0, liveAi: false, sparkline: [5, 8, 6, 10, 7, 9, 12],
    sampleFindings: [
      { text: "Answered 'Can we ship v2.14.0 tonight?'", releaseId: "rel-v2140", timestamp: daysAgo(0.01) },
      { text: "Answered 'Which team has most blockers?'", timestamp: daysAgo(0.5) },
      { text: "14 readiness questions answered today", timestamp: daysAgo(0.1) },
    ],
  },
  {
    id: "ag8", name: "Comms Agent", watches: "Slack, Teams, email", description: "Drafts stakeholder and exec comms",
    tagline: "Stakeholder voice", accent: "from-sky-500 via-blue-500 to-indigo-500",
    status: "Active", lastRanMinutesAgo: 5, liveAi: true, sparkline: [2, 3, 2, 4, 3, 5, 4],
    sampleFindings: [
      { text: "Drafted exec update for v2.14.0 Security delay", releaseId: "rel-v2140", timestamp: daysAgo(0.3) },
      { text: "Suggested #release-ops post for v2.13.5 build failure", releaseId: "rel-v2135", timestamp: daysAgo(0.4) },
      { text: "Teams CAB reminder queued for tomorrow", releaseId: "rel-v2140", timestamp: daysAgo(0.6) },
    ],
  },
  {
    id: "ag9", name: "CAB Agent", watches: "ServiceNow CRs", description: "Pre-CAB briefings and change narratives",
    tagline: "Change governance", accent: "from-slate-600 via-gray-700 to-zinc-800",
    status: "Active", lastRanMinutesAgo: 7, liveAi: true, sparkline: [1, 2, 1, 3, 2, 2, 4],
    sampleFindings: [
      { text: "CR-8842 briefing pack ready for Weekly Production CAB", releaseId: "rel-v2140", timestamp: daysAgo(0.5) },
      { text: "High-risk tier flagged — backout plan validated", releaseId: "rel-v2140", timestamp: daysAgo(0.7) },
      { text: "v2.14.1 low-risk — fast-track CAB slot available", releaseId: "rel-v2141", timestamp: daysAgo(0.4) },
    ],
  },
  {
    id: "ag10", name: "Deploy Agent", watches: "Argo CD, K8s, Harness", description: "Live rollout monitoring and smoke test analysis",
    tagline: "Ship watch", accent: "from-emerald-500 via-green-500 to-teal-500",
    status: "Active", lastRanMinutesAgo: 1, liveAi: true, sparkline: [3, 5, 4, 6, 8, 5, 7],
    sampleFindings: [
      { text: "v2.14.0 rollout simulation: 847-file deploy — allow 45min window", releaseId: "rel-v2140", timestamp: daysAgo(0.1) },
      { text: "payments-api pod rollout at 73% — error rate stable", releaseId: "rel-v2140", timestamp: daysAgo(0.05) },
      { text: "v2.14.1 Harness pipeline green — ready for one-click promote", releaseId: "rel-v2141", timestamp: daysAgo(0.2) },
    ],
  },
  {
    id: "ag11", name: "Security Agent", watches: "Snyk, SonarQube, Checkmarx", description: "Vuln scans and security gate analysis",
    tagline: "Threat surface", accent: "from-red-600 via-rose-600 to-pink-600",
    status: "Active", lastRanMinutesAgo: 4, liveAi: true, sparkline: [2, 3, 4, 3, 5, 4, 6],
    sampleFindings: [
      { text: "3 critical Snyk vulns open on v2.14.0 scope", releaseId: "rel-v2140", timestamp: daysAgo(0.3) },
      { text: "Checkmarx sync failed — retry before Security sign-off", releaseId: undefined, timestamp: daysAgo(0.5) },
      { text: "SonarQube gate passed for v2.14.1", releaseId: "rel-v2141", timestamp: daysAgo(0.4) },
    ],
  },
  {
    id: "ag12", name: "SLO Agent", watches: "Datadog, Prometheus, Grafana", description: "Error budgets and latency SLO burn alerts",
    tagline: "Reliability", accent: "from-amber-500 via-orange-500 to-red-500",
    status: "Active", lastRanMinutesAgo: 2, liveAi: true, sparkline: [4, 3, 5, 4, 6, 5, 7],
    sampleFindings: [
      { text: "payments-api error budget 68% consumed this month", releaseId: "rel-v2140", timestamp: daysAgo(0.2) },
      { text: "p99 latency spike risk during v2.14.0 deploy window", releaseId: "rel-v2140", timestamp: daysAgo(0.4) },
      { text: "All SLOs green for v2.14.1 mobile patch", releaseId: "rel-v2141", timestamp: daysAgo(0.3) },
    ],
  },
  {
    id: "ag13", name: "Runbook Agent", watches: "Confluence, SharePoint", description: "Runbook completeness before ship",
    tagline: "Ops docs", accent: "from-teal-500 via-cyan-500 to-blue-500",
    status: "Active", lastRanMinutesAgo: 9, liveAi: true, sparkline: [1, 2, 2, 3, 2, 3, 2],
    sampleFindings: [
      { text: "PLAT-4422 runbook update still open for v2.14.0", releaseId: "rel-v2140", timestamp: daysAgo(0.3) },
      { text: "DB migration runbook missing rollback section", releaseId: "rel-v2140", timestamp: daysAgo(0.6) },
      { text: "v2.14.1 runbook verified — 24 Confluence pages linked", releaseId: "rel-v2141", timestamp: daysAgo(0.5) },
    ],
  },
];

export function getAllHistory() {
  return releases
    .flatMap((r) => r.history.map((h) => ({ ...h, releaseName: r.version, releaseId: r.id })))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export function getOrgContext() {
  return {
    releases: releases.map((r) => ({
      id: r.id,
      version: r.version,
      team: r.team,
      status: r.status,
      targetDate: r.targetDate,
      filesChanged: r.filesChanged,
      blockers: r.approvals.filter((a) => a.status === "Pending").map((a) => a.gate),
      buildStatus: r.build.status,
      openTickets: r.tickets.filter((t) => t.status !== "Done").length,
    })),
    historicalTrend,
    teams: TEAMS,
    services: services.map((s) => ({ id: s.id, name: s.name, criticality: s.criticality, unstable: s.unstable })),
    stats: {
      totalReleases: releases.length,
      atRisk: releases.filter((r) => r.status === "At Risk").length,
      blocked: releases.filter((r) => r.status === "Blocked").length,
      ready: releases.filter((r) => r.status === "Ready").length,
      shipped: releases.filter((r) => r.status === "Shipped").length,
    },
  };
}

export function getExecutiveContext(
  predictions: {
    version: string;
    shipSuccessPct: number;
    rollbackRiskPct: number;
    team: string;
  }[],
  portfolio: {
    activeCount: number;
    atRiskCount: number;
    avgReadiness: number;
    avgShipSuccess: number;
    highRollbackCount: number;
    shippingThisWeek: number;
  }
) {
  return {
    ...getOrgContext(),
    portfolio,
    mlPredictions: predictions.slice(0, 8),
    cabSessions: cabSessions.slice(0, 2),
  };
}
