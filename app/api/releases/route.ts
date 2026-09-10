import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { resolveDirectoryUser } from "@/lib/release-directory-user";
import { isExactEditorDirectoryUser } from "@/lib/release-seats";
import { prisma } from "@/lib/prisma";
import { releaseListOrderBy, releaseListWhere, sp } from "@/lib/list-api-filters";
import { releaseWhereForSessionTenant } from "@/lib/release-scope-tenant";
import { tenantReleaseLookupError } from "@/lib/release-scope-http";
import { generateReleaseId, normalizeProgramProject } from "@/lib/release-id";
import { createReleaseRow } from "@/lib/org-compat";
import {
  getLatestLifecycleConfigVersionId,
  loadReleaseLifecycleConfig,
} from "@/lib/release-lifecycle-config-db";
import {
  isEnabledReleaseStatusLabel,
  resolveCreateReleaseStatus,
} from "@/lib/release-lifecycle-status-ui";
import { resolveLifecycleStatusRef } from "@/lib/release-lifecycle-transition";
import { validateReleaseFieldUpdate } from "@/lib/release-field-lock-engine";
import {
  collectProposedDateConflicts,
  raiseAndNotifyConflicts,
} from "@/lib/conflict-detectors";
import {
  conflictChoiceHoldBody,
  shouldHoldWriteForConflictChoice,
} from "@/lib/conflict-save-gate";
import {
  encodeUxNoticeHeader,
  UX_NOTICE_HEADER,
  type UxNotice,
} from "@/lib/ux-notice";
import { parseGoLiveChecklistPercent } from "@/lib/release-form-matrix";
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
  const { user, error } = await requireRole("readonly");
  if (error) return error;
  const params = sp(req);
  const scoped = await releaseWhereForSessionTenant(user!, releaseListWhere(params));
  if (!scoped.ok) return tenantReleaseLookupError(scoped)!;
  const data = await prisma.release.findMany({
    where: scoped.where,
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
  // Create always starts at the enabled intake status (RD-110). Ignore body.status
  // so a crafted POST cannot pick Planning/Cancelled/etc.
  let lifecycleConfigVersionId: string | null = null;
  let status = "";
  let statusKey: string | undefined;
  try {
    const loaded = await loadReleaseLifecycleConfig(user!.id);
    status = resolveCreateReleaseStatus(loaded.config, body.status);
    if (!status || !isEnabledReleaseStatusLabel(loaded.config, status)) {
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
        "previousStatus",
        "blockerCount",
        "conflictCount",
        "createdBy",
        "lastModifiedBy",
        "durationDays",
        "raiseConflicts",
        "conflictNotes",
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
  const checklist = parseGoLiveChecklistPercent(body.goLiveChecklistPercent);
  if (!checklist.ok) {
    return NextResponse.json({ error: checklist.error, field: "goLiveChecklistPercent" }, { status: 400 });
  }
  const applicationIds: string[] = Array.isArray(body.applicationIds)
    ? body.applicationIds.filter(
        (id: unknown): id is string => typeof id === "string" && id.trim().length > 0
      )
    : [];
  let pendingToRaise: Awaited<ReturnType<typeof collectProposedDateConflicts>> = [];
  if (body.releaseDate && applicationIds.length > 0) {
    try {
      pendingToRaise = await collectProposedDateConflicts({
        clerkUserId: user!.id,
        releaseDate,
        startDate,
        applicationIds,
      });
    } catch (hookErr) {
      console.warn("[releases POST] conflict detect failed", {
        message: hookErr instanceof Error ? hookErr.message : "unknown",
      });
    }
    if (shouldHoldWriteForConflictChoice(pendingToRaise, body.raiseConflicts === true)) {
      return NextResponse.json(conflictChoiceHoldBody(pendingToRaise), { status: 409 });
    }
  }

  const directoryUser = await resolveDirectoryUser(user!);
  const requestedManagerId = optionalString(body.releaseManagerId) ?? null;
  const createOwnerId = optionalString(body.releaseOwnerId) ?? null;
  let createManagerId: string | null = null;
  if (requestedManagerId) {
    const managerRow = await prisma.user.findUnique({
      where: { id: requestedManagerId },
      select: { id: true, accessLevel: true, status: true, name: true, email: true },
    });
    const selfAssign =
      Boolean(directoryUser?.id) &&
      requestedManagerId === directoryUser!.id &&
      isExactEditorDirectoryUser(directoryUser!);
    const ownerNamingManager =
      Boolean(directoryUser?.id) &&
      createOwnerId === directoryUser!.id &&
      managerRow &&
      isExactEditorDirectoryUser(managerRow);
    if (!selfAssign && !ownerNamingManager) {
      return NextResponse.json(
        {
          error:
            "On create, you may assign yourself as Release Manager, or name another editor if you are also the owner.",
          code: "MANAGER_ASSIGN_DENIED",
        },
        { status: 403 }
      );
    }
    createManagerId = requestedManagerId;
  }

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
      hypercarePlan: optionalString(body.hypercarePlan) ?? null,
      commsPlan: optionalString(body.commsPlan) ?? null,
      trainingStatus: optionalString(body.trainingStatus) ?? null,
      goLiveChecklistPercent: checklist.value,
      deploymentWindow: optionalString(body.deploymentWindow) ?? null,
      releaseOwnerId: optionalString(body.releaseOwnerId) ?? null,
      releaseManagerId: createManagerId,
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
      dressRehearsal: optionalString(body.dressRehearsal) ?? null,
      devSignoff: optionalString(body.devSignoff) ?? null,
      testSignoff: optionalString(body.testSignoff) ?? null,
      uatSignoff: optionalString(body.uatSignoff) ?? null,
      securityClearance: optionalString(body.securityClearance) ?? null,
      businessSignoff: optionalString(body.businessSignoff) ?? null,
      opsSignoff: optionalString(body.opsSignoff) ?? null,
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

  const uxNotices: UxNotice[] = [];
  if (body.raiseConflicts === true && pendingToRaise.length > 0) {
    try {
      const extraNotes =
        typeof body.conflictNotes === "string" ? body.conflictNotes.trim() : "";
      const raised = await raiseAndNotifyConflicts({
        clerkUserId: user!.id,
        release1Code: created.releaseCode,
        releaseId: created.id,
        findings: extraNotes
          ? pendingToRaise.map((finding) => ({
              ...finding,
              notes: `${finding.notes} — ${extraNotes}`,
            }))
          : pendingToRaise,
        raisedBy: user!.name,
        automation: "CNF-REQ-CHOICE",
      });
      if (raised.roleFault) {
        uxNotices.push({
          title: "Automation needs a Settings fix",
          message: raised.roleFault.message,
        });
      }
    } catch (hookErr) {
      console.warn("[releases POST] conflict raise failed", {
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
  const payload = row;
  if (uxNotices.length > 0) {
    return NextResponse.json(payload, {
      status: 201,
      headers: {
        [UX_NOTICE_HEADER]: encodeUxNoticeHeader(uxNotices),
        "Access-Control-Expose-Headers": UX_NOTICE_HEADER,
      },
    });
  }
  return NextResponse.json(payload, { status: 201 });
}
