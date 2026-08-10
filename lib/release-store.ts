import type {
  AppNotification,
  DeploymentLiveState,
  HistoryEntry,
  Release,
  ReleaseDecision,
  ReleaseDecisionRecord,
} from "./types";
import {
  createInitialDeploymentState,
  rollbackDeploymentState,
  startDeploymentState,
  tickDeployment,
} from "./deployment-sim";
import { getAllHistory, getOrgContext, releases } from "./dummy-data";
import { getConnectorIssues } from "./connectors";

export interface ReleaseStoreState {
  decisions: Record<string, ReleaseDecisionRecord>;
  extraHistory: Record<string, HistoryEntry[]>;
  notifications: AppNotification[];
  deployments: Record<string, DeploymentLiveState>;
  pausedAgents: Record<string, boolean>;
}

const defaultNotifications: AppNotification[] = [
  {
    id: "n1",
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    title: "Security sign-off overdue",
    message: "v2.14.0 Security gate pending 72h — CAB review scheduled tomorrow",
    releaseId: "rel-v2140",
    read: false,
    type: "approval",
  },
  {
    id: "n2",
    timestamp: new Date(Date.now() - 7200000).toISOString(),
    title: "Build failed",
    message: "v2.13.5 build #4468 — 22 integration test failures",
    releaseId: "rel-v2135",
    read: false,
    type: "build",
  },
  {
    id: "n3",
    timestamp: new Date(Date.now() - 14400000).toISOString(),
    title: "CAB agenda updated",
    message: "Weekly Production CAB tomorrow — v2.14.0 and v2.14.1 on agenda",
    releaseId: "rel-v2140",
    read: false,
    type: "cab",
  },
];

export function emptyReleaseStore(): ReleaseStoreState {
  return {
    decisions: {},
    extraHistory: {},
    notifications: [...defaultNotifications],
    deployments: {},
    pausedAgents: {},
  };
}

/** @deprecated Live state is loaded from `/api/live-state`. Returns empty store for SSR. */
export function loadReleaseStore(): ReleaseStoreState {
  return emptyReleaseStore();
}

/** @deprecated Live state persists in SQLite via API routes. */
export function saveReleaseStore() {
  // no-op — operational state is server-backed
}

export function getDecision(state: ReleaseStoreState, releaseId: string): ReleaseDecisionRecord | null {
  return state.decisions[releaseId] ?? null;
}

export function getGlobalHistory(state: ReleaseStoreState) {
  const base = getAllHistory();
  const live = Object.entries(state.extraHistory).flatMap(([releaseId, entries]) => {
    const release = releases.find((r) => r.id === releaseId);
    return entries.map((h) => ({
      ...h,
      releaseName: release?.version ?? releaseId,
      releaseId,
    }));
  });
  const seen = new Set<string>();
  return [...live, ...base]
    .filter((h) => {
      if (seen.has(h.id)) return false;
      seen.add(h.id);
      return true;
    })
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export function buildLiveOrgContext(state: ReleaseStoreState) {
  const base = getOrgContext();
  const connectorIssues = getConnectorIssues().map((c) => ({
    name: c.name,
    status: c.status,
    category: c.category,
  }));

  return {
    ...base,
    releases: base.releases.map((r) => {
      const decision = state.decisions[r.id];
      const deploy = state.deployments[r.id];
      return {
        ...r,
        recordedDecision: decision?.decision ?? null,
        decisionRationale: decision?.rationale ?? null,
        deploymentPhase: deploy?.phase ?? null,
        rolloutPct: deploy?.rolloutPct ?? null,
      };
    }),
    liveDecisions: Object.entries(state.decisions).map(([releaseId, d]) => ({
      releaseId,
      ...d,
    })),
    liveDeployments: Object.entries(state.deployments).map(([releaseId, d]) => ({
      releaseId,
      phase: d.phase,
      rolloutPct: d.rolloutPct,
      autoRollback: d.autoRollback ?? false,
    })),
    connectorIssues,
    unreadNotifications: state.notifications.filter((n) => !n.read).slice(0, 8),
    pausedAgents: Object.entries(state.pausedAgents)
      .filter(([, paused]) => paused)
      .map(([id]) => id),
  };
}

export function setAgentPaused(
  state: ReleaseStoreState,
  agentId: string,
  paused: boolean
): ReleaseStoreState {
  return {
    ...state,
    pausedAgents: { ...state.pausedAgents, [agentId]: paused },
  };
}

export function isAgentPaused(state: ReleaseStoreState, agentId: string): boolean {
  return !!state.pausedAgents[agentId];
}

export function getMergedHistory(
  state: ReleaseStoreState,
  releaseId: string,
  baseHistory: HistoryEntry[]
): HistoryEntry[] {
  const extra = state.extraHistory[releaseId] ?? [];
  return [...baseHistory, ...extra].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}

export function recordDecision(
  state: ReleaseStoreState,
  releaseId: string,
  version: string,
  decision: ReleaseDecision,
  opts: { rationale?: string; overridden?: boolean; actor?: string }
): ReleaseStoreState {
  const decidedAt = new Date().toISOString();
  const decidedBy = opts.actor ?? "Priya Sharma";
  const entry: ReleaseDecisionRecord = {
    decision,
    rationale: opts.rationale,
    decidedAt,
    decidedBy,
    overridden: opts.overridden,
  };

  const historyEntry: HistoryEntry = {
    id: `dec-${releaseId}-${Date.now()}`,
    timestamp: decidedAt,
    actor: decidedBy,
    action: opts.overridden
      ? `${decision} decision recorded (override): ${opts.rationale}`
      : `${decision} decision recorded for ${version}`,
    type: "human",
  };

  const notification: AppNotification = {
    id: `n-dec-${Date.now()}`,
    timestamp: decidedAt,
    title: `${decision} decision — ${version}`,
    message: opts.rationale ?? `${decidedBy} recorded a ${decision} decision`,
    releaseId,
    read: false,
    type: "decision",
  };

  return {
    ...state,
    decisions: { ...state.decisions, [releaseId]: entry },
    extraHistory: {
      ...state.extraHistory,
      [releaseId]: [...(state.extraHistory[releaseId] ?? []), historyEntry],
    },
    notifications: [notification, ...state.notifications],
  };
}

export function recordReminderSent(
  state: ReleaseStoreState,
  releaseId: string,
  version: string,
  gate: string,
  channel: string
): ReleaseStoreState {
  const timestamp = new Date().toISOString();
  const historyEntry: HistoryEntry = {
    id: `rem-${releaseId}-${Date.now()}`,
    timestamp,
    actor: "Priya Sharma",
    action: `Sent ${gate} approval reminder via ${channel} for ${version}`,
    type: "human",
  };
  const notification: AppNotification = {
    id: `n-comms-${Date.now()}`,
    timestamp,
    title: "Reminder sent",
    message: `${gate} reminder queued to ${channel} for ${version}`,
    releaseId,
    read: false,
    type: "comms",
  };

  return {
    ...state,
    extraHistory: {
      ...state.extraHistory,
      [releaseId]: [...(state.extraHistory[releaseId] ?? []), historyEntry],
    },
    notifications: [notification, ...state.notifications],
  };
}

export function markNotificationRead(state: ReleaseStoreState, id: string): ReleaseStoreState {
  return {
    ...state,
    notifications: state.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
  };
}

export function markAllNotificationsRead(state: ReleaseStoreState): ReleaseStoreState {
  return {
    ...state,
    notifications: state.notifications.map((n) => ({ ...n, read: true })),
  };
}

export function unreadCount(state: ReleaseStoreState): number {
  return state.notifications.filter((n) => !n.read).length;
}

export function getDeployment(
  state: ReleaseStoreState,
  releaseId: string,
  release: Release
): DeploymentLiveState {
  if (state.deployments[releaseId]) return state.deployments[releaseId];
  if (release.status === "Shipped") {
    return createInitialDeploymentState(release, "Verified");
  }
  return createInitialDeploymentState(release, "Not Started");
}

function withDeployHistory(
  state: ReleaseStoreState,
  releaseId: string,
  action: string,
  actor = "Priya Sharma"
): ReleaseStoreState {
  const entry: HistoryEntry = {
    id: `dep-${releaseId}-${Date.now()}`,
    timestamp: new Date().toISOString(),
    actor,
    action,
    type: actor.endsWith(" Agent") ? "agent" : "human",
    ...(actor.endsWith(" Agent") ? { agent: actor as HistoryEntry["agent"] } : {}),
  };
  return {
    ...state,
    extraHistory: {
      ...state.extraHistory,
      [releaseId]: [...(state.extraHistory[releaseId] ?? []), entry],
    },
  };
}

export function startDeployment(
  state: ReleaseStoreState,
  releaseId: string,
  release: Release,
  version: string
): ReleaseStoreState {
  const deploy = startDeploymentState(release);
  const notification: AppNotification = {
    id: `n-dep-${Date.now()}`,
    timestamp: new Date().toISOString(),
    title: "Deployment started",
    message: `${version} rolling out to ${release.deployment?.environment ?? "production"}`,
    releaseId,
    read: false,
    type: "decision",
  };
  return withDeployHistory(
    {
      ...state,
      deployments: { ...state.deployments, [releaseId]: deploy },
      notifications: [notification, ...state.notifications],
    },
    releaseId,
    `Started deployment to ${release.deployment?.environment ?? "production"} (${release.deployment?.pipeline ?? "Argo CD"})`
  );
}

export function tickDeploymentLive(
  state: ReleaseStoreState,
  releaseId: string,
  release: Release
): ReleaseStoreState {
  const current = getDeployment(state, releaseId, release);
  if (!["In Progress", "Verifying"].includes(current.phase)) return state;
  const next = tickDeployment(current, release);
  if (next === current) return state;

  let nextState: ReleaseStoreState = {
    ...state,
    deployments: { ...state.deployments, [releaseId]: next },
  };

  if (next.autoRollback && !current.autoRollback) {
    nextState = withDeployHistory(
      nextState,
      releaseId,
      `Auto-rollback triggered — ${next.rollbackReason ?? "metric threshold breached"}`,
      "Risk Agent"
    );
    nextState = {
      ...nextState,
      notifications: [
        {
          id: `n-arb-${Date.now()}`,
          timestamp: new Date().toISOString(),
          title: "Auto-rollback triggered",
          message: `${release.version}: ${next.rollbackReason ?? "Live metrics exceeded threshold"}`,
          releaseId,
          read: false,
          type: "decision",
        },
        ...nextState.notifications,
      ],
    };
  }

  if (current.phase !== next.phase && next.phase === "Verified") {
    nextState = withDeployHistory(nextState, releaseId, `Deployment verified — smoke tests passed`);
    nextState = {
      ...nextState,
      notifications: [
        {
          id: `n-ver-${Date.now()}`,
          timestamp: new Date().toISOString(),
          title: "Deployment verified",
          message: `${release.version} live and healthy`,
          releaseId,
          read: false,
          type: "decision",
        },
        ...nextState.notifications,
      ],
    };
  }

  return nextState;
}

export function setRollbackNarrative(
  state: ReleaseStoreState,
  releaseId: string,
  narrative: string
): ReleaseStoreState {
  const deploy = state.deployments[releaseId];
  if (!deploy) return state;
  return {
    ...state,
    deployments: {
      ...state.deployments,
      [releaseId]: { ...deploy, rollbackNarrative: narrative },
    },
  };
}

export function initiateRollback(
  state: ReleaseStoreState,
  releaseId: string,
  release: Release,
  version: string,
  opts?: { auto?: boolean; reason?: string }
): ReleaseStoreState {
  const current = getDeployment(state, releaseId, release);
  const rolled = rollbackDeploymentState(current, release, opts);
  return withDeployHistory(
    {
      ...state,
      deployments: { ...state.deployments, [releaseId]: rolled },
      notifications: [
        {
          id: `n-rb-${Date.now()}`,
          timestamp: new Date().toISOString(),
          title: opts?.auto ? "Auto-rollback initiated" : "Rollback initiated",
          message: `${version} reverting via blue-green switch${opts?.reason ? ` — ${opts.reason}` : ""}`,
          releaseId,
          read: false,
          type: "decision",
        },
        ...state.notifications,
      ],
    },
    releaseId,
    opts?.auto
      ? `Auto-rollback for ${version} — ${opts.reason ?? "threshold breach"}`
      : `Rollback initiated for ${version} — ${release.deployment?.pipeline ?? "Argo CD"}`,
    opts?.auto ? "Risk Agent" : undefined
  );
}
