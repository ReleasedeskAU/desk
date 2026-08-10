import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import { zodErrorResponse } from "@/lib/api-errors";
import { patchBlockerSchema } from "@/lib/validation/blocker";
import { loadBlockerLifecycleConfig } from "@/lib/blocker-lifecycle-config-db";
import { deniedBlockerEditFields } from "@/lib/blocker-lifecycle-edit-policy";
import { validateBlockerTransition } from "@/lib/blocker-lifecycle-transition";

type Params = { params: Promise<{ id: string }> };

async function findBlocker(id: string) {
  return (
    (await prisma.blocker.findUnique({ where: { id } })) ??
    (await prisma.blocker.findUnique({ where: { blockerCode: id } }))
  );
}

function parseDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function mapBlocker(
  row: NonNullable<Awaited<ReturnType<typeof findBlocker>>>,
  release: {
    id: string;
    releaseCode: string;
    name: string;
    status: string;
  } | null
) {
  return {
    id: row.id,
    blockerCode: row.blockerCode,
    releaseCode: row.releaseCode,
    releaseName: row.releaseName,
    department: row.departmentName,
    application: row.applicationName,
    blockerType: row.blockerType,
    blockerDescription: row.blockerDescription,
    severity: row.severity,
    raisedDate: row.raisedDate,
    raisedBy: row.raisedBy,
    assignedTo: row.assignedTo,
    status: row.status,
    targetResolutionDate: row.targetResolutionDate,
    actualResolutionDate: row.actualResolutionDate,
    daysOpen: row.daysOpen,
    escalationLevel: row.escalationLevel,
    rootCause: row.rootCause,
    resolutionNotes: row.resolutionNotes,
    impactOnRelease: row.impactOnRelease,
    release,
  };
}

export async function GET(_req: Request, { params }: Params) {
  const { error } = await requireRole("readonly");
  if (error) return error;

  const { id } = await params;
  const row = await findBlocker(id);
  if (!row) return NextResponse.json({ error: "Blocker not found" }, { status: 404 });

  const release = await prisma.release.findUnique({
    where: { releaseCode: row.releaseCode },
    select: { id: true, releaseCode: true, name: true, status: true },
  });

  return NextResponse.json(mapBlocker(row, release));
}

/**
 * Updates blocker fields. Blocker ID (blockerCode) is intentionally immutable —
 * rejected by patchBlockerSchema.strict() if present in the body.
 */
export async function PATCH(req: Request, { params }: Params) {
  const { user, error } = await requireRole("editor");
  if (error) return error;

  const { id } = await params;
  const existing = await findBlocker(id);
  if (!existing) return NextResponse.json({ error: "Blocker not found" }, { status: 404 });

  const parsed = patchBlockerSchema.safeParse(await req.json());
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const body = parsed.data;
  if (Object.keys(body).length === 0) {
    return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
  }

  // Lifecycle: edit policy + status transitions (config-driven).
  try {
    const { config } = await loadBlockerLifecycleConfig(user!.id);
    const proposedKeys = Object.keys(body);
    const { mode, denied } = deniedBlockerEditFields(
      config,
      existing.status,
      proposedKeys
    );
    if (denied.length > 0) {
      return NextResponse.json(
        {
          error: `This blocker is ${mode.replaceAll("_", "-")} in status "${existing.status}". Cannot change: ${denied.join(", ")}`,
          code: "EDIT_POLICY_DENIED",
          mode,
          denied,
        },
        { status: 409 }
      );
    }
    if (body.status !== undefined && String(body.status) !== existing.status) {
      const transition = validateBlockerTransition({
        config,
        fromStatus: existing.status,
        toStatus: String(body.status),
        overrideReason: body.overrideReason ?? null,
      });
      if (!transition.allowed) {
        return NextResponse.json(
          {
            error: transition.reason,
            code: transition.code,
            transition,
          },
          { status: 422 }
        );
      }
      // Persist the lifecycle-canonical label (not the raw client string).
      body.status = transition.canonicalStatus;
    }
  } catch (err) {
    console.error("[blockers PATCH] lifecycle enforcement failed", {
      blockerId: existing.id,
      message: err instanceof Error ? err.message : "unknown",
    });
    return NextResponse.json(
      { error: "Blocker lifecycle validation is temporarily unavailable" },
      { status: 500 }
    );
  }

  const raisedDate = parseDate(body.raisedDate);
  const targetResolutionDate = parseDate(body.targetResolutionDate);
  const actualResolutionDate = parseDate(body.actualResolutionDate);
  for (const [key, raw, parsedDate] of [
    ["raisedDate", body.raisedDate, raisedDate],
    ["targetResolutionDate", body.targetResolutionDate, targetResolutionDate],
    ["actualResolutionDate", body.actualResolutionDate, actualResolutionDate],
  ] as const) {
    if (raw !== undefined && raw !== null && parsedDate === undefined) {
      return NextResponse.json({ error: `Invalid ${key}` }, { status: 400 });
    }
  }

  if (body.releaseCode !== undefined) {
    const release = await prisma.release.findUnique({
      where: { releaseCode: body.releaseCode },
      select: { id: true },
    });
    if (!release) {
      return NextResponse.json({ error: "Release not found" }, { status: 400 });
    }
  }

  const data: Record<string, unknown> = {};
  if (body.releaseCode !== undefined) data.releaseCode = body.releaseCode;
  if (body.releaseName !== undefined) data.releaseName = body.releaseName;
  if (body.department !== undefined) data.departmentName = body.department;
  if (body.application !== undefined) data.applicationName = body.application;
  if (body.blockerType !== undefined) data.blockerType = body.blockerType;
  if (body.blockerDescription !== undefined) data.blockerDescription = body.blockerDescription;
  if (body.severity !== undefined) data.severity = body.severity;
  if (body.raisedBy !== undefined) data.raisedBy = body.raisedBy;
  if (body.status !== undefined) data.status = body.status;
  if (body.escalationLevel !== undefined) data.escalationLevel = body.escalationLevel;
  if (body.impactOnRelease !== undefined) data.impactOnRelease = body.impactOnRelease;
  if (body.assignedTo !== undefined) data.assignedTo = body.assignedTo;
  if (body.rootCause !== undefined) data.rootCause = body.rootCause;
  if (body.resolutionNotes !== undefined) data.resolutionNotes = body.resolutionNotes;
  if (raisedDate !== undefined) data.raisedDate = raisedDate;
  if (targetResolutionDate !== undefined) data.targetResolutionDate = targetResolutionDate;
  if (actualResolutionDate !== undefined) data.actualResolutionDate = actualResolutionDate;
  if (body.daysOpen !== undefined) data.daysOpen = body.daysOpen;

  const row = await prisma.blocker.update({ where: { id: existing.id }, data });
  const release = await prisma.release.findUnique({
    where: { releaseCode: row.releaseCode },
    select: { id: true, releaseCode: true, name: true, status: true },
  });

  return NextResponse.json(mapBlocker(row, release));
}

export async function DELETE(_req: Request, { params }: Params) {
  const { error } = await requireRole("editor");
  if (error) return error;

  const { id } = await params;
  const existing = await findBlocker(id);
  if (!existing) return NextResponse.json({ error: "Blocker not found" }, { status: 404 });

  await prisma.blocker.delete({ where: { id: existing.id } });
  return NextResponse.json({ ok: true });
}
