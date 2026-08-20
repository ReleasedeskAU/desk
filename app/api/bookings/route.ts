import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import {
  checkBookingAvailability,
  checkEnvironmentBookingConflicts,
  nextEnvBookingCode,
} from "@/lib/booking";
import { buildPhaseDatePayload } from "@/lib/booking-phase";
import { createEnvBookingRow, getDefaultOrganizationId } from "@/lib/org-compat";
import { prisma } from "@/lib/prisma";
import { bookingWhere, mapDbEnvBookingRow, sp } from "@/lib/list-api-filters";
import { jsonError } from "@/lib/api-errors";
import {
  guardEnvBookingMutationWhileDeploying,
  guardReleaseFullyLocked,
  loadGuardReleaseConfig,
} from "@/lib/release-related-entity-guards";
import {
  createConflictRecord,
  formatConflictPeriod,
} from "@/lib/conflict-record";
import { notifyConflictsRaisedForRm } from "@/lib/conflict-notify";

/** Availability check only (readonly+). Prefer environmentId for env-conflict checks. */
export async function POST(req: Request) {
  const { user, error } = await requireRole("readonly");
  if (error) return error;

  const body = await req.json();
  const applicationIds: string[] = body.applicationIds ?? (body.applicationId ? [body.applicationId] : []);
  const environmentId: string | undefined = body.environmentId || undefined;
  const fromDate = new Date(body.fromDate);
  const toDate = new Date(body.toDate);

  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return NextResponse.json({ error: "fromDate and toDate are required" }, { status: 400 });
  }
  if (!environmentId && !applicationIds.length) {
    return NextResponse.json(
      { error: "environmentId (preferred) or applicationIds are required" },
      { status: 400 },
    );
  }

  const result = environmentId
    ? await checkEnvironmentBookingConflicts({ environmentId, fromDate, toDate })
    : await checkBookingAvailability(applicationIds, fromDate, toDate);

  return NextResponse.json({ ...result, checkedBy: user!.email });
}

/**
 * Create one booking — Application → Environment → Release → Booking (1:1:1:1).
 * Overlapping BOOKED bookings on the same environment return 409 unless confirmConflict is true.
 */
export async function PUT(req: Request) {
  const { user, error } = await requireRole("editor");
  if (error) return error;

  try {
    const body = await req.json();
    // Enforce single application — reject multi-app create payloads.
    const applicationId: string | undefined =
      typeof body.applicationId === "string" && body.applicationId.trim()
        ? body.applicationId.trim()
        : Array.isArray(body.applicationIds) && body.applicationIds.length === 1
          ? String(body.applicationIds[0])
          : undefined;
    if (Array.isArray(body.applicationIds) && body.applicationIds.length > 1) {
      return NextResponse.json(
        { error: "Each booking must cover exactly one application. Create separate bookings for additional apps." },
        { status: 400 },
      );
    }

    const fromDate = new Date(body.fromDate);
    const toDate = new Date(body.toDate);
    const environmentId: string | undefined = body.environmentId || undefined;
    const releaseId: string | undefined = body.releaseId || undefined;
    const purpose: string | undefined = body.purpose || undefined;
    const teamOverride: string | undefined = body.team || undefined;
    const confirmConflict = body.confirmConflict === true;
    const conflictNotes =
      typeof body.conflictNotes === "string" ? body.conflictNotes.trim() : "";

    if (!applicationId || Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      return NextResponse.json({ error: "applicationId, fromDate, and toDate are required" }, { status: 400 });
    }
    if (!environmentId) {
      return NextResponse.json({ error: "environmentId is required" }, { status: 400 });
    }
    if (!releaseId) {
      return NextResponse.json({ error: "releaseId is required" }, { status: 400 });
    }
    if (toDate < fromDate) {
      return NextResponse.json({ error: "toDate must be on or after fromDate" }, { status: 400 });
    }

    // Parallelize independent Neon round-trips — sequential awaits were the 16s cost.
    const [, release, app, bookingCode] = await Promise.all([
      getDefaultOrganizationId(),
      prisma.release.findUnique({
        where: { id: releaseId },
        select: {
          id: true,
          releaseCode: true,
          status: true,
          lifecycleConfigVersionId: true,
        },
      }),
      prisma.application.findUnique({
        where: { id: applicationId },
        include: { department: true, environments: true },
      }),
      nextEnvBookingCode(),
    ]);

    if (!release) {
      return NextResponse.json({ error: "Release not found" }, { status: 400 });
    }
    const releaseConfig = await loadGuardReleaseConfig(
      user!.id,
      release.lifecycleConfigVersionId
    );
    const cancelledLock = guardReleaseFullyLocked(release.status, releaseConfig);
    if (!cancelledLock.ok) return cancelledLock.response;
    const bookingLocked = guardEnvBookingMutationWhileDeploying(
      release.status,
      releaseConfig
    );
    if (!bookingLocked.ok) return bookingLocked.response;
    if (!app) {
      return NextResponse.json({ error: "Application not found" }, { status: 400 });
    }

    const env = app.environments.find((e) => e.id === environmentId);
    if (!env) {
      return NextResponse.json({ error: "Environment not found for application" }, { status: 400 });
    }

    const check = await checkEnvironmentBookingConflicts({
      environmentId,
      environment: {
        id: env.id,
        name: env.name,
        type: env.type,
        applicationId: app.id,
      },
      fromDate,
      toDate,
    });
    if (!check.available && !confirmConflict) {
      const first = check.conflicts[0];
      const when = first
        ? `${String(first.fromDate).slice(0, 10)} → ${String(first.toDate).slice(0, 10)}`
        : "overlapping dates";
      const who = first
        ? `${first.bookingCode ?? "an existing booking"} (${first.applicationName}${first.releaseCode ? ` / ${first.releaseCode}` : ""})`
        : "another booking";
      return NextResponse.json(
        {
          error: `Environment "${env.name}" is already booked for ${when} by ${who}. Create this booking anyway?`,
          conflicts: check.conflicts,
          requiresConfirmation: true,
        },
        { status: 409 },
      );
    }

    const dayMs = 24 * 60 * 60 * 1000;
    const days = Math.max(1, Math.round((toDate.getTime() - fromDate.getTime()) / dayMs) + 1);
    const phaseDates = buildPhaseDatePayload(env.name, env.type, fromDate, toDate, days);
    const team = teamOverride?.trim() || app.department.name;

    let conflictCode: string | null = null;
    if (!check.available && confirmConflict) {
      const first = check.conflicts[0];
      const otherRelease = first?.releaseCode ?? null;
      const overlapFrom = first
        ? new Date(
            Math.max(fromDate.getTime(), new Date(first.fromDate).getTime())
          )
        : fromDate;
      const overlapTo = first
        ? new Date(Math.min(toDate.getTime(), new Date(first.toDate).getTime()))
        : toDate;
      const raised = await createConflictRecord({
        clerkUserId: user!.id,
        typeKey: "environment_booking",
        release1Code: release.releaseCode,
        release2Code: otherRelease,
        applicationName: app.name,
        departmentName: app.department.name,
        conflictingEnvironment: env.name,
        notes: conflictNotes
          ? `CNF-REQ-001: overlapping booking on ${env.name} — ${conflictNotes}`
          : `CNF-REQ-001: overlapping booking on ${env.name}`,
        conflictPeriod: formatConflictPeriod(overlapFrom, overlapTo),
        raisedBy: user!.name,
        raisedDate: new Date(),
        automation: "CNF-REQ-001",
      });
      if (raised.ok) {
        conflictCode = raised.conflictCode;
        if (raised.created) {
          await notifyConflictsRaisedForRm({
            releaseId: release.id,
            releaseCode: release.releaseCode,
            conflicts: [{ conflictCode: raised.conflictCode }],
            raisedBy: user!.name,
          });
        }
      }
    }

    const created = await createEnvBookingRow({
      bookingCode,
      applicationId: app.id,
      environmentId: env.id,
      bookedBy: user!.name,
      team,
      departmentName: app.department.name,
      fromDate,
      toDate,
      purpose: purpose ?? "End-to-end test window",
      releaseId,
      status: "BOOKED",
      conflictFlag: !check.available,
      ...phaseDates,
    });

    if (conflictCode) {
      await prisma.envBooking.update({
        where: { id: created.id },
        data: { environmentConflictId: conflictCode, conflictFlag: true },
      });
      const otherIds = check.conflicts.map((row) => row.bookingId).filter(Boolean);
      if (otherIds.length > 0) {
        await prisma.envBooking.updateMany({
          where: { id: { in: otherIds } },
          data: { environmentConflictId: conflictCode, conflictFlag: true },
        });
      }
    }

    return NextResponse.json(
      {
        bookings: [
          mapDbEnvBookingRow({
            ...created,
            environmentConflictId: conflictCode ?? created.environmentConflictId,
            conflictFlag: !check.available || created.conflictFlag,
          }),
        ],
        conflictCode,
      },
      { status: 201 }
    );
  } catch (err) {
    return jsonError(err, {
      publicMessage: "Create failed",
      status: 500,
      logLabel: "api/bookings PUT",
    });
  }
}

export async function GET(req: Request) {
  const { error } = await requireRole("readonly");
  if (error) return error;

  const params = sp(req);
  const rows = await prisma.envBooking.findMany({
    where: bookingWhere(params),
    include: {
      application: { include: { department: true } },
      release: { select: { id: true, releaseCode: true } },
    },
    orderBy: { sourceOrder: "asc" },
  });

  return NextResponse.json(rows.map(mapDbEnvBookingRow));
}
