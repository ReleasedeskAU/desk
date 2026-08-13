import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import { zodErrorResponse } from "@/lib/api-errors";
import { patchRiskSchemaForScale } from "@/lib/validation/risk";
import { loadRiskEngineConfig } from "@/lib/risk-engine-config-db";
import { loadRiskLifecycleConfig } from "@/lib/risk-lifecycle-config-db";
import { deniedRiskEditFields } from "@/lib/risk-lifecycle-edit-policy";
import {
  resolveRiskLifecycleStatusRef,
  validateRiskTransition,
} from "@/lib/risk-lifecycle-transition";
import { editPolicyDeniedMessage } from "@/lib/edit-policy-user-message";
import { keysWithActualPatchChanges } from "@/lib/patch-changed-keys";

type Params = { params: Promise<{ id: string }> };

const riskInclude = {
  release: { select: { id: true, releaseCode: true, name: true, status: true, releaseDate: true } },
  riskOwner: { select: { id: true, userId: true, name: true, email: true } },
} as const;

async function findRisk(id: string) {
  return (
    (await prisma.risk.findUnique({ where: { id }, include: riskInclude })) ??
    (await prisma.risk.findUnique({ where: { riskCode: id }, include: riskInclude }))
  );
}

export async function GET(_req: Request, { params }: Params) {
  const { error } = await requireRole("readonly");
  if (error) return error;

  const { id } = await params;
  const row = await findRisk(id);
  if (!row) return NextResponse.json({ error: "Risk not found" }, { status: 404 });
  return NextResponse.json(row);
}

/**
 * Updates allowlisted risk fields. riskCode is immutable (schema.strict).
 * When likelihood or impact changes, riskScore is recomputed server-side.
 * Status transitions and edit policy are enforced from the caller's risk lifecycle config.
 */
export async function PATCH(req: Request, { params }: Params) {
  const { user, error } = await requireRole("editor");
  if (error) return error;

  const { id } = await params;
  const existing = await findRisk(id);
  if (!existing) return NextResponse.json({ error: "Risk not found" }, { status: 404 });

  const riskConfig = await loadRiskEngineConfig(user!.id);
  const parsed = patchRiskSchemaForScale(
    riskConfig.likelihoodMax,
    riskConfig.impactMax
  ).safeParse(await req.json());
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const body = parsed.data;
  if (Object.keys(body).length === 0) {
    return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
  }

  const nextReleaseId = body.releaseId ?? existing.releaseId;
  if (body.releaseId !== undefined) {
    const release = await prisma.release.findUnique({ where: { id: body.releaseId }, select: { id: true } });
    if (!release) return NextResponse.json({ error: "Release not found" }, { status: 400 });
  }
  if (body.riskOwnerId) {
    const owner = await prisma.user.findUnique({ where: { id: body.riskOwnerId }, select: { id: true } });
    if (!owner) return NextResponse.json({ error: "Risk owner not found" }, { status: 400 });
  }

  // Resolve applicationId → stored names before edit policy so full-form saves
  // don't treat the request-only FK as a denied Limited edit.
  let resolvedApplicationName = body.applicationName;
  let resolvedDepartmentName = body.departmentName;
  if (body.applicationId !== undefined) {
    const [release, application] = await Promise.all([
      prisma.release.findUnique({
        where: { id: nextReleaseId },
        select: {
          id: true,
          department: { select: { id: true } },
          applications: { where: { applicationId: body.applicationId }, select: { applicationId: true } },
        },
      }),
      prisma.application.findUnique({
        where: { id: body.applicationId },
        select: { id: true, name: true, department: { select: { id: true, name: true } } },
      }),
    ]);
    if (!application) return NextResponse.json({ error: "Application not found" }, { status: 400 });
    if (!release) return NextResponse.json({ error: "Release not found" }, { status: 400 });
    if (!release.applications.length) {
      return NextResponse.json({ error: "Application is not linked to the selected release" }, { status: 400 });
    }
    if (application.department.id !== release.department.id) {
      return NextResponse.json({ error: "Application and release must belong to the same department" }, { status: 400 });
    }
    resolvedApplicationName = application.name;
    resolvedDepartmentName = application.department.name;
  }

  const compareBody: Record<string, unknown> = { ...body };
  delete compareBody.applicationId;
  if (resolvedApplicationName !== undefined) {
    compareBody.applicationName = resolvedApplicationName;
  }
  if (resolvedDepartmentName !== undefined) {
    compareBody.departmentName = resolvedDepartmentName;
  }
  const proposedKeys = keysWithActualPatchChanges({
    existing: existing as unknown as Record<string, unknown>,
    body: compareBody,
    metaKeys: new Set(["overrideReason"]),
  });
  const proposed = new Set(proposedKeys);

  let nextStatusKey: string | undefined;
  // Lifecycle: edit policy + status transitions (config-driven soft gates).
  try {
    const { config } = await loadRiskLifecycleConfig(user!.id);
    const { mode, denied } = deniedRiskEditFields(
      config,
      existing.status,
      proposedKeys
    );
    if (denied.length > 0) {
      return NextResponse.json(
        {
          error: editPolicyDeniedMessage({
            entity: "risk",
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
      const nextLikelihood = body.likelihood ?? existing.likelihood;
      const nextImpact = body.impact ?? existing.impact;
      const transition = validateRiskTransition({
        config,
        fromStatus: existing.status,
        toStatus: String(body.status),
        overrideReason: body.overrideReason ?? null,
        facts: {
          likelihood: nextLikelihood,
          impact: nextImpact,
          riskScore: nextLikelihood * nextImpact,
          mitigationStrategy:
            body.mitigationStrategy !== undefined
              ? body.mitigationStrategy
              : existing.mitigationStrategy,
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
      nextStatusKey = resolveRiskLifecycleStatusRef(
        config,
        transition.canonicalStatus
      )?.key;
    }
  } catch (err) {
    console.error("[risks PATCH] lifecycle enforcement failed", {
      riskId: existing.id,
      message: err instanceof Error ? err.message : "unknown",
    });
    return NextResponse.json(
      { error: "Risk lifecycle validation is temporarily unavailable" },
      { status: 500 }
    );
  }

  const likelihood = body.likelihood ?? existing.likelihood;
  const impact = body.impact ?? existing.impact;
  const data: {
    releaseId?: string;
    applicationName?: string | null;
    departmentName?: string | null;
    category?: string;
    description?: string;
    likelihood?: number;
    impact?: number;
    riskScore?: number;
    affectedArea?: string | null;
    mitigationStrategy?: string | null;
    riskOwnerId?: string | null;
    status?: string;
    statusKey?: string;
    notes?: string | null;
  } = {};
  if (body.releaseId !== undefined && proposed.has("releaseId")) {
    data.releaseId = body.releaseId;
  }
  if (proposed.has("applicationName") && resolvedApplicationName !== undefined) {
    data.applicationName = resolvedApplicationName;
  }
  if (proposed.has("departmentName") && resolvedDepartmentName !== undefined) {
    data.departmentName = resolvedDepartmentName;
  }
  if (body.category !== undefined && proposed.has("category")) data.category = body.category;
  if (body.description !== undefined && proposed.has("description")) {
    data.description = body.description;
  }
  if (body.likelihood !== undefined && proposed.has("likelihood")) {
    data.likelihood = body.likelihood;
  }
  if (body.impact !== undefined && proposed.has("impact")) data.impact = body.impact;
  if (body.affectedArea !== undefined && proposed.has("affectedArea")) {
    data.affectedArea = body.affectedArea;
  }
  if (body.mitigationStrategy !== undefined && proposed.has("mitigationStrategy")) {
    data.mitigationStrategy = body.mitigationStrategy;
  }
  if (body.riskOwnerId !== undefined && proposed.has("riskOwnerId")) {
    data.riskOwnerId = body.riskOwnerId;
  }
  if (body.status !== undefined) {
    data.status = body.status;
    if (nextStatusKey) data.statusKey = nextStatusKey;
  }
  if (body.notes !== undefined && proposed.has("notes")) data.notes = body.notes;
  if (proposed.has("likelihood") || proposed.has("impact")) {
    data.riskScore = likelihood * impact;
  }

  const row = await prisma.risk.update({
    where: { id: existing.id },
    data,
    include: riskInclude,
  });
  return NextResponse.json(row);
}

export async function DELETE(_req: Request, { params }: Params) {
  const { error } = await requireRole("editor");
  if (error) return error;

  const { id } = await params;
  const existing = await findRisk(id);
  if (!existing) return NextResponse.json({ error: "Risk not found" }, { status: 404 });

  await prisma.risk.delete({ where: { id: existing.id } });
  return NextResponse.json({ ok: true });
}
