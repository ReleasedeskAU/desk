import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import { releaseListOrderBy, releaseListWhere, sp } from "@/lib/list-api-filters";
import { generateReleaseId, normalizeProgramProject } from "@/lib/release-id";
import { createReleaseRow } from "@/lib/org-compat";
import {
  getLatestLifecycleConfigVersionId,
  loadReleaseLifecycleConfig,
} from "@/lib/release-lifecycle-config-db";
import {
  defaultReleaseStatusLabel,
  isEnabledReleaseStatusLabel,
} from "@/lib/release-lifecycle-status-ui";
import { resolveLifecycleStatusRef } from "@/lib/release-lifecycle-transition";
import { validateReleaseFieldUpdate } from "@/lib/release-field-lock-engine";
import { detectScheduleConflictsOnDeployDate } from "@/lib/lifecycle-event-hooks";
import {
  encodeUxNoticeHeader,
  UX_NOTICE_HEADER,
  type UxNotice,
} from "@/lib/ux-notice";
import {
  validateReleaseDateOrder,
  validateReleaseNameAndApplications,
} from "@/lib/release-planning-entry-rules";

function optionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

function optionalDate(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

function optionalFloat(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function GET(req: Request) {
  const { error } = await requireRole("readonly");
  if (error) return error;
  const params = sp(req);
  const data = await prisma.release.findMany({
    where: releaseListWhere(params),
    include: {
      department: true,
      applications: { include: { application: true } },
      dependsOn: { include: { dependsOnRelease: true } },
      stakeholders: { include: { user: true } },
      releaseOwner: { select: { id: true, userId: true, name: true } },
    },
    orderBy: releaseListOrderBy(params),
  });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const { user, error } = await requireRole("editor");
  if (error) return error;
  const body = await req.json();

  // §1-02 / §1-03: name + applications are API-enforced (not form-only).
  const identityError = validateReleaseNameAndApplications({
    name: body.name,
    applicationIds: body.applicationIds,
  });
  if (identityError) {
    return NextResponse.json({ error: identityError }, { status: 400 });
  }

  // Only load codes when we need to generate one — avoid a full-table scan on every create.
  let releaseCode = typeof body.releaseCode === "string" ? body.releaseCode.trim() : "";
  if (!releaseCode) {
    const existing = await prisma.release.findMany({ select: { releaseCode: true } });
    releaseCode = generateReleaseId(existing.map((r) => r.releaseCode));
  }

  const releaseDate = body.releaseDate ? new Date(body.releaseDate) : new Date();
  const startDate = optionalDate(body.startDate) ?? null;
  // VR-01: End Date cannot be before Start Date.
  const dateOrderError = validateReleaseDateOrder({
    startDate,
    endDate: releaseDate,
  });
  if (dateOrderError) {
    return NextResponse.json({ error: dateOrderError }, { status: 400 });
  }

  // Pin new releases to the creator's latest lifecycle snapshot so mid-flight
  // config edits cannot re-route them. Existing rows stay unpinned until backfill.
  // Status must be an enabled label in the creator's lifecycle config (SSOT).
  let lifecycleConfigVersionId: string | null = null;
  let status = String(body.status ?? "").trim();
  let statusKey: string | undefined;
  try {
    const loaded = await loadReleaseLifecycleConfig(user!.id);
    const defaultStatus = defaultReleaseStatusLabel(loaded.config) || "Draft";
    if (!status) status = defaultStatus;
    if (!isEnabledReleaseStatusLabel(loaded.config, status)) {
      return NextResponse.json(
        { error: "Status is not enabled in the release lifecycle configuration" },
        { status: 400 }
      );
    }
    const persisted = resolveLifecycleStatusRef(loaded.config, status);
    if (persisted) {
      status = persisted.label;
      statusKey = persisted.key;
    }
    lifecycleConfigVersionId =
      loaded.latestVersionId ??
      (await getLatestLifecycleConfigVersionId(user!.id));
  } catch (pinError) {
    console.error("[release-create] lifecycle config load failed", {
      clerkUserId: user!.id,
      message: pinError instanceof Error ? pinError.message : "unknown",
    });
    return NextResponse.json(
      { error: "Release lifecycle configuration is temporarily unavailable" },
      { status: 503 }
    );
  }

  // Field locks at create status. Skip identity/audit/computed keys set by the server.
  const createLockKeys = Object.keys(body).filter(
    (key) =>
      body[key] !== undefined &&
      ![
        "releaseCode",
        "id",
        "createdAt",
        "updatedAt",
        "releaseHealth",
        "readinessPercent",
        "weightedRiskScore",
        "weightedRiskLevel",
        "lifecycleConfigVersionId",
      ].includes(key)
  );
  const createLock = await validateReleaseFieldUpdate(
    user!.id,
    status,
    createLockKeys
  );
  if (!createLock.allowed) {
    return NextResponse.json(
      {
        error: (() => {
          const labels = createLock.rejected.map((r) => {
            const match = r.reason.match(/^"([^"]+)"/);
            return match?.[1] ?? r.field;
          });
          const list = labels.join(", ");
          const verb = labels.length === 1 ? "is" : "are";
          const pronoun = labels.length === 1 ? "it" : "them";
          return `Can’t create with these fields set for this status. ${list} ${verb} locked until the release moves to a status that allows ${pronoun}.`;
        })(),
        code: "FIELD_LOCK_DENIED",
        rejected: createLock.rejected,
      },
      { status: 400 }
    );
  }

  const actorName = user!.name?.trim() || user!.id;
  const created = await createReleaseRow({
      releaseCode,
      name: String(body.name ?? ""),
      programProject: normalizeProgramProject(body.programProject ?? "") ?? "N/A",
      owner: String(body.owner ?? "Unknown"),
      status,
      statusKey,
      releaseDate,
      priority: String(body.priority ?? "P3 - Medium"),
      impact: String(body.impact ?? "Medium"),
      departmentId: String(body.departmentId),
      notes: optionalString(body.notes) ?? null,
      dependencies: optionalString(body.dependencies) ?? null,
      releaseSize: optionalString(body.releaseSize) ?? null,
      cabDate: optionalDate(body.cabDate) ?? null,
      startDate,
      testEnvRequired: optionalString(body.testEnvRequired) ?? null,
      uatEnvRequired: optionalString(body.uatEnvRequired) ?? null,
      conflictFlag: Boolean(body.conflictFlag),
      conflictId: optionalString(body.conflictId) ?? null,
      readinessPercent: optionalFloat(body.readinessPercent) ?? null,
      blockers: optionalString(body.blockers) ?? null,
      vendorMaintenance: optionalString(body.vendorMaintenance) ?? null,
      changeFreeze: optionalString(body.changeFreeze) ?? null,
      regulatory: optionalString(body.regulatory) ?? null,
      approvalStatus: optionalString(body.approvalStatus) ?? null,
      rollbackPlan: optionalString(body.rollbackPlan) ?? null,
      goLiveChecklistPercent: optionalFloat(body.goLiveChecklistPercent) ?? null,
      deploymentWindow: optionalString(body.deploymentWindow) ?? null,
      releaseOwnerId: optionalString(body.releaseOwnerId) ?? null,
      lifecycleConfigVersionId,
      releaseType: optionalString(body.releaseType) ?? null,
      backupOwner: optionalString(body.backupOwner) ?? null,
      technicalLead: optionalString(body.technicalLead) ?? null,
      businessOwner: optionalString(body.businessOwner) ?? null,
      scopeDescription: optionalString(body.scopeDescription) ?? null,
      changeDescription: optionalString(body.changeDescription) ?? null,
      justification: optionalString(body.justification) ?? null,
      goLiveDate: optionalDate(body.goLiveDate) ?? null,
      deployDate: optionalDate(body.deployDate) ?? null,
      createdBy: actorName,
      lastModifiedBy: actorName,
    });
  await Promise.all([
    body.applicationIds?.length
      ? prisma.releaseApplication.createMany({
          data: body.applicationIds.map((applicationId: string) => ({ releaseId: created.id, applicationId })),
        })
      : Promise.resolve(),
    body.dependsOnReleaseIds?.length
      ? prisma.releaseDependency.createMany({
          data: body.dependsOnReleaseIds.map((dependsOnReleaseId: string) => ({ releaseId: created.id, dependsOnReleaseId })),
        })
      : Promise.resolve(),
    body.stakeholderIds?.length
      ? prisma.releaseStakeholder.createMany({
          data: body.stakeholderIds.map((userId: string) => ({ releaseId: created.id, userId })),
        })
      : Promise.resolve(),
  ]);

  // AV-05: after apps are linked so shared-application overlap can be detected.
  const uxNotices: UxNotice[] = [];
  if (body.releaseDate && body.applicationIds?.length) {
    try {
      const createdConflicts = await detectScheduleConflictsOnDeployDate(
        created.id,
        releaseDate,
        user!.id
      );
      if (createdConflicts.roleFault) {
        uxNotices.push({
          title: "Automation needs a Settings fix",
          message: createdConflicts.roleFault.message,
        });
      }
    } catch (hookErr) {
      console.warn("[releases POST] AV-05 conflict detect failed", {
        releaseId: created.id,
        message: hookErr instanceof Error ? hookErr.message : "unknown",
      });
    }
  }

  const row = await prisma.release.findUniqueOrThrow({
    where: { id: created.id },
    include: {
      department: true,
      applications: { include: { application: true } },
      dependsOn: { include: { dependsOnRelease: true } },
      stakeholders: { include: { user: true } },
      releaseOwner: { select: { id: true, userId: true, name: true } },
    },
  });
  if (uxNotices.length > 0) {
    return NextResponse.json(row, {
      status: 201,
      headers: {
        [UX_NOTICE_HEADER]: encodeUxNoticeHeader(uxNotices),
        "Access-Control-Expose-Headers": UX_NOTICE_HEADER,
      },
    });
  }
  return NextResponse.json(row, { status: 201 });
}
