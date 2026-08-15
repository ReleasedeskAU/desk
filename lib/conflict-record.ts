/**
 * Shared Environment Conflict create path for detectors (booking, AV-05,
 * maintenance, freeze). Always lands on the Starting status and writes statusKey.
 */
import { prisma } from "@/lib/prisma";
import { loadConflictLifecycleConfig } from "@/lib/conflict-lifecycle-config-db";
import type { ConflictLifecycleConfig } from "@/lib/conflict-lifecycle-config";
import { orderedReleaseCodes } from "@/lib/lifecycle-event-hook-helpers";
import {
  enabledStatusMatchValues,
  reportLifecycleRoleFault,
  resolveExclusiveRole,
  type LifecycleRoleFault,
} from "@/lib/lifecycle-status-roles";

export const UNLINKED_CONFLICT_RELEASE = "UNLINKED";

export type CreateConflictRecordInput = {
  clerkUserId: string;
  /** Catalog type key (schedule, environment_booking, …). */
  typeKey: string;
  release1Code: string;
  release2Code?: string | null;
  applicationName: string;
  departmentName: string;
  conflictingEnvironment: string;
  notes?: string | null;
  conflictPeriod?: string | null;
  raisedBy?: string | null;
  raisedDate?: Date | null;
  priority?: string;
  /** Check/cascade id for missing-intake logs. */
  automation: string;
};

export type CreateConflictRecordResult =
  | { ok: true; created: true; id: string; conflictCode: string }
  | { ok: true; created: false; id: string; conflictCode: string }
  | { ok: false; roleFault: LifecycleRoleFault };

/**
 * Format an overlap window for Conflict Period (date or date-time range).
 * @param from - Overlap start
 * @param to - Overlap end
 */
export function formatConflictPeriod(from: Date, to: Date): string {
  const start = Number.isNaN(from.getTime()) ? "" : from.toISOString().slice(0, 16).replace("T", " ");
  const end = Number.isNaN(to.getTime()) ? "" : to.toISOString().slice(0, 16).replace("T", " ");
  if (start && end) return `${start} – ${end}`;
  return start || end;
}

/**
 * Enabled type label for a catalog key, or a readable fallback.
 * @param config - Live Conflict lifecycle config
 * @param typeKey - Type key (e.g. environment_booking)
 */
export function conflictTypeLabelForKey(
  config: ConflictLifecycleConfig,
  typeKey: string
): string {
  const found = config.types.find((type) => type.key === typeKey && type.enabled);
  if (found) return found.label;
  return typeKey
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/**
 * Next CNF-NNNN code from existing rows.
 */
export async function nextConflictCode(): Promise<string> {
  const rows = await prisma.environmentConflict.findMany({
    select: { conflictCode: true, sourceOrder: true },
  });
  const nextNum =
    rows.reduce((max, row) => {
      const match = row.conflictCode.match(/^CNF-(\d+)$/i);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0) + 1;
  return `CNF-${String(nextNum).padStart(4, "0")}`;
}

function statusInOrNone(values: string[]): { in: string[] } {
  return { in: values.length > 0 ? values : ["__lifecycle_no_match__"] };
}

/**
 * Create an intake Conflict, or reuse an open one for the same pair + type + env.
 * @param input - Detector payload (no client-supplied Conflict ID)
 */
export async function createConflictRecord(
  input: CreateConflictRecordInput
): Promise<CreateConflictRecordResult> {
  const { config } = await loadConflictLifecycleConfig(input.clerkUserId);
  const intake = resolveExclusiveRole(
    config.statuses,
    (status) => status.isIntake,
    "isIntake",
    input.automation
  );
  if (!intake.ok) {
    reportLifecycleRoleFault(intake.fault);
    return { ok: false, roleFault: intake.fault };
  }

  const [r1, r2] = orderedReleaseCodes(
    input.release1Code,
    input.release2Code?.trim() || UNLINKED_CONFLICT_RELEASE
  );
  const typeLabel = conflictTypeLabelForKey(config, input.typeKey);
  const openValues = enabledStatusMatchValues(
    config.statuses,
    (status) => status.blocksReleaseReady
  );

  const existing = await prisma.environmentConflict.findFirst({
    where: {
      release1Code: r1,
      release2Code: r2,
      environmentConflictType: typeLabel,
      conflictingEnvironment: input.conflictingEnvironment,
      status: statusInOrNone(openValues),
    },
    select: { id: true, conflictCode: true },
  });
  if (existing) {
    return {
      ok: true,
      created: false,
      id: existing.id,
      conflictCode: existing.conflictCode,
    };
  }

  const codes = await prisma.environmentConflict.findMany({
    select: { conflictCode: true, sourceOrder: true },
  });
  const nextNum =
    codes.reduce((max, row) => {
      const match = row.conflictCode.match(/^CNF-(\d+)$/i);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0) + 1;
  const conflictCode = `CNF-${String(nextNum).padStart(4, "0")}`;
  const nextOrder =
    codes.reduce((max, row) => Math.max(max, row.sourceOrder ?? 0), 0) + 1;

  const row = await prisma.environmentConflict.create({
    data: {
      conflictCode,
      status: intake.status.label,
      statusKey: intake.status.key,
      priority: input.priority ?? "P2 - High",
      release1Code: r1,
      release2Code: r2,
      applicationName: input.applicationName,
      departmentName: input.departmentName,
      conflictingEnvironment: input.conflictingEnvironment,
      environmentConflictType: typeLabel,
      notes: input.notes ?? null,
      conflictPeriod: input.conflictPeriod ?? null,
      raisedBy: input.raisedBy ?? null,
      raisedDate: input.raisedDate ?? new Date(),
      sourceOrder: nextOrder,
    },
    select: { id: true, conflictCode: true },
  });

  return { ok: true, created: true, id: row.id, conflictCode: row.conflictCode };
}
