import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import { zodErrorResponse } from "@/lib/api-errors";
import { patchConflictSchema } from "@/lib/validation/conflict";
import { loadConflictLifecycleConfig } from "@/lib/conflict-lifecycle-config-db";
import { deniedConflictEditFields } from "@/lib/conflict-lifecycle-edit-policy";
import {
  resolveConflictLifecycleStatusRef,
  validateConflictTransition,
} from "@/lib/conflict-lifecycle-transition";
import { editPolicyDeniedMessage } from "@/lib/edit-policy-user-message";
import { keysWithActualPatchChanges } from "@/lib/patch-changed-keys";

type Params = { params: Promise<{ id: string }> };

async function findConflict(id: string) {
  return (
    (await prisma.environmentConflict.findUnique({ where: { id } })) ??
    (await prisma.environmentConflict.findUnique({ where: { conflictCode: id } }))
  );
}

export async function GET(_req: Request, { params }: Params) {
  const { error } = await requireRole("readonly");
  if (error) return error;

  const { id } = await params;
  const row = await findConflict(id);

  if (!row) return NextResponse.json({ error: "Conflict not found" }, { status: 404 });

  const [releases, bookings] = await Promise.all([
    prisma.release.findMany({
      where: { releaseCode: { in: [row.release1Code, row.release2Code] } },
      select: { id: true, releaseCode: true, name: true },
    }),
    prisma.envBooking.findMany({
      where: {
        OR: [
          { environmentConflictId: row.conflictCode },
          { environmentConflictId: { contains: row.conflictCode } },
        ],
      },
      select: {
        id: true,
        bookingCode: true,
        departmentName: true,
        conflictFlag: true,
        application: { select: { name: true } },
        release: { select: { id: true, releaseCode: true } },
      },
      orderBy: { sourceOrder: "asc" },
    }),
  ]);

  const byCode = new Map(releases.map((r) => [r.releaseCode, r]));

  return NextResponse.json({
    id: row.id,
    conflictCode: row.conflictCode,
    status: row.status,
    priority: row.priority,
    assignedTo: row.assignedTo ?? "",
    release1Code: row.release1Code,
    release2Code: row.release2Code,
    release1: byCode.get(row.release1Code) ?? null,
    release2: byCode.get(row.release2Code) ?? null,
    application: row.applicationName,
    department: row.departmentName,
    conflictingEnvironment: row.conflictingEnvironment,
    environmentConflictType: row.environmentConflictType,
    notes: row.notes,
    relatedBookings: bookings.map((b) => ({
      id: b.id,
      bookingCode: b.bookingCode,
      application: b.application.name,
      department: b.departmentName,
      conflictFlag: b.conflictFlag,
      release: b.release,
    })),
  });
}

/**
 * Updates mutable conflict fields. Conflict ID (conflictCode) is intentionally immutable —
 * rejected by patchConflictSchema.strict() if present in the body.
 * Status transitions and edit policy are enforced from the caller's conflict lifecycle config.
 */
export async function PATCH(req: Request, { params }: Params) {
  const { user, error } = await requireRole("editor");
  if (error) return error;

  const { id } = await params;
  const existing = await findConflict(id);
  if (!existing) return NextResponse.json({ error: "Conflict not found" }, { status: 404 });

  const parsed = patchConflictSchema.safeParse(await req.json());
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const body = parsed.data;
  if (Object.keys(body).length === 0) {
    return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
  }

  // Full-form detail saves echo every field — edit policy must only see real edits.
  const proposedKeys = keysWithActualPatchChanges({
    existing: existing as unknown as Record<string, unknown>,
    body: body as unknown as Record<string, unknown>,
    bodyToStored: {
      application: "applicationName",
      department: "departmentName",
    },
    metaKeys: new Set(["overrideReason"]),
  });
  const proposed = new Set(proposedKeys);

  let nextStatusKey: string | undefined;
  // Lifecycle: edit policy + status transitions (config-driven soft gates).
  try {
    const { config } = await loadConflictLifecycleConfig(user!.id);
    const { mode, denied } = deniedConflictEditFields(
      config,
      existing.status,
      proposedKeys
    );
    if (denied.length > 0) {
      return NextResponse.json(
        {
          error: editPolicyDeniedMessage({
            entity: "conflict",
            mode,
            statusLabel: existing.status,
            deniedFields: denied,
          }),
          code: "EDIT_POLICY_DENIED",
          mode,
          denied,
        },
        { status: 409 }
      );
    }
    if (body.status !== undefined && String(body.status) !== existing.status) {
      const transition = validateConflictTransition({
        config,
        fromStatus: existing.status,
        toStatus: String(body.status),
        overrideReason: body.overrideReason ?? null,
        facts: {
          notes: body.notes !== undefined ? body.notes : existing.notes,
        },
      });
      if (!transition.allowed) {
        return NextResponse.json(
          {
            error: transition.reason,
            code: transition.code,
            unmetReasons: transition.unmetReasons,
            transition,
          },
          { status: 422 }
        );
      }
      body.status = transition.canonicalStatus;
      nextStatusKey = resolveConflictLifecycleStatusRef(
        config,
        transition.canonicalStatus
      )?.key;
    }
  } catch (err) {
    console.error("[conflicts PATCH] lifecycle enforcement failed", {
      conflictId: existing.id,
      message: err instanceof Error ? err.message : "unknown",
    });
    return NextResponse.json(
      { error: "Conflict lifecycle validation is temporarily unavailable" },
      { status: 500 }
    );
  }

  const data: Record<string, unknown> = {};
  if (body.status !== undefined) {
    data.status = body.status;
    if (nextStatusKey) data.statusKey = nextStatusKey;
  }
  if (body.priority !== undefined && proposed.has("priority")) data.priority = body.priority;
  if (body.release1Code !== undefined && proposed.has("release1Code")) {
    data.release1Code = body.release1Code;
  }
  if (body.release2Code !== undefined && proposed.has("release2Code")) {
    data.release2Code = body.release2Code;
  }
  if (body.application !== undefined && proposed.has("application")) {
    data.applicationName = body.application;
  }
  if (body.department !== undefined && proposed.has("department")) {
    data.departmentName = body.department;
  }
  if (
    body.conflictingEnvironment !== undefined &&
    proposed.has("conflictingEnvironment")
  ) {
    data.conflictingEnvironment = body.conflictingEnvironment;
  }
  if (
    body.environmentConflictType !== undefined &&
    proposed.has("environmentConflictType")
  ) {
    data.environmentConflictType = body.environmentConflictType;
  }
  if (body.assignedTo !== undefined && proposed.has("assignedTo")) {
    data.assignedTo = body.assignedTo;
  }
  if (body.notes !== undefined && proposed.has("notes")) data.notes = body.notes;

  const row = await prisma.environmentConflict.update({
    where: { id: existing.id },
    data,
  });

  return NextResponse.json({ id: row.id, conflictCode: row.conflictCode });
}

export async function DELETE(_req: Request, { params }: Params) {
  const { error } = await requireRole("editor");
  if (error) return error;

  const { id } = await params;
  const existing = await findConflict(id);
  if (!existing) return NextResponse.json({ error: "Conflict not found" }, { status: 404 });

  await prisma.environmentConflict.delete({ where: { id: existing.id } });
  return NextResponse.json({ ok: true });
}
