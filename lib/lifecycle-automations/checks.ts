/**
 * Category A cron checks (AV-02, AV-03, AV-22, sign-off SLA).
 *
 * Scope resolution (see scope-policy.ts):
 * - Risk / Approval / Sign-off: owner.clerkUserId when linked, else enterprise default
 * - Blocker: always enterprise default (no owner FK)
 * Missing owner and missing bridge share one path: scopeSource = fallback_default.
 */
import { prisma } from "@/lib/prisma";
import {
  createDefaultApprovalLifecycleConfig,
  type ApprovalLifecycleConfig,
} from "@/lib/approval-lifecycle-config";
import { validateApprovalTransition } from "@/lib/approval-lifecycle-transition";
import { createDefaultBlockerLifecycleConfig } from "@/lib/blocker-lifecycle-config";
import {
  createDefaultRiskLifecycleConfig,
  type RiskLifecycleConfig,
} from "@/lib/risk-lifecycle-config";
import { validateRiskTransition } from "@/lib/risk-lifecycle-transition";
import {
  createDefaultSignoffLifecycleConfig,
  SIGNOFF_RELEASE_FIELDS,
  type SignoffLifecycleConfig,
  type SignoffReleaseField,
} from "@/lib/signoff-lifecycle-config";
import { resolveSignoffLifecycleStatusRef } from "@/lib/signoff-lifecycle-transition";
import { loadApprovalLifecycleConfig } from "@/lib/approval-lifecycle-config-db";
import { loadRiskLifecycleConfig } from "@/lib/risk-lifecycle-config-db";
import { loadSignoffLifecycleConfig } from "@/lib/signoff-lifecycle-config-db";
import {
  LIFECYCLE_CRON_BATCH_SIZE,
  resolveCronScope,
  type LifecycleCronScopeSource,
} from "@/lib/lifecycle-automations/scope-policy";
import {
  approvalExpiryDays,
  escalateAfterDaysForRiskStatus,
  signoffPendingExpiryDays,
} from "@/lib/lifecycle-automations/thresholds";
import { isPastDayThreshold } from "@/lib/lifecycle-automations/time";

export type CheckRunSummary = {
  check: string;
  examined: number;
  mutated: number;
  skipped: number;
  truncated: boolean;
  errors: number;
  ownerScoped: number;
  fallbackScoped: number;
};

const DEPLOYED_OR_CLOSED = ["Deployed", "Closed"] as const;

export { escalateAfterDaysForRiskStatus };

function emptySummary(check: string): CheckRunSummary {
  return {
    check,
    examined: 0,
    mutated: 0,
    skipped: 0,
    truncated: false,
    errors: 0,
    ownerScoped: 0,
    fallbackScoped: 0,
  };
}

function tallyScope(
  summary: CheckRunSummary,
  scopeSource: LifecycleCronScopeSource
): void {
  if (scopeSource === "owner") summary.ownerScoped += 1;
  else summary.fallbackScoped += 1;
}

/**
 * Load risk configs once per distinct clerkUserId in a run.
 */
function createRiskConfigLoader() {
  const cache = new Map<string, Promise<RiskLifecycleConfig>>();
  const defaults = createDefaultRiskLifecycleConfig();
  return async (clerkUserId: string | null): Promise<RiskLifecycleConfig> => {
    if (!clerkUserId) return defaults;
    let pending = cache.get(clerkUserId);
    if (!pending) {
      pending = loadRiskLifecycleConfig(clerkUserId).then((r) => r.config);
      cache.set(clerkUserId, pending);
    }
    return pending;
  };
}

function createApprovalConfigLoader() {
  const cache = new Map<string, Promise<ApprovalLifecycleConfig>>();
  const defaults = createDefaultApprovalLifecycleConfig();
  return async (
    clerkUserId: string | null
  ): Promise<ApprovalLifecycleConfig> => {
    if (!clerkUserId) return defaults;
    let pending = cache.get(clerkUserId);
    if (!pending) {
      pending = loadApprovalLifecycleConfig(clerkUserId).then((r) => r.config);
      cache.set(clerkUserId, pending);
    }
    return pending;
  };
}

function createSignoffConfigLoader() {
  const cache = new Map<string, Promise<SignoffLifecycleConfig>>();
  const defaults = createDefaultSignoffLifecycleConfig();
  return async (
    clerkUserId: string | null
  ): Promise<SignoffLifecycleConfig> => {
    if (!clerkUserId) return defaults;
    let pending = cache.get(clerkUserId);
    if (!pending) {
      pending = loadSignoffLifecycleConfig(clerkUserId).then((r) => r.config);
      cache.set(clerkUserId, pending);
    }
    return pending;
  };
}

/**
 * AV-02 — escalate Identified/Assessing risks past escalateAfterDays.
 * Uses risk owner's linked Clerk settings when available.
 */
export async function runAv02RiskEscalations(
  now: Date = new Date(),
  batchSize: number = LIFECYCLE_CRON_BATCH_SIZE
): Promise<CheckRunSummary> {
  const defaultConfig = createDefaultRiskLifecycleConfig();
  const candidateStatuses = defaultConfig.statuses
    .filter((s) => s.escalateAfterDays != null && s.escalateAfterDays > 0)
    .map((s) => s.label);

  const summary = emptySummary("AV-02");
  if (candidateStatuses.length === 0) return summary;

  const loadConfig = createRiskConfigLoader();
  const rows = await prisma.risk.findMany({
    where: { status: { in: candidateStatuses } },
    orderBy: { updatedAt: "asc" },
    take: batchSize * 3,
    select: {
      id: true,
      riskCode: true,
      status: true,
      updatedAt: true,
      likelihood: true,
      impact: true,
      riskScore: true,
      mitigationStrategy: true,
      notes: true,
      riskOwner: { select: { clerkUserId: true } },
    },
  });

  summary.examined = rows.length;

  for (const row of rows) {
    if (summary.mutated >= batchSize) {
      summary.truncated = true;
      break;
    }
    const { scopeSource, clerkUserId } = resolveCronScope(
      row.riskOwner?.clerkUserId
    );
    tallyScope(summary, scopeSource);
    const config = await loadConfig(clerkUserId);
    const days = escalateAfterDaysForRiskStatus(row.status, config);
    if (days == null || !isPastDayThreshold(row.updatedAt, days, now)) {
      summary.skipped += 1;
      continue;
    }
    const escalatedLabel =
      config.statuses.find((s) => s.key === "escalated")?.label ?? "Escalated";
    const transition = validateRiskTransition({
      config,
      fromStatus: row.status,
      toStatus: escalatedLabel,
      overrideReason: `AV-02: auto-escalated after ${days} days in ${row.status}`,
      facts: {
        likelihood: row.likelihood,
        impact: row.impact,
        riskScore: row.riskScore,
        mitigationStrategy: row.mitigationStrategy,
        notes: row.notes,
      },
    });
    if (!transition.allowed) {
      summary.skipped += 1;
      continue;
    }
    try {
      await prisma.risk.update({
        where: { id: row.id },
        data: { status: transition.canonicalStatus },
      });
      summary.mutated += 1;
      console.warn("[lifecycle-cron] AV-02 escalated risk", {
        riskCode: row.riskCode,
        from: row.status,
        to: transition.canonicalStatus,
        scopeSource,
        clerkUserId,
      });
    } catch (err) {
      summary.errors += 1;
      console.warn("[lifecycle-cron] AV-02 update failed", {
        riskCode: row.riskCode,
        scopeSource,
        message: err instanceof Error ? err.message : "unknown",
      });
    }
  }
  return summary;
}

/**
 * AV-03 — stale In Progress blockers → MonitoringAlert.
 * Always enterprise default (no reliable owner FK on Blocker).
 */
export async function runAv03BlockerStaleAlerts(
  now: Date = new Date(),
  batchSize: number = LIFECYCLE_CRON_BATCH_SIZE
): Promise<CheckRunSummary> {
  const config = createDefaultBlockerLifecycleConfig();
  const inProgress = config.statuses.find((s) => s.key === "in_progress");
  const staleDays = inProgress?.staleAlertDays ?? null;
  const summary = emptySummary("AV-03");
  if (staleDays == null || staleDays <= 0 || !inProgress) return summary;

  const rows = await prisma.blocker.findMany({
    where: { status: inProgress.label },
    orderBy: { updatedAt: "asc" },
    take: batchSize * 3,
    select: {
      id: true,
      blockerCode: true,
      status: true,
      updatedAt: true,
      applicationName: true,
      departmentName: true,
      severity: true,
      releaseCode: true,
    },
  });
  summary.examined = rows.length;

  for (const row of rows) {
    if (summary.mutated >= batchSize) {
      summary.truncated = true;
      break;
    }
    const scopeSource: LifecycleCronScopeSource = "fallback_default";
    tallyScope(summary, scopeSource);
    if (!isPastDayThreshold(row.updatedAt, staleDays, now)) {
      summary.skipped += 1;
      continue;
    }
    const alertCode = `STALE-${row.blockerCode}`;
    const existing = await prisma.monitoringAlert.findUnique({
      where: { alertCode },
      select: { id: true },
    });
    if (existing) {
      summary.skipped += 1;
      continue;
    }
    const application = await prisma.application.findFirst({
      where: { name: row.applicationName },
      select: { id: true },
    });
    if (!application) {
      summary.skipped += 1;
      console.warn("[lifecycle-cron] AV-03 skipped — application not found", {
        blockerCode: row.blockerCode,
        scopeSource,
      });
      continue;
    }
    try {
      const maxOrder = await prisma.monitoringAlert.aggregate({
        _max: { sourceOrder: true },
      });
      await prisma.monitoringAlert.create({
        data: {
          alertCode,
          timestamp: now,
          applicationId: application.id,
          departmentName: row.departmentName,
          alertType: "Escalation",
          severity: row.severity || "Medium",
          metric: "blocker_stale_days",
          threshold: String(staleDays),
          currentValue: String(
            Math.floor(
              (now.getTime() - row.updatedAt.getTime()) / (24 * 60 * 60 * 1000)
            )
          ),
          status: "Pending",
          environmentName: "n/a",
          sourceOrder: (maxOrder._max.sourceOrder ?? 0) + 1,
        },
      });
      summary.mutated += 1;
      console.warn("[lifecycle-cron] AV-03 stale blocker alert", {
        blockerCode: row.blockerCode,
        releaseCode: row.releaseCode,
        alertCode,
        scopeSource,
        clerkUserId: null,
      });
    } catch (err) {
      summary.errors += 1;
      console.warn("[lifecycle-cron] AV-03 alert create failed", {
        blockerCode: row.blockerCode,
        scopeSource,
        message: err instanceof Error ? err.message : "unknown",
      });
    }
  }
  return summary;
}

/**
 * AV-22 — expire Approved decisions using the approver's expiryDays setting.
 */
export async function runAv22ApprovalExpiry(
  now: Date = new Date(),
  batchSize: number = LIFECYCLE_CRON_BATCH_SIZE
): Promise<CheckRunSummary> {
  const defaultConfig = createDefaultApprovalLifecycleConfig();
  const approvedDefault = defaultConfig.statuses.find((s) => s.key === "approved");
  const summary = emptySummary("AV-22");
  if (!approvedDefault) return summary;

  const loadConfig = createApprovalConfigLoader();
  const rows = await prisma.approval.findMany({
    where: { decision: approvedDefault.label },
    orderBy: { decisionDate: "asc" },
    take: batchSize * 3,
    select: {
      id: true,
      approvalCode: true,
      decision: true,
      decisionDate: true,
      updatedAt: true,
      approver: { select: { clerkUserId: true } },
      release: { select: { status: true, releaseCode: true } },
    },
  });
  summary.examined = rows.length;

  for (const row of rows) {
    if (summary.mutated >= batchSize) {
      summary.truncated = true;
      break;
    }
    const { scopeSource, clerkUserId } = resolveCronScope(
      row.approver?.clerkUserId
    );
    tallyScope(summary, scopeSource);
    const config = await loadConfig(clerkUserId);
    const expiryDays = approvalExpiryDays(config);
    const expiredLabel =
      config.statuses.find((s) => s.key === "expired")?.label ?? "Expired";
    if (expiryDays == null || expiryDays <= 0) {
      summary.skipped += 1;
      continue;
    }
    const anchor = row.decisionDate ?? row.updatedAt;
    if (!isPastDayThreshold(anchor, expiryDays, now)) {
      summary.skipped += 1;
      continue;
    }
    if (
      DEPLOYED_OR_CLOSED.some(
        (s) =>
          row.release.status.localeCompare(s, undefined, {
            sensitivity: "accent",
          }) === 0
      )
    ) {
      summary.skipped += 1;
      continue;
    }
    const transition = validateApprovalTransition({
      config,
      fromStatus: row.decision,
      toStatus: expiredLabel,
    });
    if (!transition.allowed) {
      summary.skipped += 1;
      continue;
    }
    try {
      await prisma.approval.update({
        where: { id: row.id },
        data: {
          decision: transition.canonicalStatus,
          decisionDate: now,
          comments: `AV-22: expired after ${expiryDays} days without deploy`,
        },
      });
      summary.mutated += 1;
      console.warn("[lifecycle-cron] AV-22 expired approval", {
        approvalCode: row.approvalCode,
        releaseCode: row.release.releaseCode,
        scopeSource,
        clerkUserId,
      });
    } catch (err) {
      summary.errors += 1;
      console.warn("[lifecycle-cron] AV-22 update failed", {
        approvalCode: row.approvalCode,
        scopeSource,
        message: err instanceof Error ? err.message : "unknown",
      });
    }
  }
  return summary;
}

/**
 * Sign-off SLA — Pending checklist fields expire using release owner's setting.
 * Anchor: release.createdAt. Candidate window uses the default 30d cutoff so
 * owners with longer SLAs still get picked up on later runs when past their limit.
 */
export async function runSignoffSlaExpiry(
  now: Date = new Date(),
  batchSize: number = LIFECYCLE_CRON_BATCH_SIZE
): Promise<CheckRunSummary> {
  const defaultConfig = createDefaultSignoffLifecycleConfig();
  const pendingDefault = defaultConfig.statuses.find((s) => s.key === "pending");
  const summary = emptySummary("SIGNOFF-SLA");
  if (!pendingDefault) return summary;

  // Widest practical floor: 1 day — per-owner expiry applied in memory.
  const floorCutoff = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
  const orFilters = SIGNOFF_RELEASE_FIELDS.map((field) => ({
    [field]: pendingDefault.label,
  }));

  const loadConfig = createSignoffConfigLoader();
  const rows = await prisma.release.findMany({
    where: {
      createdAt: { lte: floorCutoff },
      OR: orFilters,
    },
    orderBy: { createdAt: "asc" },
    take: batchSize * 3,
    select: {
      id: true,
      releaseCode: true,
      createdAt: true,
      // Keep in sync with SIGNOFF_RELEASE_FIELDS — SLA expiry indexes every key.
      devSignoff: true,
      testSignoff: true,
      uatSignoff: true,
      securityClearance: true,
      businessSignoff: true,
      opsSignoff: true,
      dressRehearsal: true,
      trainingStatus: true,
      supportBriefed: true,
      releaseOwner: { select: { clerkUserId: true } },
    },
  });
  summary.examined = rows.length;

  for (const row of rows) {
    if (summary.mutated >= batchSize) {
      summary.truncated = true;
      break;
    }
    const { scopeSource, clerkUserId } = resolveCronScope(
      row.releaseOwner?.clerkUserId
    );
    tallyScope(summary, scopeSource);
    const config = await loadConfig(clerkUserId);
    const expiryDays = signoffPendingExpiryDays(config);
    const expiredLabel =
      config.statuses.find((s) => s.key === "expired")?.label ?? "Expired";
    if (expiryDays == null || expiryDays <= 0) {
      summary.skipped += 1;
      continue;
    }
    if (!isPastDayThreshold(row.createdAt, expiryDays, now)) {
      summary.skipped += 1;
      continue;
    }
    const data: Partial<Record<SignoffReleaseField, string>> = {};
    for (const field of SIGNOFF_RELEASE_FIELDS) {
      const value = row[field];
      const resolved = resolveSignoffLifecycleStatusRef(config, value);
      if (resolved?.key === "pending") {
        data[field] = expiredLabel;
      }
    }
    if (Object.keys(data).length === 0) {
      summary.skipped += 1;
      continue;
    }
    try {
      await prisma.release.update({ where: { id: row.id }, data });
      summary.mutated += 1;
      console.warn("[lifecycle-cron] sign-off SLA expired fields", {
        releaseCode: row.releaseCode,
        fields: Object.keys(data),
        scopeSource,
        clerkUserId,
      });
    } catch (err) {
      summary.errors += 1;
      console.warn("[lifecycle-cron] sign-off SLA update failed", {
        releaseCode: row.releaseCode,
        scopeSource,
        message: err instanceof Error ? err.message : "unknown",
      });
    }
  }
  if (rows.length >= batchSize * 3) summary.truncated = true;
  return summary;
}
