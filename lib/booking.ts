import { prisma } from "@/lib/prisma";

/**
 * Inclusive date-range overlap: true when the two windows share any day.
 * @param aStart - First range start
 * @param aEnd - First range end
 * @param bStart - Second range start
 * @param bEnd - Second range end
 * @returns Whether the ranges overlap
 */
export function datesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

/**
 * True when a booking's testEnvCode refers to the same environment as a master Environment row.
 * Handles seed codes like FIN-TEST-01 vs catalog name "Test".
 * Uses whole normalized labels/segments only (avoids Prod matching Pre-prod).
 *
 * @param testEnvCode - Booking test env code/name (may be null)
 * @param env - Catalog environment name/type
 * @returns Whether they represent the same environment
 */
export function sameEnvironmentAlias(
  testEnvCode: string | null | undefined,
  env: { name: string; type?: string | null },
): boolean {
  if (!testEnvCode?.trim()) return false;
  const codeParts = testEnvCode
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (!codeParts.length) return false;
  const codeJoined = codeParts.join("");

  const labels = [env.name, env.type].filter((v): v is string => Boolean(v?.trim()));
  for (const label of labels) {
    const nameJoined = label
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
      .join("");
    if (nameJoined.length < 2) continue;
    if (codeJoined === nameJoined || codeParts.includes(nameJoined)) return true;
  }
  return false;
}

export type BookingConflict = {
  bookingId: string;
  bookingCode: string | null;
  applicationId: string;
  applicationName: string;
  environmentId: string | null;
  environmentName: string | null;
  releaseCode: string | null;
  bookedBy: string;
  team: string;
  fromDate: string;
  toDate: string;
  purpose: string | null;
};

type ConflictBookingRow = {
  id: string;
  bookingCode: string | null;
  applicationId: string;
  environmentId: string | null;
  bookedBy: string;
  team: string;
  fromDate: Date;
  toDate: Date;
  testStart: Date | null;
  testEnd: Date | null;
  testEnvCode: string | null;
  purpose: string | null;
  application: { name: string };
  environment: { name: string } | null;
  release: { releaseCode: string } | null;
};

function toConflictRow(b: ConflictBookingRow): BookingConflict {
  const start = b.testStart ?? b.fromDate;
  const end = b.testEnd ?? b.toDate;
  return {
    bookingId: b.id,
    bookingCode: b.bookingCode,
    applicationId: b.applicationId,
    applicationName: b.application.name,
    environmentId: b.environmentId,
    environmentName: b.environment?.name ?? b.testEnvCode ?? null,
    releaseCode: b.release?.releaseCode ?? null,
    bookedBy: b.bookedBy,
    team: b.team,
    fromDate: start.toISOString(),
    toDate: end.toISOString(),
    purpose: b.purpose,
  };
}

export type EnvironmentConflictTarget = {
  id: string;
  name: string;
  type?: string | null;
  applicationId: string;
};

/**
 * Next ENV-#### booking code using a single indexed lookup (not a full table scan).
 * @returns Next booking code such as ENV-0085
 */
export async function nextEnvBookingCode(): Promise<string> {
  const latest = await prisma.envBooking.findFirst({
    where: { bookingCode: { startsWith: "ENV-" } },
    orderBy: { bookingCode: "desc" },
    select: { bookingCode: true },
  });
  const n = Number(String(latest?.bookingCode ?? "").replace(/^ENV-/i, ""));
  const next = (Number.isFinite(n) ? n : 0) + 1;
  return `ENV-${String(next).padStart(4, "0")}`;
}

/**
 * Finds BOOKED bookings on the same environment whose test window overlaps the requested dates.
 * Matches by environmentId and by legacy seed codes (e.g. FIN-TEST-01 ↔ Test).
 *
 * @param opts.environmentId - Environment being booked (used when `environment` is omitted)
 * @param opts.environment - Optional preloaded env to avoid an extra round-trip
 * @param opts.fromDate - Requested start
 * @param opts.toDate - Requested end
 * @param opts.excludeBookingId - Optional booking to ignore (for edits)
 * @returns available flag plus conflicting booking rows (no secrets/PII beyond booking display fields)
 */
export async function checkEnvironmentBookingConflicts(opts: {
  environmentId: string;
  environment?: EnvironmentConflictTarget;
  fromDate: Date;
  toDate: Date;
  excludeBookingId?: string;
}): Promise<{ available: boolean; conflicts: BookingConflict[] }> {
  const environment =
    opts.environment ??
    (await prisma.environment.findUnique({
      where: { id: opts.environmentId },
      select: { id: true, name: true, type: true, applicationId: true },
    }));
  if (!environment) {
    return { available: true, conflicts: [] };
  }

  // Date-prefilter in SQL cuts rows before JS alias matching (remote DB round-trips are expensive).
  const bookings = await prisma.envBooking.findMany({
    where: {
      status: "BOOKED",
      applicationId: environment.applicationId,
      ...(opts.excludeBookingId ? { id: { not: opts.excludeBookingId } } : {}),
      OR: [
        {
          AND: [{ testStart: { not: null } }, { testEnd: { not: null } }],
          testStart: { lte: opts.toDate },
          testEnd: { gte: opts.fromDate },
        },
        {
          testStart: null,
          fromDate: { lte: opts.toDate },
          toDate: { gte: opts.fromDate },
        },
      ],
    },
    select: {
      id: true,
      bookingCode: true,
      applicationId: true,
      environmentId: true,
      bookedBy: true,
      team: true,
      fromDate: true,
      toDate: true,
      testStart: true,
      testEnd: true,
      testEnvCode: true,
      purpose: true,
      application: { select: { name: true } },
      environment: { select: { name: true } },
      release: { select: { releaseCode: true } },
    },
  });

  const conflicts = bookings
    .filter((b) => {
      const sameEnv =
        b.environmentId === environment.id ||
        sameEnvironmentAlias(b.testEnvCode, environment);
      if (!sameEnv) return false;
      const start = b.testStart ?? b.fromDate;
      const end = b.testEnd ?? b.toDate;
      return datesOverlap(opts.fromDate, opts.toDate, start, end);
    })
    .map(toConflictRow);

  return { available: conflicts.length === 0, conflicts };
}

/**
 * Legacy availability helper. Prefer {@link checkEnvironmentBookingConflicts} for create/edit.
 * When `environmentId` is provided, checks that environment; otherwise falls back to application windows.
 */
export async function checkBookingAvailability(
  applicationIds: string[],
  fromDate: Date,
  toDate: Date,
  environmentId?: string,
) {
  if (environmentId) {
    return checkEnvironmentBookingConflicts({ environmentId, fromDate, toDate });
  }

  const bookings = await prisma.envBooking.findMany({
    where: {
      applicationId: { in: applicationIds },
      status: "BOOKED",
      OR: [
        {
          AND: [{ testStart: { not: null } }, { testEnd: { not: null } }],
          testStart: { lte: toDate },
          testEnd: { gte: fromDate },
        },
        {
          testStart: null,
          fromDate: { lte: toDate },
          toDate: { gte: fromDate },
        },
      ],
    },
    select: {
      id: true,
      bookingCode: true,
      applicationId: true,
      environmentId: true,
      bookedBy: true,
      team: true,
      fromDate: true,
      toDate: true,
      testStart: true,
      testEnd: true,
      testEnvCode: true,
      purpose: true,
      application: { select: { name: true } },
      environment: { select: { name: true } },
      release: { select: { releaseCode: true } },
    },
  });

  const conflicts = applicationIds.flatMap((appId) => {
    const hit = bookings
      .filter((b) => b.applicationId === appId)
      .find((b) => {
        const start = b.testStart ?? b.fromDate;
        const end = b.testEnd ?? b.toDate;
        return datesOverlap(fromDate, toDate, start, end);
      });
    if (!hit) return [];
    return [toConflictRow(hit)];
  });

  return { available: conflicts.length === 0, conflicts };
}
