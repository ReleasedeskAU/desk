/**
 * CNF-REQ-002 / CNF-REQ-003 detectors. Find overlaps, then optionally raise
 * Conflict records. The Release-level changeFreeze gate is left untouched.
 */
import { prisma } from "@/lib/prisma";
import {
  createConflictRecord,
  formatConflictPeriod,
  type CreateConflictRecordResult,
} from "@/lib/conflict-record";
import { sameUtcDeployDay, utcDayKey } from "@/lib/lifecycle-automations/time";
import type { LifecycleRoleFault } from "@/lib/lifecycle-status-roles";
import { resolveLifecycleConfigForRelease } from "@/lib/release-lifecycle-config-db";
import { resolveLifecycleStatusRef } from "@/lib/release-lifecycle-transition";
import type { ConflictFinding } from "@/lib/conflict-finding-types";
import { notifyConflictsRaisedForRm } from "@/lib/conflict-notify";

export type { ConflictFinding } from "@/lib/conflict-finding-types";

export type RaisedConflictRef = {
  id: string;
  conflictCode: string;
  created: boolean;
};

export type DetectorResult = {
  count: number;
  roleFault?: LifecycleRoleFault;
  raised: RaisedConflictRef[];
};

export const CHANGE_FREEZE_EVENT_TYPE = "CHANGE FREEZE";
export const FREEZE_PLACEHOLDER_RELEASE = "FREEZE";

export type FreezeWindow = {
  name: string;
  from: Date;
  to: Date;
};

/**
 * Pair calendar CHANGE FREEZE START/END rows into inclusive date windows.
 * Unpaired START/END or a freeze-titled day becomes a single-day window.
 */
export function pairChangeFreezeWindows(
  events: ReadonlyArray<{ date: Date; title: string; eventType: string }>
): FreezeWindow[] {
  const starts = new Map<string, Date>();
  const ends = new Map<string, Date>();
  const days: FreezeWindow[] = [];

  for (const event of events) {
    if (event.eventType.trim().toLocaleUpperCase() !== CHANGE_FREEZE_EVENT_TYPE) {
      continue;
    }
    const title = event.title.trim();
    const startMatch = title.match(/^(.*)\s+START$/i);
    const endMatch = title.match(/^(.*)\s+END$/i);
    if (startMatch?.[1]) {
      starts.set(startMatch[1].trim(), event.date);
      continue;
    }
    if (endMatch?.[1]) {
      ends.set(endMatch[1].trim(), event.date);
      continue;
    }
    days.push({ name: title || "Change freeze", from: event.date, to: event.date });
  }

  const names = new Set([...starts.keys(), ...ends.keys()]);
  const windows: FreezeWindow[] = [...days];
  for (const name of names) {
    const from = starts.get(name);
    const to = ends.get(name);
    if (from && to) {
      windows.push({ name, from, to });
    } else if (from) {
      windows.push({ name, from, to: from });
    } else if (to) {
      windows.push({ name, from: to, to });
    }
  }
  return windows;
}

/**
 * True when the UTC calendar day of `date` sits inside the freeze window.
 */
export function dateFallsInFreezeWindow(date: Date, window: FreezeWindow): boolean {
  const day = utcDayKey(date);
  const from = utcDayKey(window.from);
  const to = utcDayKey(window.to);
  return day != null && from != null && to != null && day >= from && day <= to;
}

/**
 * Raise each finding as a Conflict. Skips duplicates already open for the pair.
 */
export async function raiseConflictFindings(args: {
  clerkUserId: string;
  release1Code: string;
  findings: ConflictFinding[];
  raisedBy: string;
  automation: string;
}): Promise<DetectorResult> {
  let count = 0;
  const raised: RaisedConflictRef[] = [];
  for (const finding of args.findings) {
    const result: CreateConflictRecordResult = await createConflictRecord({
      clerkUserId: args.clerkUserId,
      typeKey: finding.typeKey,
      release1Code: args.release1Code,
      release2Code: finding.release2Code,
      applicationName: finding.applicationName,
      departmentName: finding.departmentName,
      conflictingEnvironment: finding.conflictingEnvironment,
      notes: finding.notes,
      conflictPeriod: finding.conflictPeriod,
      raisedBy: args.raisedBy,
      raisedDate: new Date(),
      automation: args.automation,
    });
    if (!result.ok) return { count, roleFault: result.roleFault, raised };
    raised.push({
      id: result.id,
      conflictCode: result.conflictCode,
      created: result.created,
    });
    if (result.created) count += 1;
  }
  return { count, raised };
}

/**
 * Option B — create Conflict rows and post a real RM inbox notice.
 */
export async function raiseAndNotifyConflicts(args: {
  clerkUserId: string;
  release1Code: string;
  releaseId?: string | null;
  findings: ConflictFinding[];
  raisedBy: string;
  automation: string;
}): Promise<DetectorResult> {
  const raised = await raiseConflictFindings({
    clerkUserId: args.clerkUserId,
    release1Code: args.release1Code,
    findings: args.findings,
    raisedBy: args.raisedBy,
    automation: args.automation,
  });
  if (!raised.roleFault && raised.count > 0) {
    await notifyConflictsRaisedForRm({
      releaseId: args.releaseId,
      releaseCode: args.release1Code,
      conflicts: raised.raised.filter((row) => row.created),
      raisedBy: args.raisedBy,
    });
  }
  return raised;
}

/**
 * CNF-REQ-002 — Planned Maintenance windows on the same UTC deploy day.
 */
export async function findMaintenanceWindowConflicts(args: {
  releaseDate: Date;
  applicationIds: string[];
  applicationName: string;
  departmentName: string;
}): Promise<ConflictFinding[]> {
  const day = utcDayKey(args.releaseDate);
  if (!day) return [];

  const rows = await prisma.plannedMaintenance.findMany({
    where: {
      OR: [
        { applicationId: null },
        args.applicationIds.length > 0
          ? { applicationId: { in: args.applicationIds } }
          : { applicationId: { not: null } },
      ],
    },
    select: {
      maintenanceCode: true,
      scheduledDate: true,
      startTime: true,
      endTime: true,
      environmentName: true,
      application: { select: { name: true } },
    },
    take: 200,
  });

  return rows
    .filter((row) => utcDayKey(row.scheduledDate) === day)
    .map((row) => {
      const when = `${day} ${row.startTime}–${row.endTime}`.trim();
      const env = row.environmentName || "Maintenance";
      return {
        typeKey: "maintenance_window",
        release2Code: row.maintenanceCode,
        applicationName: row.application?.name ?? args.applicationName,
        departmentName: args.departmentName,
        conflictingEnvironment: env,
        notes: `CNF-REQ-002: deploy date overlaps planned maintenance ${row.maintenanceCode}`,
        conflictPeriod: `${when}`,
        summary: `Planned maintenance ${row.maintenanceCode} on ${env} (${when})`,
      };
    });
}

/**
 * CNF-REQ-003 — target/deploy date inside a calendar CHANGE FREEZE window.
 */
export async function findFreezePeriodConflicts(args: {
  targetDate: Date;
  applicationName: string;
  departmentName: string;
}): Promise<ConflictFinding[]> {
  if (!utcDayKey(args.targetDate)) return [];

  const events = await prisma.calendarEvent.findMany({
    where: { eventType: { equals: CHANGE_FREEZE_EVENT_TYPE, mode: "insensitive" } },
    select: { date: true, title: true, eventType: true },
    take: 200,
  });
  const windows = pairChangeFreezeWindows(events);
  return windows
    .filter((window) => dateFallsInFreezeWindow(args.targetDate, window))
    .map((window) => {
      const period = formatConflictPeriod(window.from, window.to);
      return {
        typeKey: "freeze_period",
        release2Code: FREEZE_PLACEHOLDER_RELEASE,
        applicationName: args.applicationName,
        departmentName: args.departmentName,
        conflictingEnvironment: window.name,
        notes: `CNF-REQ-003: target date falls inside ${window.name}`,
        conflictPeriod: period,
        summary: `${window.name} (${period})`,
      };
    });
}

/**
 * Run maintenance + freeze detectors and create Conflict rows (Phase 3).
 */
export async function detectCalendarConflictsOnReleaseDate(args: {
  clerkUserId: string;
  releaseId: string;
  releaseDate: Date | null | undefined;
  startDate?: Date | null;
}): Promise<DetectorResult> {
  if (!args.releaseDate || Number.isNaN(args.releaseDate.getTime())) {
    return { count: 0, raised: [] };
  }

  const release = await prisma.release.findUnique({
    where: { id: args.releaseId },
    select: {
      releaseCode: true,
      department: { select: { name: true } },
      applications: {
        select: {
          applicationId: true,
          application: { select: { name: true } },
        },
      },
    },
  });
  if (!release) return { count: 0, raised: [] };

  const applicationIds = release.applications.map((row) => row.applicationId);
  const applicationName =
    release.applications[0]?.application.name ?? "Unknown";
  const departmentName = release.department?.name ?? "";

  const maintenance = await findMaintenanceWindowConflicts({
    releaseDate: args.releaseDate,
    applicationIds,
    applicationName,
    departmentName,
  });
  const freezeDates = [args.releaseDate, args.startDate].filter(
    (value): value is Date => Boolean(value && !Number.isNaN(value.getTime()))
  );
  const freeze: ConflictFinding[] = [];
  const seen = new Set<string>();
  for (const date of freezeDates) {
    const hits = await findFreezePeriodConflicts({
      targetDate: date,
      applicationName,
      departmentName,
    });
    for (const hit of hits) {
      const key = `${hit.typeKey}:${hit.conflictingEnvironment}:${hit.conflictPeriod}`;
      if (seen.has(key)) continue;
      seen.add(key);
      freeze.push(hit);
    }
  }

  const raised = await raiseConflictFindings({
    clerkUserId: args.clerkUserId,
    release1Code: release.releaseCode,
    findings: [...maintenance, ...freeze],
    raisedBy: "System (calendar detector)",
    automation: maintenance.length ? "CNF-REQ-002" : "CNF-REQ-003",
  });
  if (raised.count > 0) {
    console.warn("[lifecycle-hook] calendar conflicts created", {
      releaseCode: release.releaseCode,
      created: raised.count,
    });
  }
  return raised;
}

/**
 * AV-05 findings for a proposed date + app set — does not require the date to be saved.
 */
export async function findScheduleConflictsForProposal(args: {
  clerkUserId: string;
  releaseDate: Date;
  applicationIds: string[];
  applicationName: string;
  departmentName: string;
  excludeReleaseId?: string;
  lifecycleConfigVersionId?: string | null;
  selfStatus?: string;
}): Promise<ConflictFinding[]> {
  if (args.applicationIds.length === 0) return [];

  const { config } = await resolveLifecycleConfigForRelease(
    args.clerkUserId,
    args.lifecycleConfigVersionId
  );
  if (args.selfStatus) {
    const self = resolveLifecycleStatusRef(config, args.selfStatus);
    if (self && (self.terminal || self.deployedMilestone)) return [];
  }

  const others = await prisma.release.findMany({
    where: {
      ...(args.excludeReleaseId ? { id: { not: args.excludeReleaseId } } : {}),
      releaseDate: {
        gte: new Date(
          Date.UTC(
            args.releaseDate.getUTCFullYear(),
            args.releaseDate.getUTCMonth(),
            args.releaseDate.getUTCDate()
          )
        ),
        lt: new Date(
          Date.UTC(
            args.releaseDate.getUTCFullYear(),
            args.releaseDate.getUTCMonth(),
            args.releaseDate.getUTCDate() + 1
          )
        ),
      },
      applications: { some: { applicationId: { in: args.applicationIds } } },
    },
    select: {
      releaseCode: true,
      status: true,
      releaseDate: true,
      applications: {
        where: { applicationId: { in: args.applicationIds } },
        select: { application: { select: { name: true } } },
      },
    },
    take: 50,
  });

  const findings: ConflictFinding[] = [];
  for (const other of others) {
    if (!sameUtcDeployDay(args.releaseDate, other.releaseDate)) continue;
    const otherStatus = resolveLifecycleStatusRef(config, other.status);
    if (otherStatus && (otherStatus.terminal || otherStatus.deployedMilestone)) {
      continue;
    }
    const appName =
      other.applications[0]?.application.name ?? args.applicationName;
    const period = formatConflictPeriod(args.releaseDate, args.releaseDate);
    findings.push({
      typeKey: "schedule",
      release2Code: other.releaseCode,
      applicationName: appName,
      departmentName: args.departmentName,
      conflictingEnvironment: "Deploy window",
      notes: "AV-05: same deploy day and shared application",
      conflictPeriod: period,
      summary: `${other.releaseCode} also deploys ${appName} on ${period}`,
    });
  }
  return findings;
}

/**
 * AV-05 findings only — same-day shared-application schedule clashes.
 */
export async function findScheduleConflictFindings(args: {
  clerkUserId: string;
  releaseId: string;
  releaseDate: Date;
}): Promise<ConflictFinding[]> {
  const release = await prisma.release.findUnique({
    where: { id: args.releaseId },
    select: {
      status: true,
      lifecycleConfigVersionId: true,
      department: { select: { name: true } },
      applications: {
        select: {
          applicationId: true,
          application: { select: { name: true } },
        },
      },
    },
  });
  if (!release) return [];

  return findScheduleConflictsForProposal({
    clerkUserId: args.clerkUserId,
    releaseDate: args.releaseDate,
    applicationIds: release.applications.map((row) => row.applicationId),
    applicationName: release.applications[0]?.application.name ?? "Unknown",
    departmentName: release.department?.name ?? "",
    excludeReleaseId: args.releaseId,
    lifecycleConfigVersionId: release.lifecycleConfigVersionId,
    selfStatus: release.status,
  });
}

/**
 * All three detectors against a proposed date/app set — no persist, no create.
 */
export async function collectProposedDateConflicts(args: {
  clerkUserId: string;
  releaseDate: Date;
  startDate?: Date | null;
  applicationIds: string[];
  excludeReleaseId?: string;
  applicationName?: string;
  departmentName?: string;
  lifecycleConfigVersionId?: string | null;
  selfStatus?: string;
}): Promise<ConflictFinding[]> {
  let applicationName = args.applicationName?.trim() || "";
  let departmentName = args.departmentName?.trim() || "";
  if ((!applicationName || !departmentName) && args.applicationIds.length > 0) {
    const apps = await prisma.application.findMany({
      where: { id: { in: args.applicationIds } },
      select: { name: true, department: { select: { name: true } } },
    });
    applicationName = applicationName || apps[0]?.name || "Unknown";
    departmentName = departmentName || apps[0]?.department?.name || "";
  }
  if (!applicationName) applicationName = "Unknown";

  const freezeDate =
    args.startDate && !Number.isNaN(args.startDate.getTime())
      ? args.startDate
      : args.releaseDate;

  const [schedule, maintenance, freezeHits] = await Promise.all([
    findScheduleConflictsForProposal({
      clerkUserId: args.clerkUserId,
      releaseDate: args.releaseDate,
      applicationIds: args.applicationIds,
      applicationName,
      departmentName,
      excludeReleaseId: args.excludeReleaseId,
      lifecycleConfigVersionId: args.lifecycleConfigVersionId,
      selfStatus: args.selfStatus,
    }),
    findMaintenanceWindowConflicts({
      releaseDate: args.releaseDate,
      applicationIds: args.applicationIds,
      applicationName,
      departmentName,
    }),
    findFreezePeriodConflicts({
      targetDate: freezeDate,
      applicationName,
      departmentName,
    }),
  ]);

  return [...schedule, ...maintenance, ...freezeHits];
}

/**
 * All three release-date detectors from a persisted release’s current apps.
 */
export async function collectReleaseDateConflictFindings(args: {
  clerkUserId: string;
  releaseId: string;
  releaseDate: Date;
  startDate?: Date | null;
}): Promise<ConflictFinding[]> {
  const release = await prisma.release.findUnique({
    where: { id: args.releaseId },
    select: {
      status: true,
      lifecycleConfigVersionId: true,
      department: { select: { name: true } },
      applications: {
        select: {
          applicationId: true,
          application: { select: { name: true } },
        },
      },
    },
  });
  if (!release) return [];

  return collectProposedDateConflicts({
    clerkUserId: args.clerkUserId,
    releaseDate: args.releaseDate,
    startDate: args.startDate,
    applicationIds: release.applications.map((row) => row.applicationId),
    excludeReleaseId: args.releaseId,
    applicationName: release.applications[0]?.application.name ?? "Unknown",
    departmentName: release.department?.name ?? "",
    lifecycleConfigVersionId: release.lifecycleConfigVersionId,
    selfStatus: release.status,
  });
}
