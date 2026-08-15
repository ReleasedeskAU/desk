/**
 * Category A cron checks (AV-02, AV-03, AV-22, sign-off SLA).
 *
 * Scope resolution (see scope-policy.ts):
 * - Risk / Approval / Sign-off: owner.clerkUserId when linked, else enterprise default
 * - Blocker: always enterprise default (no owner FK)
 * Missing owner and missing bridge share one path: scopeSource = fallback_default.
 */
import { prisma } from "@/lib/prisma";
import { createAutoMonitoringAlert } from "@/lib/alert-repeat-suppress";
import {
  createDefaultApprovalLifecycleConfig,
  type ApprovalLifecycleConfig,
} from "@/lib/approval-lifecycle-config";
import {
  resolveApprovalLifecycleStatusRef,
  validateApprovalTransition,
} from "@/lib/approval-lifecycle-transition";
import { createDefaultAlertLifecycleConfig } from "@/lib/alert-lifecycle-config";
import {
  resolveAlertLifecycleStatusRef,
  validateAlertTransition,
} from "@/lib/alert-lifecycle-transition";
import { createDefaultBlockerLifecycleConfig } from "@/lib/blocker-lifecycle-config";
import { resolveBlockerLifecycleStatusRef } from "@/lib/blocker-lifecycle-transition";
import {
  createDefaultRiskLifecycleConfig,
  type RiskLifecycleConfig,
} from "@/lib/risk-lifecycle-config";
import {
  resolveRiskLifecycleStatusRef,
  validateRiskTransition,
} from "@/lib/risk-lifecycle-transition";
import {
  createDefaultSignoffLifecycleConfig,
  SIGNOFF_SLA_FIELDS,
  type SignoffLifecycleConfig,
  type SignoffReleaseField,
} from "@/lib/signoff-lifecycle-config";
import { resolveSignoffLifecycleStatusRef } from "@/lib/signoff-lifecycle-transition";
import {
  ensureSignoffIntakeAtColumn,
  readSignoffIntakeAt,
  signoffFieldIntakeAnchor,
  type SignoffIntakeAtMap,
} from "@/lib/signoff-intake-at";
import { loadApprovalLifecycleConfig } from "@/lib/approval-lifecycle-config-db";
import { loadRiskLifecycleConfig } from "@/lib/risk-lifecycle-config-db";
import { loadSignoffLifecycleConfig } from "@/lib/signoff-lifecycle-config-db";
import { loadReleaseLifecycleConfig } from "@/lib/release-lifecycle-config-db";
import type { ReleaseLifecycleConfig } from "@/lib/release-lifecycle-config";
import { createDefaultReleaseLifecycleConfig } from "@/lib/release-lifecycle-config";
import { resolveLifecycleStatusRef } from "@/lib/release-lifecycle-transition";
import {
  enabledStatusMatchValues,
  reportLifecycleRoleFault,
  resolveExclusiveRole,
  type LifecycleRoleFault,
} from "@/lib/lifecycle-status-roles";
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
  roleFaults: Array<{
    code: string;
    message: string;
    roleId: string;
    automation: string;
  }>;
};

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
    roleFaults: [],
  };
}

function tallyScope(
  summary: CheckRunSummary,
  scopeSource: LifecycleCronScopeSource
): void {
  if (scopeSource === "owner") summary.ownerScoped += 1;
  else summary.fallbackScoped += 1;
}

function recordRoleFault(
  summary: CheckRunSummary,
  fault: LifecycleRoleFault,
  seen: Set<string>
): void {
  const key = `${fault.roleId}:${fault.automation}:${fault.code}`;
  if (seen.has(key)) return;
  seen.add(key);
  summary.errors += 1;
  summary.roleFaults.push(fault);
  reportLifecycleRoleFault(fault);
}

function uniqueOutgoingToKey(
  transitions: readonly { fromKey: string; toKey: string; enabled: boolean; enforcement?: string }[],
  fromKey: string,
  requiredOnly = false
): string | null {
  const hits = transitions.filter(
    (t) =>
      t.enabled &&
      t.fromKey === fromKey &&
      (!requiredOnly || t.enforcement === "required")
  );
  return hits.length === 1 ? hits[0]!.toKey : null;
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

function createReleaseConfigLoader() {
  const cache = new Map<string, Promise<ReleaseLifecycleConfig>>();
  const defaults = createDefaultReleaseLifecycleConfig();
  return async (
    clerkUserId: string | null
  ): Promise<ReleaseLifecycleConfig> => {
    if (!clerkUserId) return defaults;
    let pending = cache.get(clerkUserId);
    if (!pending) {
      pending = loadReleaseLifecycleConfig(clerkUserId).then((r) => r.config);
      cache.set(clerkUserId, pending);
    }
    return pending;
  };
}

/**
 * Resolve whether one risk is due using its owner's live graph and status-entry time.
 * @returns Configured elapsed-day threshold when due, otherwise null.
 */
export function dueRiskEscalationDays(args: {
  status: string;
  statusChangedAt: Date;
  config: RiskLifecycleConfig;
  now: Date;
}): number | null {
  const days = escalateAfterDaysForRiskStatus(args.status, args.config);
  return days != null &&
    isPastDayThreshold(args.statusChangedAt, days, args.now)
    ? days
    : null;
}

/**
 * AV-02 — escalate risks past their live-config escalateAfterDays threshold.
 * Uses risk owner's linked Clerk settings and the status-entry timestamp.
 */
export async function runAv02RiskEscalations(
  now: Date = new Date(),
  batchSize: number = LIFECYCLE_CRON_BATCH_SIZE
): Promise<CheckRunSummary> {
  const summary = emptySummary("AV-02");
  const roleSeen = new Set<string>();
  const loadConfig = createRiskConfigLoader();
  const pageSize = Math.max(batchSize * 3, 100);
  let cursor: string | undefined;

  while (summary.mutated < batchSize) {
    const rows = await prisma.risk.findMany({
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      // Stable id pagination: successful updates change statusChangedAt mid-scan.
      orderBy: { id: "asc" },
      take: pageSize,
      select: {
        id: true,
        riskCode: true,
        status: true,
        statusChangedAt: true,
        likelihood: true,
        impact: true,
        riskScore: true,
        mitigationStrategy: true,
        notes: true,
        riskOwner: { select: { clerkUserId: true } },
      },
    });
    if (rows.length === 0) break;
    summary.examined += rows.length;
    cursor = rows[rows.length - 1]!.id;

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
      const days = dueRiskEscalationDays({
        status: row.status,
        statusChangedAt: row.statusChangedAt,
        config,
        now,
      });
      if (days == null) {
        summary.skipped += 1;
        continue;
      }
      const target = resolveExclusiveRole(
        config.statuses,
        (status) => status.escalateTarget,
        "escalateTarget",
        "AV-02"
      );
      if (!target.ok) {
        recordRoleFault(summary, target.fault, roleSeen);
        continue;
      }
      const transition = validateRiskTransition({
        config,
        fromStatus: row.status,
        toStatus: target.status.label,
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
      const statusKey = resolveRiskLifecycleStatusRef(
        config,
        transition.canonicalStatus
      )?.key;
      if (!statusKey) {
        summary.errors += 1;
        continue;
      }
      try {
        await prisma.risk.update({
          where: { id: row.id },
          data: {
            status: transition.canonicalStatus,
            statusKey,
            statusChangedAt: now,
          },
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
    if (rows.length < pageSize) break;
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
  const staleValues = enabledStatusMatchValues(
    config.statuses,
    (s) => s.staleAlertDays != null && s.staleAlertDays > 0
  );
  const summary = emptySummary("AV-03");
  if (staleValues.length === 0) return summary;

  const rows = await prisma.blocker.findMany({
    where: { status: { in: staleValues } },
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
    const resolved = resolveBlockerLifecycleStatusRef(config, row.status);
    const staleDays = resolved?.staleAlertDays ?? null;
    if (staleDays == null || staleDays <= 0 || !isPastDayThreshold(row.updatedAt, staleDays, now)) {
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
      const raised = await createAutoMonitoringAlert({
        baseAlertCode: `STALE-${row.blockerCode}`,
        applicationId: application.id,
        departmentName: row.departmentName,
        alertType: "Escalation",
        alertSource: "System",
        severity: row.severity || "Medium",
        metric: "blocker_stale_days",
        threshold: String(staleDays),
        currentValue: String(
          Math.floor(
            (now.getTime() - row.updatedAt.getTime()) / (24 * 60 * 60 * 1000)
          )
        ),
        environmentName: "n/a",
      });
      if (raised === "suppressed") {
        summary.skipped += 1;
        continue;
      }
      summary.mutated += 1;
      console.warn("[lifecycle-cron] AV-03 stale blocker alert", {
        blockerCode: row.blockerCode,
        releaseCode: row.releaseCode,
        alertCode: `STALE-${row.blockerCode}`,
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
  const expiringValues = enabledStatusMatchValues(
    defaultConfig.statuses,
    (s) => s.expiryDays != null && s.expiryDays > 0
  );
  const summary = emptySummary("AV-22");
  if (expiringValues.length === 0) return summary;
  const roleSeen = new Set<string>();

  const loadConfig = createApprovalConfigLoader();
  const loadReleaseConfig = createReleaseConfigLoader();
  const rows = await prisma.approval.findMany({
    where: { decision: { in: expiringValues } },
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
    const from = resolveApprovalLifecycleStatusRef(config, row.decision);
    const expiryDays = from?.expiryDays ?? null;
    if (!from || expiryDays == null || expiryDays <= 0) {
      summary.skipped += 1;
      continue;
    }
    const destKey = uniqueOutgoingToKey(config.transitions, from.key);
    const dest = destKey
      ? config.statuses.find((s) => s.enabled && s.key === destKey)
      : null;
    if (!dest) {
      recordRoleFault(
        summary,
        {
          code: "LIFECYCLE_ROLE_MISSING",
          message:
            "No single expiry destination from the approval status that has an expiry window. Add exactly one exit from that status under Lifecycle Settings.",
          roleId: "isIntake",
          automation: "AV-22",
        },
        roleSeen
      );
      continue;
    }
    const anchor = row.decisionDate ?? row.updatedAt;
    if (!isPastDayThreshold(anchor, expiryDays, now)) {
      summary.skipped += 1;
      continue;
    }
    const releaseConfig = await loadReleaseConfig(clerkUserId);
    const releaseStatus = resolveLifecycleStatusRef(
      releaseConfig,
      row.release.status
    );
    if (
      releaseStatus &&
      (releaseStatus.terminal || releaseStatus.deployedMilestone)
    ) {
      summary.skipped += 1;
      continue;
    }
    const transition = validateApprovalTransition({
      config,
      fromStatus: row.decision,
      toStatus: dest.label,
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
 * Sign-off SLA — Pending decision fields expire using each field's intake clock
 * (`signoffIntakeAt`), not release.createdAt. Training Status is not in this list.
 */
export async function runSignoffSlaExpiry(
  now: Date = new Date(),
  batchSize: number = LIFECYCLE_CRON_BATCH_SIZE
): Promise<CheckRunSummary> {
  const defaultConfig = createDefaultSignoffLifecycleConfig();
  const pendingValues = enabledStatusMatchValues(
    defaultConfig.statuses,
    (s) => s.isIntake || (s.expiryDays != null && s.expiryDays > 0)
  );
  const summary = emptySummary("SIGNOFF-SLA");
  if (pendingValues.length === 0) return summary;
  const roleSeen = new Set<string>();

  await ensureSignoffIntakeAtColumn();
  // Candidate window still uses createdAt as a cheap prefilter (1-day floor).
  // Per-field clocks in signoffIntakeAt decide whether to expire.
  const floorCutoff = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
  const orFilters = SIGNOFF_SLA_FIELDS.flatMap((field) =>
    pendingValues.map((value) => ({ [field]: value }))
  );

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
      devSignoff: true,
      testSignoff: true,
      uatSignoff: true,
      securityClearance: true,
      businessSignoff: true,
      opsSignoff: true,
      dressRehearsal: true,
      supportBriefed: true,
      releaseOwner: { select: { clerkUserId: true } },
    },
  });
  summary.examined = rows.length;

  const intakeByRelease = new Map<string, SignoffIntakeAtMap>();
  for (const row of rows) {
    intakeByRelease.set(row.id, await readSignoffIntakeAt(row.id));
  }

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
    const intake = resolveExclusiveRole(
      config.statuses,
      (s) => s.isIntake,
      "isIntake",
      "SIGNOFF-SLA"
    );
    if (!intake.ok) {
      recordRoleFault(summary, intake.fault, roleSeen);
      continue;
    }
    const expiryDays = intake.status.expiryDays;
    const destKey = uniqueOutgoingToKey(
      config.transitions,
      intake.status.key,
      true
    );
    const dest = destKey
      ? config.statuses.find((s) => s.enabled && s.key === destKey)
      : null;
    if (expiryDays == null || expiryDays <= 0) {
      summary.skipped += 1;
      continue;
    }
    if (!dest) {
      recordRoleFault(
        summary,
        {
          code: "LIFECYCLE_ROLE_MISSING",
          message:
            "No single required exit from the Starting status for sign-off expiry. Add exactly one Required exit under Lifecycle Settings.",
          roleId: "isIntake",
          automation: "SIGNOFF-SLA",
        },
        roleSeen
      );
      continue;
    }
    const intakeAt = intakeByRelease.get(row.id) ?? {};
    const data: Partial<Record<SignoffReleaseField, string>> = {};
    for (const field of SIGNOFF_SLA_FIELDS) {
      const value = row[field as keyof typeof row];
      if (typeof value !== "string" && value != null) continue;
      const resolved = resolveSignoffLifecycleStatusRef(
        config,
        typeof value === "string" ? value : null
      );
      if (!resolved?.enabled || !resolved.isIntake) continue;
      const anchor = signoffFieldIntakeAnchor(field, intakeAt);
      // Missing stamp: do not expire (setting Pending on an old release must
      // not inherit release.createdAt).
      if (!anchor || !isPastDayThreshold(anchor, expiryDays, now)) continue;
      data[field] = dest.label;
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

/**
 * Alert TTL — expire Active alerts using expiryDays + the unique Required exit
 * (same pattern as AV-22). Default graph: Active → Expired after 7 days.
 */
export async function runAlertTtlExpiry(
  now: Date = new Date(),
  batchSize: number = LIFECYCLE_CRON_BATCH_SIZE
): Promise<CheckRunSummary> {
  const config = createDefaultAlertLifecycleConfig();
  const expiringValues = enabledStatusMatchValues(
    config.statuses,
    (s) => s.expiryDays != null && s.expiryDays > 0
  );
  const summary = emptySummary("ALERT-TTL");
  if (expiringValues.length === 0) return summary;

  const rows = await prisma.monitoringAlert.findMany({
    where: {
      OR: [
        { status: { in: expiringValues } },
        { statusKey: { in: expiringValues } },
      ],
    },
    orderBy: { timestamp: "asc" },
    take: batchSize * 3,
    select: {
      id: true,
      alertCode: true,
      status: true,
      timestamp: true,
      createdAt: true,
    },
  });
  summary.examined = rows.length;
  const roleSeen = new Set<string>();

  for (const row of rows) {
    if (summary.mutated >= batchSize) {
      summary.truncated = true;
      break;
    }
    summary.fallbackScoped += 1;
    const from = resolveAlertLifecycleStatusRef(config, row.status);
    const expiryDays = from?.expiryDays ?? null;
    if (!from || expiryDays == null || expiryDays <= 0) {
      summary.skipped += 1;
      continue;
    }
    const destKey = uniqueOutgoingToKey(config.transitions, from.key, true);
    const dest = destKey
      ? config.statuses.find((s) => s.enabled && s.key === destKey)
      : null;
    if (!dest) {
      recordRoleFault(
        summary,
        {
          code: "LIFECYCLE_ROLE_MISSING",
          message:
            "No single expiry destination from the alert status that has an expiry window. Add exactly one Required exit from that status under Alert Lifecycle Settings.",
          roleId: "isIntake",
          automation: "ALERT-TTL",
        },
        roleSeen
      );
      continue;
    }
    const anchor = row.timestamp ?? row.createdAt;
    if (!isPastDayThreshold(anchor, expiryDays, now)) {
      summary.skipped += 1;
      continue;
    }
    const transition = validateAlertTransition({
      config,
      fromStatus: row.status,
      toStatus: dest.label,
      facts: { notes: null },
    });
    if (!transition.allowed) {
      summary.skipped += 1;
      continue;
    }
    try {
      await prisma.monitoringAlert.update({
        where: { id: row.id },
        data: {
          status: transition.canonicalStatus,
          statusKey: dest.key,
        },
      });
      summary.mutated += 1;
      console.warn("[lifecycle-cron] ALERT-TTL expired alert", {
        alertCode: row.alertCode,
      });
    } catch (err) {
      summary.errors += 1;
      console.warn("[lifecycle-cron] ALERT-TTL update failed", {
        alertCode: row.alertCode,
        message: err instanceof Error ? err.message : "unknown",
      });
    }
  }
  return summary;
}
