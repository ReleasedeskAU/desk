import {
  computeLiveDeploymentState,
  createIncidentDeployState,
  startedAtForRollout,
} from "./deployment-sim";
import { getAllHistory, releases } from "./dummy-data";
import { getDefaultOrganizationId } from "./org-compat";
import { prisma, withDbRetry } from "./prisma";
import type {
  AppNotification,
  DeploymentLiveState,
  HistoryEntry,
  Release,
  ReleaseDecision,
  ReleaseDecisionRecord,
} from "./types";
import type { ReleaseStoreState, QuickStartSeedId } from "./release-store";
import { emptyReleaseStore } from "./release-store";

const DEFAULT_NOTIFICATIONS: Omit<AppNotification, "id">[] = [
  {
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    title: "Security sign-off overdue",
    message: "v2.14.0 Security gate pending 72h — CAB review scheduled tomorrow",
    releaseId: "rel-v2140",
    read: false,
    type: "approval",
  },
  {
    timestamp: new Date(Date.now() - 7200000).toISOString(),
    title: "Build failed",
    message: "v2.13.5 build #4468 — 22 integration test failures",
    releaseId: "rel-v2135",
    read: false,
    type: "build",
  },
  {
    timestamp: new Date(Date.now() - 14400000).toISOString(),
    title: "CAB agenda updated",
    message: "Weekly Production CAB tomorrow — v2.14.0 and v2.14.1 on agenda",
    releaseId: "rel-v2140",
    read: false,
    type: "cab",
  },
];

function releaseById(releaseId: string): Release | undefined {
  return releases.find((r) => r.id === releaseId);
}

function toDecisionRecord(row: {
  decision: string | null;
  rationale: string | null;
  decidedAt: Date | null;
  decidedBy: string | null;
  overridden: boolean;
}): ReleaseDecisionRecord | null {
  if (!row.decision || !row.decidedAt || !row.decidedBy) return null;
  return {
    decision: row.decision as ReleaseDecision,
    rationale: row.rationale ?? undefined,
    decidedAt: row.decidedAt.toISOString(),
    decidedBy: row.decidedBy,
    overridden: row.overridden,
  };
}

function newNotificationId(): string {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 10);
  return `c${t}${r}`.slice(0, 25);
}

async function ensureDefaultNotifications() {
  try {
    const count = await prisma.appNotificationRow.count();
    if (count > 0) return;

    const organizationId = await getDefaultOrganizationId();
    if (!organizationId) {
      // v2 DB requires organizationId; without an org, skip demo seed quietly.
      console.warn("[live-state] ensureDefaultNotifications skipped: no organizationId");
      return;
    }

    for (const n of DEFAULT_NOTIFICATIONS) {
      const id = newNotificationId();
      const ts = new Date(n.timestamp);
      await prisma.$executeRaw`
        INSERT INTO "AppNotificationRow"
          (id, timestamp, title, message, "releaseId", read, type, "organizationId")
        VALUES
          (${id}, ${ts}, ${n.title}, ${n.message}, ${n.releaseId}, ${n.read}, ${n.type}, ${organizationId})
      `;
    }
  } catch (err) {
    // Neon P1001 / pooler wake / schema drift — skip seeding; live-state can still serve empty/stale.
    console.warn("[live-state] ensureDefaultNotifications skipped:", err);
  }
}

async function appendHistory(
  releaseId: string,
  actor: string,
  action: string,
  type: "human" | "agent",
  agent?: string
) {
  return prisma.releaseHistoryEvent.create({
    data: { releaseId, actor, action, type, agent },
  });
}

async function appendNotification(data: {
  title: string;
  message: string;
  releaseId?: string;
  type: AppNotification["type"];
}) {
  const organizationId = await getDefaultOrganizationId();
  if (!organizationId) {
    return prisma.appNotificationRow.create({ data });
  }
  const id = newNotificationId();
  const ts = new Date();
  const releaseId = data.releaseId ?? null;
  await prisma.$executeRaw`
    INSERT INTO "AppNotificationRow"
      (id, timestamp, title, message, "releaseId", read, type, "organizationId")
    VALUES
      (${id}, ${ts}, ${data.title}, ${data.message}, ${releaseId}, false, ${data.type}, ${organizationId})
  `;
  return prisma.appNotificationRow.findUniqueOrThrow({ where: { id } });
}

export async function getDecision(releaseId: string): Promise<ReleaseDecisionRecord | null> {
  const row = await prisma.releaseDecisionState.findUnique({ where: { releaseId } });
  if (!row) return null;
  return toDecisionRecord(row);
}

export async function recordDecision(
  releaseId: string,
  version: string,
  decision: ReleaseDecision,
  opts: { rationale?: string; overridden?: boolean; actor: string }
) {
  const decidedAt = new Date();
  await prisma.releaseDecisionState.upsert({
    where: { releaseId },
    update: {
      decision,
      rationale: opts.rationale,
      decidedAt,
      decidedBy: opts.actor,
      overridden: opts.overridden ?? false,
    },
    create: {
      releaseId,
      decision,
      rationale: opts.rationale,
      decidedAt,
      decidedBy: opts.actor,
      overridden: opts.overridden ?? false,
    },
  });

  await appendHistory(
    releaseId,
    opts.actor,
    opts.overridden
      ? `${decision} decision recorded (override): ${opts.rationale}`
      : `${decision} decision recorded for ${version}`,
    "human"
  );

  await appendNotification({
    title: `${decision} decision — ${version}`,
    message: opts.rationale ?? `${opts.actor} recorded a ${decision} decision`,
    releaseId,
    type: "decision",
  });
}

export async function recordReminderSent(
  releaseId: string,
  version: string,
  gate: string,
  channel: string,
  actor: string
) {
  await appendHistory(
    releaseId,
    actor,
    `Sent ${gate} approval reminder via ${channel} for ${version}`,
    "human"
  );
  await appendNotification({
    title: "Reminder sent",
    message: `${gate} reminder queued to ${channel} for ${version}`,
    releaseId,
    type: "comms",
  });
}

export async function getDeploymentLive(release: Release, now = new Date()): Promise<DeploymentLiveState> {
  const row = await prisma.deploymentState.findUnique({ where: { releaseId: release.id } });
  if (!row) return computeLiveDeploymentState(release, null, now);

  return computeLiveDeploymentState(
    release,
    {
      phase: row.phase as DeploymentLiveState["phase"],
      startedAt: row.startedAt,
      rollbackReason: row.rollbackReason,
      rollbackNarrative: row.rollbackNarrative,
      rolledBackAt: row.rolledBackAt,
    },
    now
  );
}

async function persistDeploymentRollback(
  releaseId: string,
  release: Release,
  reason: string,
  auto: boolean
) {
  const now = new Date();
  await prisma.deploymentState.update({
    where: { releaseId },
    data: {
      phase: "Rolled Back",
      rolledBackAt: now,
      rollbackReason: reason,
    },
  });
  await appendHistory(
    releaseId,
    auto ? "Risk Agent" : "System",
    auto
      ? `Auto-rollback triggered — ${reason}`
      : `Auto-rollback for ${release.version} — ${reason}`,
    auto ? "agent" : "human",
    auto ? "Risk Agent" : undefined
  );
  await appendNotification({
    title: "Auto-rollback triggered",
    message: `${release.version}: ${reason}`,
    releaseId,
    type: "decision",
  });
}

async function persistDeploymentVerified(releaseId: string, release: Release) {
  await prisma.deploymentState.update({
    where: { releaseId },
    data: { phase: "Verified" },
  });
  await appendHistory(releaseId, "System", "Deployment verified — smoke tests passed", "human");
  await appendNotification({
    title: "Deployment verified",
    message: `${release.version} live and healthy`,
    releaseId,
    type: "decision",
  });
}

/** Reconcile computed deployment with DB — idempotent auto-rollback / verified transitions. */
async function reconcileDeployment(release: Release, now = new Date()): Promise<DeploymentLiveState> {
  const row = await prisma.deploymentState.findUnique({ where: { releaseId: release.id } });
  if (!row) return computeLiveDeploymentState(release, null, now);

  const computed = computeLiveDeploymentState(
    release,
    {
      phase: row.phase as DeploymentLiveState["phase"],
      startedAt: row.startedAt,
      rollbackReason: row.rollbackReason,
      rollbackNarrative: row.rollbackNarrative,
      rolledBackAt: row.rolledBackAt,
    },
    now
  );

  if (
    computed.autoRollback &&
    computed.phase === "Rolled Back" &&
    !row.rolledBackAt &&
    row.phase !== "Rolled Back"
  ) {
    await persistDeploymentRollback(
      release.id,
      release,
      computed.rollbackReason ?? "metric threshold breached",
      true
    );
    return computed;
  }

  if (computed.phase === "Verified" && row.phase !== "Verified" && row.phase !== "Rolled Back") {
    await persistDeploymentVerified(release.id, release);
  }

  return computed;
}

export async function startDeployment(release: Release, actor: string) {
  const now = new Date();
  await prisma.deploymentState.upsert({
    where: { releaseId: release.id },
    update: { phase: "In Progress", startedAt: now, rolledBackAt: null, rollbackReason: null },
    create: { releaseId: release.id, phase: "In Progress", startedAt: now },
  });
  await appendHistory(
    release.id,
    actor,
    `Started deployment to ${release.deployment?.environment ?? "production"} (${release.deployment?.pipeline ?? "Argo CD"})`,
    "human"
  );
  await appendNotification({
    title: "Deployment started",
    message: `${release.version} rolling out to ${release.deployment?.environment ?? "production"}`,
    releaseId: release.id,
    type: "decision",
  });
}

export async function initiateRollback(
  release: Release,
  actor: string,
  opts?: { auto?: boolean; reason?: string }
) {
  const now = new Date();
  await prisma.deploymentState.upsert({
    where: { releaseId: release.id },
    update: {
      phase: "Rolled Back",
      rolledBackAt: now,
      rollbackReason: opts?.reason,
    },
    create: {
      releaseId: release.id,
      phase: "Rolled Back",
      rolledBackAt: now,
      rollbackReason: opts?.reason,
    },
  });
  const historyActor = opts?.auto ? "Risk Agent" : actor;
  await appendHistory(
    release.id,
    historyActor,
    opts?.auto
      ? `Auto-rollback for ${release.version} — ${opts.reason ?? "threshold breach"}`
      : `Rollback initiated for ${release.version} — ${release.deployment?.pipeline ?? "Argo CD"}`,
    opts?.auto ? "agent" : "human",
    opts?.auto ? "Risk Agent" : undefined
  );
  await appendNotification({
    title: opts?.auto ? "Auto-rollback initiated" : "Rollback initiated",
    message: `${release.version} reverting via blue-green switch${opts?.reason ? ` — ${opts.reason}` : ""}`,
    releaseId: release.id,
    type: "decision",
  });
}

export async function setRollbackNarrative(releaseId: string, narrative: string) {
  await prisma.deploymentState.update({
    where: { releaseId },
    data: { rollbackNarrative: narrative },
  });
}

export async function getNotifications(): Promise<AppNotification[]> {
  await ensureDefaultNotifications();
  const rows = await prisma.appNotificationRow.findMany({ orderBy: { timestamp: "desc" } });
  return rows.map((n) => ({
    id: n.id,
    timestamp: n.timestamp.toISOString(),
    title: n.title,
    message: n.message,
    releaseId: n.releaseId ?? undefined,
    read: n.read,
    type: n.type as AppNotification["type"],
  }));
}

export async function markNotificationRead(id: string) {
  await prisma.appNotificationRow.update({ where: { id }, data: { read: true } });
}

export async function markAllNotificationsRead() {
  await prisma.appNotificationRow.updateMany({ data: { read: true } });
}

export async function setAgentPaused(agentId: string, paused: boolean) {
  await prisma.agentPauseState.upsert({
    where: { agentId },
    update: { paused },
    create: { agentId, paused },
  });
}

export async function getPausedAgents(): Promise<Record<string, boolean>> {
  const rows = await prisma.agentPauseState.findMany({ where: { paused: true } });
  return Object.fromEntries(rows.map((r) => [r.agentId, true]));
}

function historyRowToEntry(row: {
  id: string;
  timestamp: Date;
  actor: string;
  action: string;
  type: string;
  agent: string | null;
}): HistoryEntry {
  return {
    id: row.id,
    timestamp: row.timestamp.toISOString(),
    actor: row.actor,
    action: row.action,
    type: row.type as HistoryEntry["type"],
    ...(row.agent ? { agent: row.agent as HistoryEntry["agent"] } : {}),
  };
}

export async function getExtraHistoryByRelease(): Promise<Record<string, HistoryEntry[]>> {
  const rows = await prisma.releaseHistoryEvent.findMany({ orderBy: { timestamp: "asc" } });
  const grouped: Record<string, HistoryEntry[]> = {};
  for (const row of rows) {
    const entry = historyRowToEntry(row);
    if (!grouped[row.releaseId]) {
      grouped[row.releaseId] = [];
    }
    grouped[row.releaseId].push(entry);
  }
  return grouped;
}

export async function getGlobalHistoryMerged(): Promise<
  (HistoryEntry & { releaseName?: string; releaseId?: string })[]
> {
  const extra = await prisma.releaseHistoryEvent.findMany({ orderBy: { timestamp: "desc" } });
  const live = extra.map((row) => {
    const release = releaseById(row.releaseId);
    return {
      ...historyRowToEntry(row),
      releaseName: release?.version ?? row.releaseId,
      releaseId: row.releaseId,
    };
  });
  const base = getAllHistory();
  const seen = new Set<string>();
  return [...live, ...base]
    .filter((h) => {
      if (seen.has(h.id)) return false;
      seen.add(h.id);
      return true;
    })
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export async function resetDemoState() {
  await prisma.releaseDecisionState.deleteMany();
  await prisma.deploymentState.deleteMany();
  await prisma.releaseHistoryEvent.deleteMany();
  await prisma.appNotificationRow.deleteMany();
  await prisma.agentPauseState.deleteMany();
  await ensureDefaultNotifications();
}

export async function applyQuickStartSeed(seedId: QuickStartSeedId, actor: string) {
  await resetDemoState();
  if (seedId === "reset") return;

  const rel2140 = releases.find((r) => r.id === "rel-v2140");
  const rel2141 = releases.find((r) => r.id === "rel-v2141");
  const now = new Date();

  switch (seedId) {
    case "go-v2141":
      if (rel2141) {
        await recordDecision(rel2141.id, rel2141.version, "Go", {
          rationale: "All gates green — low-risk mobile patch ready for production.",
          actor,
        });
      }
      break;
    case "green-path-v2141":
      if (rel2141) {
        await recordDecision(rel2141.id, rel2141.version, "Go", {
          rationale: "All gates green — low-risk mobile patch ready for production.",
          actor,
        });
        await prisma.deploymentState.create({
          data: { releaseId: rel2141.id, phase: "Verified" },
        });
      }
      break;
    case "deploy-mid-v2140":
      if (rel2140) {
        await recordDecision(rel2140.id, rel2140.version, "Go", {
          rationale: "Conditional Go — proceed with canary and auto-rollback guardrails.",
          overridden: true,
          actor,
        });
        await prisma.deploymentState.create({
          data: {
            releaseId: rel2140.id,
            phase: "In Progress",
            startedAt: startedAtForRollout(rel2140, 48, now),
          },
        });
      }
      break;
    case "deploy-incident-v2140":
      if (rel2140) {
        await recordDecision(rel2140.id, rel2140.version, "Go", {
          rationale: "Go with heightened monitoring during payments rollout.",
          overridden: true,
          actor,
        });
        const incident = createIncidentDeployState(rel2140);
        await prisma.deploymentState.create({
          data: {
            releaseId: rel2140.id,
            phase: "In Progress",
            startedAt: startedAtForRollout(rel2140, incident.rolloutPct, now),
          },
        });
      }
      break;
    case "deploy-verified-v2141":
      if (rel2141) {
        await recordDecision(rel2141.id, rel2141.version, "Go", {
          rationale: "Standard green-path promotion to production.",
          actor,
        });
        await prisma.deploymentState.create({
          data: { releaseId: rel2141.id, phase: "Verified" },
        });
      }
      break;
  }
}

/** Aggregated live state for the release store context. */
const LIVE_STATE_TTL_MS = 25_000;
let liveStateCache: { at: number; data: ReleaseStoreState } | null = null;
let liveStateInflight: Promise<ReleaseStoreState> | null = null;

async function loadLiveState(): Promise<ReleaseStoreState> {
  return withDbRetry(
    async () => {
      await ensureDefaultNotifications();
      const now = new Date();

      const [decisionRows, deploymentRows, notifications, pausedAgents, extraHistory] = await Promise.all([
        prisma.releaseDecisionState.findMany(),
        prisma.deploymentState.findMany(),
        getNotifications(),
        getPausedAgents(),
        getExtraHistoryByRelease(),
      ]);

      const decisions: ReleaseStoreState["decisions"] = {};
      for (const row of decisionRows) {
        const rec = toDecisionRecord(row);
        if (rec) decisions[row.releaseId] = rec;
      }

      const deployments: Record<string, DeploymentLiveState> = {};
      for (const row of deploymentRows) {
        const release = releaseById(row.releaseId);
        if (!release) continue;
        deployments[row.releaseId] = await reconcileDeployment(release, now);
      }

      return {
        decisions,
        extraHistory,
        notifications,
        deployments,
        pausedAgents,
      };
    },
    { attempts: 4, baseDelayMs: 800, label: "live-state" }
  );
}

export async function getLiveState(): Promise<ReleaseStoreState> {
  const now = Date.now();
  if (liveStateCache && now - liveStateCache.at < LIVE_STATE_TTL_MS) {
    return liveStateCache.data;
  }
  if (liveStateInflight) return liveStateInflight;

  // Neon serverless can briefly return P1001 (can't reach) while waking / pooler blip.
  // Prefer stale cache over a hard 500 so the UI keeps polling instead of crashing.
  liveStateInflight = loadLiveState()
    .then((data) => {
      liveStateCache = { at: Date.now(), data };
      return data;
    })
    .catch((err) => {
      console.warn("[live-state] load failed; serving stale/empty store", err);
      if (liveStateCache) return liveStateCache.data;
      return emptyReleaseStore();
    })
    .finally(() => {
      liveStateInflight = null;
    });

  return liveStateInflight;
}

export function invalidateLiveStateCache() {
  liveStateCache = null;
}

export { unreadCount } from "./release-store";
