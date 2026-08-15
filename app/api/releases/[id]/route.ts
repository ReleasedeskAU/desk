import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import {
  auditActorName,
  summarizeIdListChange,
  summarizeReleaseFieldEdits,
} from "@/lib/release-audit";
import { normalizeProgramProject } from "@/lib/release-id";
import { deniedReleaseEditFields } from "@/lib/release-lifecycle-edit-policy";
import { resolveLifecycleConfigForRelease } from "@/lib/release-lifecycle-config-db";
import { enforceReleaseStatusChange } from "@/lib/release-lifecycle-status-patch";
import { loadSignoffLifecycleConfig } from "@/lib/signoff-lifecycle-config-db";
import { enforceSignoffFieldChanges } from "@/lib/signoff-lifecycle-enforce";
import { SIGNOFF_RELEASE_FIELDS } from "@/lib/signoff-lifecycle-config";
import {
  nextSignoffIntakeAtMap,
  readSignoffIntakeAt,
  writeSignoffIntakeAt,
} from "@/lib/signoff-intake-at";
import { validateReleaseFieldUpdate } from "@/lib/release-field-lock-engine";
import {
  cascadeWithdrawApprovalsOnReleaseCancelled,
  guardDependencyGraphMutation,
  isReleaseCancelled,
} from "@/lib/release-related-entity-guards";
import { editPolicyDeniedMessage } from "@/lib/edit-policy-user-message";
import {
  encodeUxNoticeHeader,
  UX_NOTICE_HEADER,
  type UxNotice,
} from "@/lib/ux-notice";
import {
  cascadeDependenciesAtRiskOnRollback,
  cascadeDependenciesMetOnDeploy,
} from "@/lib/lifecycle-event-hooks";
import {
  collectProposedDateConflicts,
  raiseAndNotifyConflicts,
} from "@/lib/conflict-detectors";
import {
  conflictChoiceHoldBody,
  shouldHoldWriteForConflictChoice,
} from "@/lib/conflict-save-gate";
import {
  createDefaultReleaseLifecycleConfig,
} from "@/lib/release-lifecycle-config";
import { resolveLifecycleStatusRef } from "@/lib/release-lifecycle-transition";
import { validateReleaseDateOrder } from "@/lib/release-planning-entry-rules";
import { buildCabScopeSnapshot } from "@/lib/release-cab-scope-snapshot";
import { keysWithActualReleasePatchChanges } from "@/lib/release-patch-changed-keys";
import { Prisma } from "@releasedesk/database";

const releaseInclude = {
  department: true,
  releaseOwner: { select: { id: true, userId: true, name: true, email: true, role: true } },
  stakeholders: { include: { user: { select: { id: true, userId: true, name: true, email: true, role: true } } } },
  applications: { include: { application: { include: { department: true } } } },
  dependsOn: { include: { dependsOnRelease: true } },
  dependedBy: { include: { release: true } },
  bookings: { include: { application: true, environment: true } },
  auditEvents: { orderBy: { createdAt: "desc" as const }, take: 100 },
};

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireRole("readonly");
  if (error) return error;

  // Accept both UUID primary key and releaseCode (e.g. REL-0002)
  const row = await prisma.release.findFirst({
    where: { OR: [{ id }, { releaseCode: id }] },
    include: releaseInclude,
  });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(row);
}

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

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, error } = await requireRole("editor");
  if (error) return error;

  const body = await req.json();
  // Resolve actual record — accept UUID or releaseCode
  const existing = await prisma.release.findFirst({ where: { OR: [{ id }, { releaseCode: id }] } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const realId = existing.id;

  // Full-form saves echo unchanged identity fields (Release ID, apps, dates).
  // Only real edits go through edit policy and field locks — otherwise an
  // always-locked Release ID masks the actual status-transition error.
  let currentApplicationIds: string[] | undefined;
  let currentDependsOnReleaseIds: string[] | undefined;
  let currentStakeholderIds: string[] | undefined;
  if (body.applicationIds !== undefined) {
    const apps = await prisma.releaseApplication.findMany({
      where: { releaseId: realId },
      select: { applicationId: true },
    });
    currentApplicationIds = apps.map((a) => a.applicationId);
  }
  if (body.dependsOnReleaseIds !== undefined) {
    const deps = await prisma.releaseDependency.findMany({
      where: { releaseId: realId },
      select: { dependsOnReleaseId: true },
    });
    currentDependsOnReleaseIds = deps.map((d) => d.dependsOnReleaseId);
  }
  if (body.stakeholderIds !== undefined) {
    const holders = await prisma.releaseStakeholder.findMany({
      where: { releaseId: realId },
      select: { userId: true },
    });
    currentStakeholderIds = holders.map((s) => s.userId);
  }
  const proposedKeys = keysWithActualReleasePatchChanges({
    existing: existing as unknown as Record<string, unknown>,
    body,
    currentApplicationIds,
    currentDependsOnReleaseIds,
    currentStakeholderIds,
  });

  // Editable? column — deny non-status field writes based on current status.
  let pinnedReleaseConfig;
  try {
    const resolved = await resolveLifecycleConfigForRelease(
      user!.id,
      existing.lifecycleConfigVersionId
    );
    pinnedReleaseConfig = resolved.config;
    const { config } = resolved;
    const { mode, denied } = deniedReleaseEditFields(
      config,
      existing.status,
      proposedKeys
    );
    if (denied.length > 0) {
      return NextResponse.json(
        {
          error: editPolicyDeniedMessage({
            entity: "release",
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
  } catch (err) {
    console.error("[releases PATCH] edit policy resolve failed", {
      releaseId: realId,
      message: err instanceof Error ? err.message : "unknown",
    });
    return NextResponse.json(
      { error: "Release edit policy is temporarily unavailable" },
      { status: 500 }
    );
  }

  // Configurable field-lock matrix (live/latest) — rejects locked writes; VR-21 side effects.
  const fieldLock = await validateReleaseFieldUpdate(
    user!.id,
    existing.status,
    proposedKeys
  );
  if (!fieldLock.allowed) {
    const lockedLabels = fieldLock.rejected.map((r) => r.reason).join(" ");
    return NextResponse.json(
      {
        error:
          lockedLabels ||
          "One or more fields are locked for this release’s current status. Change the status first, or ask an admin to open the field under Lifecycle → Field Locks.",
        code: "FIELD_LOCK_DENIED",
        rejected: fieldLock.rejected,
      },
      { status: 400 }
    );
  }

  const proposed = new Set(proposedKeys);
  const data: Record<string, unknown> = {};
  let signoffIntakeWrite: ReturnType<typeof nextSignoffIntakeAtMap> | null = null;
  // Only persist fields that actually changed — full-form echoes must not
  // rewrite locked columns (e.g. owner label) while status is Blocked.
  for (const key of ["name", "owner", "priority", "impact", "decision", "departmentId", "releaseCode"]) {
    if (body[key] !== undefined && proposed.has(key)) data[key] = body[key];
  }
  if (body.programProject !== undefined && proposed.has("programProject")) {
    data.programProject = normalizeProgramProject(body.programProject) ?? "N/A";
  }

  // Sign-off checklist fields — config-driven transitions + immutability.
  // Training Status is a sheet checklist (Not Started / Draft / Ready), not a
  // sign-off decision — persist as a scalar. Other SIGNOFF_RELEASE_FIELDS still
  // go through the sign-off graph (no status-key hardcoding).
  const signoffKeysInBody = SIGNOFF_RELEASE_FIELDS.filter(
    (key) => body[key] !== undefined && key !== "trainingStatus"
  );
  if (signoffKeysInBody.length > 0) {
    try {
      const { config: signoffConfig } = await loadSignoffLifecycleConfig(user!.id);
      const signoffResult = enforceSignoffFieldChanges({
        config: signoffConfig,
        existing: {
          devSignoff: existing.devSignoff,
          testSignoff: existing.testSignoff,
          uatSignoff: existing.uatSignoff,
          securityClearance: existing.securityClearance,
          businessSignoff: existing.businessSignoff,
          opsSignoff: existing.opsSignoff,
          dressRehearsal: existing.dressRehearsal,
          trainingStatus: existing.trainingStatus,
          supportBriefed: existing.supportBriefed,
        },
        body,
      });
      if (!signoffResult.ok) {
        return NextResponse.json(signoffResult.body, {
          status: signoffResult.httpStatus,
        });
      }
      for (const [key, value] of Object.entries(signoffResult.canonical)) {
        data[key] = value;
      }
      if (Object.keys(signoffResult.canonical).length > 0) {
        const existingSignoff = {
          devSignoff: existing.devSignoff,
          testSignoff: existing.testSignoff,
          uatSignoff: existing.uatSignoff,
          securityClearance: existing.securityClearance,
          businessSignoff: existing.businessSignoff,
          opsSignoff: existing.opsSignoff,
          dressRehearsal: existing.dressRehearsal,
          trainingStatus: existing.trainingStatus,
          supportBriefed: existing.supportBriefed,
        };
        const previousIntake = await readSignoffIntakeAt(realId);
        signoffIntakeWrite = nextSignoffIntakeAtMap({
          config: signoffConfig,
          existingValues: existingSignoff,
          writes: signoffResult.canonical,
          previous: previousIntake,
          now: new Date(),
        });
      }
    } catch (err) {
      console.error("[releases PATCH] sign-off lifecycle enforcement failed", {
        releaseId: realId,
        message: err instanceof Error ? err.message : "unknown",
      });
      return NextResponse.json(
        { error: "Sign-off lifecycle validation is temporarily unavailable" },
        { status: 500 }
      );
    }
  }

  // Status changes go through lifecycle enforcement (pinned or latest-unpinned config).
  let statusOverrideAudit: string | null = null;
  if (body.status !== undefined) {
    const requestedStatus = String(body.status);
    if (requestedStatus !== existing.status) {
      let enforcement;
      try {
        enforcement = await enforceReleaseStatusChange({
          clerkUserId: user!.id,
          release: {
            id: existing.id,
            releaseCode: existing.releaseCode,
            status: existing.status,
            name: existing.name,
            owner: existing.owner,
            releaseSize: existing.releaseSize,
            priority: existing.priority,
            startDate: existing.startDate,
            releaseDate: existing.releaseDate,
            rollbackPlan: existing.rollbackPlan,
            notes: existing.notes,
            changeFreeze: existing.changeFreeze,
            goLiveChecklistPercent: existing.goLiveChecklistPercent,
            lifecycleConfigVersionId: existing.lifecycleConfigVersionId,
            devSignoff: (data.devSignoff as string | undefined) ?? existing.devSignoff,
            testSignoff: (data.testSignoff as string | undefined) ?? existing.testSignoff,
            uatSignoff: (data.uatSignoff as string | undefined) ?? existing.uatSignoff,
            securityClearance:
              (data.securityClearance as string | undefined) ?? existing.securityClearance,
            dressRehearsal:
              (data.dressRehearsal as string | undefined) ?? existing.dressRehearsal,
            opsSignoff: (data.opsSignoff as string | undefined) ?? existing.opsSignoff,
            businessSignoff:
              (data.businessSignoff as string | undefined) ?? existing.businessSignoff,
            scopeDescription: existing.scopeDescription,
            postImplementationReviewCompleted:
              existing.postImplementationReviewCompleted,
            cabScopeSnapshot: existing.cabScopeSnapshot,
          },
          requestedStatus,
          overrideReason:
            typeof body.overrideReason === "string" ? body.overrideReason : null,
          previousStatusHint:
            typeof body.previousStatus === "string" ? body.previousStatus : null,
        });
      } catch (err) {
        console.error("[releases PATCH] lifecycle enforcement failed", {
          releaseId: realId,
          message: err instanceof Error ? err.message : "unknown",
        });
        return NextResponse.json(
          { error: "Release status validation is temporarily unavailable" },
          { status: 500 }
        );
      }
      if (!enforcement.ok) {
        return NextResponse.json(enforcement.body, {
          status: enforcement.httpStatus,
        });
      }
      data.status = enforcement.canonicalStatus;
      const persisted = resolveLifecycleStatusRef(
        pinnedReleaseConfig ?? createDefaultReleaseLifecycleConfig(),
        enforcement.canonicalStatus
      );
      if (persisted) data.statusKey = persisted.key;
      if (enforcement.result.overridden) {
        statusOverrideAudit = `overrideReason=${enforcement.result.overrideReason}; unmet=${enforcement.result.unmetReasons.join("|")}`;
      }
    }
  }

  for (const key of [
    "notes",
    "dependencies",
    "releaseSize",
    "testEnvRequired",
    "uatEnvRequired",
    "conflictId",
    "blockers",
    "vendorMaintenance",
    "changeFreeze",
    "regulatory",
    "approvalStatus",
    "rollbackPlan",
    "hypercarePlan",
    "commsPlan",
    "trainingStatus",
    "deploymentWindow",
    "releaseType",
    "backupOwner",
    "technicalLead",
    "businessOwner",
    "scopeDescription",
    "changeDescription",
    "justification",
  ] as const) {
    if (!proposed.has(key)) continue;
    const v = optionalString(body[key]);
    if (v !== undefined) data[key] = v;
  }

  if (
    body.postImplementationReviewCompleted !== undefined &&
    proposed.has("postImplementationReviewCompleted")
  ) {
    data.postImplementationReviewCompleted = Boolean(
      body.postImplementationReviewCompleted
    );
  }

  if (body.conflictFlag !== undefined && proposed.has("conflictFlag")) {
    data.conflictFlag = Boolean(body.conflictFlag);
  }
  if (body.releaseOwnerId !== undefined && proposed.has("releaseOwnerId")) {
    data.releaseOwnerId = optionalString(body.releaseOwnerId);
    // Keep denormalized owner string in sync when the FK is the gated source of truth.
    if (typeof data.releaseOwnerId === "string" && data.releaseOwnerId) {
      const ownerUser = await prisma.user.findUnique({
        where: { id: data.releaseOwnerId },
        select: { userId: true, name: true },
      });
      if (ownerUser) {
        data.owner = `${ownerUser.userId} (${ownerUser.name})`;
      }
    }
  }

  for (const key of [
    "releaseDate",
    "cabDate",
    "startDate",
    "goLiveDate",
    "deployDate",
  ] as const) {
    if (!proposed.has(key)) continue;
    const v = optionalDate(body[key]);
    if (v !== undefined) data[key] = v;
  }
  for (const key of ["readinessPercent", "goLiveChecklistPercent"] as const) {
    if (!proposed.has(key)) continue;
    const v = optionalFloat(body[key]);
    if (v !== undefined) data[key] = v;
  }

  // §1-02: blank name cannot be written via API.
  if (typeof data.name === "string" && !data.name.trim()) {
    return NextResponse.json(
      { error: "Release name is required." },
      { status: 400 }
    );
  }

  // VR-01: End Date cannot be before Start Date (merged post-patch values).
  {
    const nextStart =
      data.startDate !== undefined
        ? (data.startDate as Date | null)
        : existing.startDate;
    const nextEnd =
      data.releaseDate !== undefined
        ? (data.releaseDate as Date | null)
        : existing.releaseDate;
    const dateOrderError = validateReleaseDateOrder({
      startDate: nextStart,
      endDate: nextEnd,
    });
    if (dateOrderError) {
      return NextResponse.json({ error: dateOrderError }, { status: 400 });
    }
  }

  // §1-03: refuse clearing the last application via API (before any mutation).
  if (body.applicationIds !== undefined) {
    if (
      !Array.isArray(body.applicationIds) ||
      body.applicationIds.filter(
        (id: unknown) => typeof id === "string" && id.trim().length > 0
      ).length === 0
    ) {
      return NextResponse.json(
        { error: "Select at least one application." },
        { status: 400 }
      );
    }
  }

  // VR-36: reject dependency graph sync before any mutation when status ≥ Ready.
  if (body.dependsOnReleaseIds) {
    const statusAfterPatch =
      typeof data.status === "string" ? String(data.status) : existing.status;
    const frozen = guardDependencyGraphMutation(
      statusAfterPatch,
      pinnedReleaseConfig ?? createDefaultReleaseLifecycleConfig()
    );
    if (!frozen.ok) return frozen.response;
  }

  // Audit actor for Last Modified By (Created By is set only on POST).
  const actor = auditActorName(user!);
  data.lastModifiedBy = actor;

  // CAB scope snapshot: write/clear from status roles, not cab_approved / pending_cab keys.
  if (typeof data.status === "string" && data.status !== existing.status) {
    const cabConfig =
      pinnedReleaseConfig ?? createDefaultReleaseLifecycleConfig();
    const nextRef = resolveLifecycleStatusRef(cabConfig, String(data.status));
    const prevRef = resolveLifecycleStatusRef(cabConfig, existing.status);
    if (nextRef?.writesCabScopeSnapshot && !prevRef?.writesCabScopeSnapshot) {
      data.cabScopeSnapshot = buildCabScopeSnapshot({
        releaseSize:
          typeof data.releaseSize === "string"
            ? data.releaseSize
            : existing.releaseSize,
        priority:
          typeof data.priority === "string" ? data.priority : existing.priority,
        scopeDescription:
          typeof data.scopeDescription === "string"
            ? data.scopeDescription
            : existing.scopeDescription,
      }) as unknown as Prisma.InputJsonValue;
    } else if (
      prevRef?.writesCabScopeSnapshot &&
      nextRef?.clearsCabScopeSnapshot
    ) {
      data.cabScopeSnapshot = Prisma.DbNull;
    }
  }

  // Collect audit fragments before mutating so "before" state is accurate.
  const auditParts: string[] = [];
  const cascadeFaults: string[] = [];
  const fieldDetail = summarizeReleaseFieldEdits(
    existing as unknown as Record<string, unknown>,
    data
  );
  if (fieldDetail) auditParts.push(fieldDetail);

  const proposedDate =
    data.releaseDate instanceof Date ? data.releaseDate : existing.releaseDate;
  const proposedStart =
    data.startDate instanceof Date
      ? data.startDate
      : data.startDate === null
        ? null
        : existing.startDate;
  const dateChanged =
    (data.releaseDate instanceof Date &&
      existing.releaseDate.getTime() !== data.releaseDate.getTime()) ||
    (data.startDate instanceof Date &&
      (existing.startDate?.getTime() ?? 0) !== data.startDate.getTime()) ||
    (data.startDate === null && existing.startDate != null);
  const proposedAppIds = Array.isArray(body.applicationIds)
    ? body.applicationIds.filter(
        (id: unknown): id is string => typeof id === "string" && id.trim().length > 0
      )
    : undefined;
  const appsChanged =
    proposedAppIds !== undefined &&
    currentApplicationIds !== undefined &&
    (proposedAppIds.length !== currentApplicationIds.length ||
      proposedAppIds.some((id) => !currentApplicationIds!.includes(id)));

  let pendingToRaise: Awaited<ReturnType<typeof collectProposedDateConflicts>> = [];
  if (
    proposedDate &&
    (dateChanged || appsChanged || body.raiseConflicts === true)
  ) {
    try {
      const appIds =
        proposedAppIds ??
        (
          await prisma.releaseApplication.findMany({
            where: { releaseId: realId },
            select: { applicationId: true },
          })
        ).map((row) => row.applicationId);
      pendingToRaise = await collectProposedDateConflicts({
        clerkUserId: user!.id,
        releaseDate: proposedDate,
        startDate: proposedStart,
        applicationIds: appIds,
        excludeReleaseId: realId,
        lifecycleConfigVersionId: existing.lifecycleConfigVersionId,
        selfStatus: existing.status,
      });
    } catch (hookErr) {
      console.warn("[releases PATCH] conflict detect failed", {
        releaseId: realId,
        message: hookErr instanceof Error ? hookErr.message : "unknown",
      });
    }
    if (shouldHoldWriteForConflictChoice(pendingToRaise, body.raiseConflicts === true)) {
      return NextResponse.json(conflictChoiceHoldBody(pendingToRaise), {
        status: 409,
      });
    }
  }

  await prisma.release.update({ where: { id: realId }, data });
  if (signoffIntakeWrite) {
    try {
      await writeSignoffIntakeAt(realId, signoffIntakeWrite);
    } catch (err) {
      console.error("[releases PATCH] sign-off intake clock write failed", {
        releaseId: realId,
        message: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  // CASC-13: withdraw open Approvals when status lands on the withdraw-approvals role.
  if (
    typeof data.status === "string" &&
    pinnedReleaseConfig &&
    isReleaseCancelled(String(data.status), pinnedReleaseConfig) &&
    !isReleaseCancelled(existing.status, pinnedReleaseConfig)
  ) {
    try {
      const withdrawn = await cascadeWithdrawApprovalsOnReleaseCancelled(
        realId,
        user!.id
      );
      if (withdrawn.roleFault) {
        auditParts.push(`CASC-13 blocked: ${withdrawn.roleFault.message}`);
        cascadeFaults.push(withdrawn.roleFault.message);
      } else if (withdrawn.count > 0) {
        auditParts.push(
          `CASC-13: withdrew ${withdrawn.count} open approval${withdrawn.count === 1 ? "" : "s"}`
        );
      }
    } catch (cascErr) {
      console.warn("[releases PATCH] CASC-13 approval cascade failed", {
        releaseId: realId,
        message: cascErr instanceof Error ? cascErr.message : "unknown",
      });
    }
  }

  // AV-04 / AV-26 — dependency cascades after committed status change.
  if (typeof data.status === "string" && data.status !== existing.status) {
    const releaseConfig =
      pinnedReleaseConfig ?? createDefaultReleaseLifecycleConfig();
    const nextRef = resolveLifecycleStatusRef(releaseConfig, String(data.status));
    const prevRef = resolveLifecycleStatusRef(releaseConfig, existing.status);
    if (nextRef?.deployedMilestone && !prevRef?.deployedMilestone) {
      try {
        const met = await cascadeDependenciesMetOnDeploy(realId, user!.id);
        if (met.roleFault) {
          auditParts.push(`AV-04 blocked: ${met.roleFault.message}`);
          cascadeFaults.push(met.roleFault.message);
        } else if (met.count > 0) {
          auditParts.push(
            `AV-04: marked ${met.count} dependent${met.count === 1 ? "" : "s"} Met`
          );
        }
      } catch (hookErr) {
        console.warn("[releases PATCH] AV-04 dependency Met cascade failed", {
          releaseId: realId,
          message: hookErr instanceof Error ? hookErr.message : "unknown",
        });
      }
    }
    if (nextRef?.rollbackMilestone && !prevRef?.rollbackMilestone) {
      try {
        const atRisk = await cascadeDependenciesAtRiskOnRollback(realId, user!.id);
        if (atRisk.roleFault) {
          auditParts.push(`AV-26 blocked: ${atRisk.roleFault.message}`);
          cascadeFaults.push(atRisk.roleFault.message);
        } else if (atRisk.count > 0) {
          auditParts.push(
            `AV-26: flagged ${atRisk.count} dependenc${atRisk.count === 1 ? "y" : "ies"} after rollback`
          );
        }
      } catch (hookErr) {
        console.warn("[releases PATCH] AV-26 At Risk cascade failed", {
          releaseId: realId,
          message: hookErr instanceof Error ? hookErr.message : "unknown",
        });
      }
    }
  }

  if (body.applicationIds) {
    const beforeApps = await prisma.releaseApplication.findMany({
      where: { releaseId: realId },
      select: { applicationId: true },
    });
    const appChange = summarizeIdListChange(
      "Applications",
      beforeApps.map((a) => a.applicationId),
      body.applicationIds as string[]
    );
    if (appChange) auditParts.push(appChange);

    await prisma.releaseApplication.deleteMany({ where: { releaseId: realId } });
    if (body.applicationIds.length) {
      await prisma.releaseApplication.createMany({
        data: body.applicationIds.map((applicationId: string) => ({ releaseId: realId, applicationId })),
      });
    }
  }

  if (body.dependsOnReleaseIds) {
    const dependsOnReleaseIds = body.dependsOnReleaseIds as string[];
    const beforeDeps = await prisma.releaseDependency.findMany({
      where: { releaseId: realId, dependencyCode: null },
      select: { dependsOnReleaseId: true },
    });
    const depChange = summarizeIdListChange(
      "Depends On",
      beforeDeps.map((d) => d.dependsOnReleaseId),
      dependsOnReleaseIds
    );
    if (depChange) auditParts.push(depChange);

    // Preserve tracked dependencies (DEP-*) — only sync lightweight release-form links.
    await prisma.releaseDependency.deleteMany({
      where: {
        releaseId: realId,
        dependencyCode: null,
        ...(dependsOnReleaseIds.length
          ? { dependsOnReleaseId: { notIn: dependsOnReleaseIds } }
          : {}),
      },
    });
    for (const dependsOnReleaseId of dependsOnReleaseIds) {
      const existingDep = await prisma.releaseDependency.findUnique({
        where: {
          releaseId_dependsOnReleaseId: { releaseId: realId, dependsOnReleaseId },
        },
        select: { id: true },
      });
      if (!existingDep) {
        await prisma.releaseDependency.create({
          data: { releaseId: realId, dependsOnReleaseId },
        });
      }
    }
  }

  if (body.stakeholderIds !== undefined && proposed.has("stakeholderIds")) {
    if (!Array.isArray(body.stakeholderIds)) {
      return NextResponse.json(
        { error: "Stakeholders must be a list of people." },
        { status: 400 }
      );
    }
    const beforeStakeholders = await prisma.releaseStakeholder.findMany({
      where: { releaseId: realId },
      select: { userId: true },
    });
    const stakeholderChange = summarizeIdListChange(
      "Stakeholders",
      beforeStakeholders.map((s) => s.userId),
      body.stakeholderIds
    );
    if (stakeholderChange) auditParts.push(stakeholderChange);

    await prisma.releaseStakeholder.deleteMany({ where: { releaseId: realId } });
    if (body.stakeholderIds.length) {
      await prisma.releaseStakeholder.createMany({
        data: body.stakeholderIds.map((userId: string) => ({ releaseId: realId, userId })),
      });
    }
  }

  // VR-21: Size/Priority edits at CAB Approved revert to Pending CAB via lifecycle engine.
  const uxNotices: UxNotice[] = cascadeFaults.map((message) => ({
    title: "Automation needs a Settings fix",
    message,
  }));
  if (
    fieldLock.sideEffects.some((s) => s.effect === "revert_to_pending_cab") &&
    body.status === undefined
  ) {
    try {
      const afterFields = await prisma.release.findUnique({ where: { id: realId } });
      if (afterFields) {
        const { config: liveConfig } = await resolveLifecycleConfigForRelease(
          user!.id,
          afterFields.lifecycleConfigVersionId
        );
        const pendingLabel =
          liveConfig.statuses.find((s) => s.clearsCabScopeSnapshot)?.label ??
          liveConfig.statuses.find((s) => s.key === "pending_cab")?.label ??
          "Pending CAB";
        if (afterFields.status !== pendingLabel) {
          const enforcement = await enforceReleaseStatusChange({
            clerkUserId: user!.id,
            release: afterFields,
            requestedStatus: pendingLabel,
            overrideReason: "VR-21: size/priority change after CAB approval",
            previousStatusHint: existing.status,
          });
          if (enforcement.ok) {
            await prisma.release.update({
              where: { id: realId },
              data: { status: enforcement.canonicalStatus },
            });
            auditParts.push(
              `Status reverted to ${enforcement.canonicalStatus} (VR-21 field-lock side effect)`
            );
            uxNotices.push({
              title: "Status moved back to Pending CAB",
              message:
                "Changing Size or Priority after CAB approval requires a new CAB review. Your field changes were saved.",
            });
          } else {
            console.warn("[releases PATCH] VR-21 revert blocked", {
              releaseId: realId,
              code: enforcement.body.code,
            });
            uxNotices.push({
              title: "Status could not be moved back to Pending CAB",
              message:
                "Your Size/Priority changes were saved, but we couldn’t move status back to Pending CAB. Contact an admin — CAB approval may no longer match the release.",
            });
          }
        }
      }
    } catch (sideEffectErr) {
      console.warn("[releases PATCH] VR-21 side effect failed", {
        releaseId: realId,
        message:
          sideEffectErr instanceof Error ? sideEffectErr.message : "unknown",
      });
      uxNotices.push({
        title: "Status could not be moved back to Pending CAB",
        message:
          "Your Size/Priority changes were saved, but we couldn’t move status back to Pending CAB. Contact an admin — CAB approval may no longer match the release.",
      });
    }
  }

  if (body.raiseConflicts === true && pendingToRaise.length > 0) {
    try {
      const extraNotes =
        typeof body.conflictNotes === "string" ? body.conflictNotes.trim() : "";
      const raised = await raiseAndNotifyConflicts({
        clerkUserId: user!.id,
        release1Code: existing.releaseCode,
        releaseId: realId,
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
      } else if (raised.count > 0) {
        auditParts.push(
          `Raised ${raised.count} conflict${raised.count === 1 ? "" : "s"} for RM review`
        );
      }
    } catch (hookErr) {
      console.warn("[releases PATCH] conflict raise failed", {
        releaseId: realId,
        message: hookErr instanceof Error ? hookErr.message : "unknown",
      });
    }
  }

  // Every edit is recorded with who made it — status-only patches keep a clearer action label.
  if (auditParts.length) {
    const statusOnly =
      Object.keys(data).length === 1 &&
      data.status !== undefined &&
      String(data.status) !== existing.status &&
      !body.applicationIds &&
      !body.dependsOnReleaseIds &&
      !body.stakeholderIds;

    const statusDetail = statusOnly
      ? `Status changed to ${String(data.status)}${
          statusOverrideAudit ? ` (${statusOverrideAudit})` : ""
        }`
      : [
          ...auditParts,
          ...(statusOverrideAudit
            ? [`Status override: ${statusOverrideAudit}`]
            : []),
        ].join(" · ");

    await prisma.releaseAuditEvent.create({
      data: {
        releaseId: realId,
        action: statusOnly ? "status_change" : "edit",
        actor: auditActorName(user!),
        detail: statusDetail,
      },
    });
  }

  const updated = await prisma.release.findUnique({ where: { id: realId }, include: releaseInclude });
  const payload = updated;
  if (uxNotices.length > 0) {
    return NextResponse.json(payload, {
      headers: {
        [UX_NOTICE_HEADER]: encodeUxNoticeHeader(uxNotices),
        // Expose custom header to browser JS (same-origin fetch still needs this for read).
        "Access-Control-Expose-Headers": UX_NOTICE_HEADER,
      },
    });
  }
  return NextResponse.json(payload);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireRole("editor");
  if (error) return error;
  await prisma.release.delete({ where: { id: (await prisma.release.findFirst({ where: { OR: [{ id }, { releaseCode: id }] } }))?.id ?? id } });
  return NextResponse.json({ ok: true });
}
