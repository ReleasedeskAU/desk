/**
 * Native scope persistence. Separate from Release PATCH so VR-21 / CAB
 * snapshot / sign-offs / applicationIds are never touched here.
 */
import type { Prisma } from "@releasedesk/database";
import { prisma } from "@/lib/prisma";
import { auditActorName } from "@/lib/release-audit";
import type { SessionUser } from "@/lib/auth/roles";
import {
  assignmentPickerOptions,
  computeReleaseSeats,
  isReleaseSeatWriteLocked,
  type DirectoryUserRef,
  type SeatDecision,
} from "@/lib/release-seats";
import {
  scopeSectionCapabilities,
  type ScopeSectionCapabilities,
} from "@/lib/release-scope-permissions";
import {
  SCOPE_STATUS_APPROVED,
  SCOPE_STATUS_DRAFT,
  isScopeApproved,
  isScopeApprovalDueOverdue,
  isScopeDraft,
  scopeStatusLabel,
  type ScopeSectionConfig,
} from "@/lib/release-scope-status";

const HISTORY_INCLUDE = { orderBy: { createdAt: "asc" as const } };
const FILE_SELECT = {
  id: true,
  originalName: true,
  mimeType: true,
  byteSize: true,
  uploadedByName: true,
  createdAt: true,
} as const;
const GRANT_SELECT = {
  id: true,
  granteeUserId: true,
  grantedByUserId: true,
  createdAt: true,
} as const;

export const SCOPE_INCLUDE = {
  history: HISTORY_INCLUDE,
  attachments: { orderBy: { createdAt: "asc" as const }, select: FILE_SELECT },
  grants: { orderBy: { createdAt: "asc" as const }, select: GRANT_SELECT },
  changeRequests: {
    orderBy: { createdAt: "desc" as const },
    include: {
      history: HISTORY_INCLUDE,
      attachments: { orderBy: { createdAt: "asc" as const }, select: FILE_SELECT },
      grants: { orderBy: { createdAt: "asc" as const }, select: GRANT_SELECT },
    },
  },
} satisfies Prisma.ReleaseScopeInclude;

export type LoadedScope = Prisma.ReleaseScopeGetPayload<{ include: typeof SCOPE_INCLUDE }>;

/**
 * Create a draft scope row when missing. Existing free-text stays on the release.
 *
 * @param releaseId - Release primary key.
 */
export async function ensureReleaseScope(releaseId: string): Promise<LoadedScope> {
  const existing = await prisma.releaseScope.findUnique({
    where: { releaseId },
    include: SCOPE_INCLUDE,
  });
  if (existing) return existing;
  try {
    return await prisma.releaseScope.create({
      data: { releaseId, statusKey: SCOPE_STATUS_DRAFT },
      include: SCOPE_INCLUDE,
    });
  } catch (err) {
    // Concurrent first-read: another request inserted the unique releaseId.
    const raced = await prisma.releaseScope.findUnique({
      where: { releaseId },
      include: SCOPE_INCLUDE,
    });
    if (raced) return raced;
    throw err;
  }
}

/**
 * Build the seat decision for this release and session.
 *
 * @param args - Session, directory user, release FKs, lifecycle lock.
 */
export function seatsForRelease(args: {
  session: SessionUser;
  directoryUser: DirectoryUserRef | null;
  releaseOwnerId: string | null | undefined;
  releaseManagerId: string | null | undefined;
  writeLocked: boolean;
}): SeatDecision {
  return computeReleaseSeats({
    session: args.session,
    directoryUser: args.directoryUser,
    seats: {
      releaseOwnerId: args.releaseOwnerId,
      releaseManagerId: args.releaseManagerId,
    },
    writeLocked: args.writeLocked,
  });
}

export type ReleaseScopeCapabilities = {
  canEditRelease: boolean;
  canAssignOwner: boolean;
  canAssignManagerSelf: boolean;
  canAssignManagerAny: boolean;
  scope: ScopeSectionCapabilities;
  changeRequests: Record<string, ScopeSectionCapabilities>;
};

/**
 * Page capabilities. createdBy / previous / title / page access grant nothing.
 *
 * @param decision - Seat decision.
 * @param scope - Loaded scope (or null before ensure).
 */
export function buildScopeCapabilities(
  decision: SeatDecision,
  scope: LoadedScope | null
): ReleaseScopeCapabilities {
  const seatEdit = decision.holdsSeat && !decision.writeLocked;
  const scopeCaps = scope
    ? scopeSectionCapabilities(decision, {
        kind: "scope",
        statusKey: scope.statusKey,
        granteeUserIds: scope.grants.map((g) => g.granteeUserId),
      })
    : scopeSectionCapabilities(decision, {
        kind: "scope",
        statusKey: SCOPE_STATUS_DRAFT,
        granteeUserIds: [],
      });
  const changeRequests: Record<string, ScopeSectionCapabilities> = {};
  if (scope) {
    for (const req of scope.changeRequests) {
      changeRequests[req.id] = scopeSectionCapabilities(decision, {
        kind: "change_request",
        statusKey: req.statusKey,
        granteeUserIds: req.grants.map((g) => g.granteeUserId),
      });
    }
  }
  return {
    canEditRelease: seatEdit,
    canAssignOwner: seatEdit,
    canAssignManagerSelf: !decision.writeLocked && (seatEdit || decision.isExactEditor),
    canAssignManagerAny: seatEdit,
    scope: scopeCaps,
    changeRequests,
  };
}

export type ScopeClientPayload = {
  id: string;
  statusKey: string;
  statusLabel: string;
  approvalDueAt: Date | null;
  approvalDueOverdue: boolean;
  approvalDueRequired: boolean;
  approvedAt: Date | null;
  approvedByName: string | null;
  lockVersion: number;
  description: string;
  history: LoadedScope["history"];
  attachments: LoadedScope["attachments"];
  grants: LoadedScope["grants"];
  changeRequests: Array<{
    id: string;
    statusKey: string;
    statusLabel: string;
    proposedText: string;
    approvalWhy: string | null;
    approvedAt: Date | null;
    approvedByName: string | null;
    lockVersion: number;
    createdAt: Date;
    history: LoadedScope["changeRequests"][number]["history"];
    attachments: LoadedScope["changeRequests"][number]["attachments"];
    grants: LoadedScope["changeRequests"][number]["grants"];
    capabilities: ScopeSectionCapabilities;
  }>;
};

/**
 * Shape the scope for the release page. Change requests stay hidden until
 * scope is approved (empty list). Newest first already from the query.
 *
 * @param scope - Loaded scope.
 * @param description - Current Release.scopeDescription.
 * @param config - Tenant labels / due rule.
 * @param capabilities - Per-section capabilities.
 * @param now - Clock for overdue warning.
 */
export function toScopeClientPayload(
  scope: LoadedScope,
  description: string | null | undefined,
  config: ScopeSectionConfig,
  capabilities: ReleaseScopeCapabilities,
  now = new Date()
): ScopeClientPayload {
  const approved = isScopeApproved(scope.statusKey);
  const changeRequests = approved
    ? scope.changeRequests.map((req) => ({
        id: req.id,
        statusKey: req.statusKey,
        statusLabel: scopeStatusLabel(config, req.statusKey),
        proposedText: req.proposedText ?? "",
        approvalWhy: req.approvalWhy,
        approvedAt: req.approvedAt,
        approvedByName: req.approvedByName,
        lockVersion: req.lockVersion,
        createdAt: req.createdAt,
        history: req.history,
        attachments: req.attachments,
        grants: req.grants,
        capabilities: capabilities.changeRequests[req.id] ?? {
          canEditDescription: false,
          canAddAttachments: false,
          canApprove: false,
          canAddGrant: false,
          canRemoveGrant: false,
          canStartChangeRequest: false,
          grantHint: null,
        },
      }))
    : [];
  return {
    id: scope.id,
    statusKey: scope.statusKey,
    statusLabel: scopeStatusLabel(config, scope.statusKey),
    approvalDueAt: scope.approvalDueAt,
    approvalDueOverdue: isScopeApprovalDueOverdue({
      dueAt: scope.approvalDueAt,
      statusKey: scope.statusKey,
      now,
    }),
    approvalDueRequired: config.approvalDueRequired,
    approvedAt: scope.approvedAt,
    approvedByName: scope.approvedByName,
    lockVersion: scope.lockVersion,
    description: description ?? "",
    history: scope.history,
    attachments: scope.attachments,
    grants: scope.grants,
    changeRequests,
  };
}

export type ActorSnap = {
  userId: string;
  name: string;
};

/**
 * Session actor snapshot written once onto history / approve rows.
 *
 * @param session - Authenticated session.
 * @param directoryUserId - Directory id when provisioned.
 */
export function actorSnapshot(session: SessionUser, directoryUserId: string | null): ActorSnap {
  return {
    userId: directoryUserId ?? session.id,
    name: auditActorName(session),
  };
}

/**
 * Write draft scope text + optional due date. Increments lockVersion so a
 * concurrent approve cannot record a different text than the lock.
 *
 * @param args - Scope id, expected version, next values, actor.
 */
export async function updateDraftScope(args: {
  scopeId: string;
  releaseId: string;
  expectedLockVersion: number;
  description: string;
  approvalDueAt: Date | null | undefined;
  actor: ActorSnap;
}): Promise<{ ok: true; scope: LoadedScope } | { ok: false; code: string; error: string }> {
  const current = await prisma.releaseScope.findUnique({
    where: { id: args.scopeId },
    include: { release: { select: { scopeDescription: true } } },
  });
  if (!current) return { ok: false, code: "NOT_FOUND", error: "Scope was not found." };
  if (!isScopeDraft(current.statusKey)) {
    return { ok: false, code: "SCOPE_LOCKED", error: "Approved scope cannot be edited." };
  }
  if (current.lockVersion !== args.expectedLockVersion) {
    return {
      ok: false,
      code: "SCOPE_CONFLICT",
      error: "This scope was updated by someone else. Refresh and try again.",
    };
  }

  const before = current.release.scopeDescription ?? "";
  const after = args.description;
  const dueProvided = args.approvalDueAt !== undefined;

  const updated = await prisma.$transaction(async (tx) => {
    const bumped = await tx.releaseScope.updateMany({
      where: {
        id: args.scopeId,
        statusKey: SCOPE_STATUS_DRAFT,
        lockVersion: args.expectedLockVersion,
      },
      data: {
        lockVersion: { increment: 1 },
        ...(dueProvided ? { approvalDueAt: args.approvalDueAt } : {}),
      },
    });
    if (bumped.count !== 1) return null;
    if (before !== after) {
      await tx.release.update({
        where: { id: args.releaseId },
        data: { scopeDescription: after },
      });
      await tx.releaseScopeHistory.create({
        data: {
          scopeId: args.scopeId,
          actorUserId: args.actor.userId,
          actorName: args.actor.name,
          beforeText: before,
          afterText: after,
        },
      });
    }
    return tx.releaseScope.findUniqueOrThrow({
      where: { id: args.scopeId },
      include: SCOPE_INCLUDE,
    });
  });

  if (!updated) {
    return {
      ok: false,
      code: "SCOPE_CONFLICT",
      error: "This scope was updated by someone else. Refresh and try again.",
    };
  }
  return { ok: true, scope: updated };
}

/**
 * First scope approve. No why. Records current stored text + session actor.
 * Same transaction locks description (already stored), due date, attachments,
 * and grants by flipping statusKey.
 *
 * @param args - Scope, expected version, actor, due-required rule.
 */
export async function approveDraftScope(args: {
  scopeId: string;
  releaseId: string;
  expectedLockVersion: number;
  actor: ActorSnap;
  approvalDueRequired: boolean;
}): Promise<{ ok: true; scope: LoadedScope } | { ok: false; code: string; error: string }> {
  const current = await prisma.releaseScope.findUnique({
    where: { id: args.scopeId },
    include: { release: { select: { scopeDescription: true } } },
  });
  if (!current) return { ok: false, code: "NOT_FOUND", error: "Scope was not found." };
  if (!isScopeDraft(current.statusKey)) {
    return { ok: false, code: "SCOPE_LOCKED", error: "Scope is already approved." };
  }
  if (current.lockVersion !== args.expectedLockVersion) {
    return {
      ok: false,
      code: "SCOPE_CONFLICT",
      error: "This scope was updated by someone else. Refresh and try again.",
    };
  }
  if (args.approvalDueRequired && !current.approvalDueAt) {
    return {
      ok: false,
      code: "SCOPE_DUE_REQUIRED",
      error: "A scope-approval due date is required before approval.",
    };
  }

  const recorded = current.release.scopeDescription ?? "";
  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const bumped = await tx.releaseScope.updateMany({
      where: {
        id: args.scopeId,
        statusKey: SCOPE_STATUS_DRAFT,
        lockVersion: args.expectedLockVersion,
      },
      data: {
        statusKey: SCOPE_STATUS_APPROVED,
        approvedAt: now,
        approvedByUserId: args.actor.userId,
        approvedByName: args.actor.name,
        lockVersion: { increment: 1 },
      },
    });
    if (bumped.count !== 1) return null;
    await tx.releaseScopeHistory.create({
      data: {
        scopeId: args.scopeId,
        actorUserId: args.actor.userId,
        actorName: args.actor.name,
        beforeText: recorded,
        afterText: recorded,
      },
    });
    return tx.releaseScope.findUniqueOrThrow({
      where: { id: args.scopeId },
      include: SCOPE_INCLUDE,
    });
  });

  if (!updated) {
    return {
      ok: false,
      code: "SCOPE_CONFLICT",
      error: "This scope was updated by someone else. Refresh and try again.",
    };
  }
  return { ok: true, scope: updated };
}

/**
 * Start one draft change request. Hidden until scope is approved.
 *
 * @param args - Scope + actor.
 */
export async function createScopeChangeRequest(args: {
  scopeId: string;
  actor: ActorSnap;
}): Promise<
  | { ok: true; requestId: string }
  | { ok: false; code: string; error: string }
> {
  const scope = await prisma.releaseScope.findUnique({
    where: { id: args.scopeId },
    include: { changeRequests: { select: { statusKey: true } } },
  });
  if (!scope) return { ok: false, code: "NOT_FOUND", error: "Scope was not found." };
  if (!isScopeApproved(scope.statusKey)) {
    return {
      ok: false,
      code: "SCOPE_NOT_APPROVED",
      error: "A change request can be started only after scope is approved.",
    };
  }
  if (scope.changeRequests.some((r) => isScopeDraft(r.statusKey))) {
    return {
      ok: false,
      code: "SCOPE_DRAFT_REQUEST_EXISTS",
      error: "Only one draft scope-change request is allowed at a time.",
    };
  }
  try {
    const created = await prisma.releaseScopeChangeRequest.create({
      data: { scopeId: args.scopeId, statusKey: SCOPE_STATUS_DRAFT, proposedText: "" },
      select: { id: true },
    });
    return { ok: true, requestId: created.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message.includes("ReleaseScopeChangeRequest_one_draft") || message.includes("Unique")) {
      return {
        ok: false,
        code: "SCOPE_DRAFT_REQUEST_EXISTS",
        error: "Only one draft scope-change request is allowed at a time.",
      };
    }
    throw err;
  }
}

/**
 * Edit draft change-request text and/or why. Proposed text does not write
 * scopeDescription until approve.
 */
export async function updateDraftChangeRequest(args: {
  requestId: string;
  expectedLockVersion: number;
  proposedText?: string;
  approvalWhy?: string | null;
  actor: ActorSnap;
}): Promise<{ ok: true } | { ok: false; code: string; error: string }> {
  const current = await prisma.releaseScopeChangeRequest.findUnique({
    where: { id: args.requestId },
  });
  if (!current) return { ok: false, code: "NOT_FOUND", error: "Change request was not found." };
  if (!isScopeDraft(current.statusKey)) {
    return { ok: false, code: "SCOPE_LOCKED", error: "Approved change requests cannot be edited." };
  }
  if (current.lockVersion !== args.expectedLockVersion) {
    return {
      ok: false,
      code: "SCOPE_CONFLICT",
      error: "This change request was updated by someone else. Refresh and try again.",
    };
  }

  const textChanging = args.proposedText !== undefined && args.proposedText !== (current.proposedText ?? "");
  const updated = await prisma.$transaction(async (tx) => {
    const bumped = await tx.releaseScopeChangeRequest.updateMany({
      where: {
        id: args.requestId,
        statusKey: SCOPE_STATUS_DRAFT,
        lockVersion: args.expectedLockVersion,
      },
      data: {
        lockVersion: { increment: 1 },
        ...(args.proposedText !== undefined ? { proposedText: args.proposedText } : {}),
        ...(args.approvalWhy !== undefined ? { approvalWhy: args.approvalWhy } : {}),
      },
    });
    if (bumped.count !== 1) return false;
    if (textChanging) {
      await tx.releaseScopeChangeHistory.create({
        data: {
          changeRequestId: args.requestId,
          actorUserId: args.actor.userId,
          actorName: args.actor.name,
          beforeText: current.proposedText ?? "",
          afterText: args.proposedText ?? "",
        },
      });
    }
    return true;
  });
  if (!updated) {
    return {
      ok: false,
      code: "SCOPE_CONFLICT",
      error: "This change request was updated by someone else. Refresh and try again.",
    };
  }
  return { ok: true };
}

/**
 * Approve write must match both the request and the scope it belongs to.
 * A missed capability check must not be able to write another release’s text.
 *
 * @param input.requestId - Change request id.
 * @param input.scopeId - Scope that owns the request.
 * @param input.lockVersion - Expected lock version.
 */
export function scopeChangeRequestApproveWhere(input: {
  requestId: string;
  scopeId: string;
  lockVersion: number;
}): Prisma.ReleaseScopeChangeRequestWhereInput {
  return {
    id: input.requestId,
    scopeId: input.scopeId,
    statusKey: SCOPE_STATUS_DRAFT,
    lockVersion: input.lockVersion,
  };
}

/**
 * Approve a change request: require saved why, write text onto current scope,
 * append scope history. Does not touch cabScopeSnapshot, CAB, or copy files.
 */

export async function approveScopeChangeRequest(args: {
  requestId: string;
  releaseId: string;
  scopeId: string;
  expectedLockVersion: number;
  actor: ActorSnap;
}): Promise<{ ok: true } | { ok: false; code: string; error: string }> {
  const current = await prisma.releaseScopeChangeRequest.findFirst({
    where: { id: args.requestId, scopeId: args.scopeId },
  });
  if (!current) return { ok: false, code: "NOT_FOUND", error: "Change request was not found." };
  if (!isScopeDraft(current.statusKey)) {
    return { ok: false, code: "SCOPE_LOCKED", error: "Change request is already approved." };
  }
  if (current.lockVersion !== args.expectedLockVersion) {
    return {
      ok: false,
      code: "SCOPE_CONFLICT",
      error: "This change request was updated by someone else. Refresh and try again.",
    };
  }
  const why = (current.approvalWhy ?? "").trim();
  if (!why) {
    return {
      ok: false,
      code: "SCOPE_CHANGE_WHY_REQUIRED",
      error: "Save a reason before approving this change request.",
    };
  }

  const release = await prisma.release.findUnique({
    where: { id: args.releaseId },
    select: { scopeDescription: true },
  });
  if (!release) return { ok: false, code: "NOT_FOUND", error: "Release was not found." };
  const before = release.scopeDescription ?? "";
  const after = current.proposedText ?? "";
  const now = new Date();

  const ok = await prisma.$transaction(async (tx) => {
    const bumped = await tx.releaseScopeChangeRequest.updateMany({
      where: scopeChangeRequestApproveWhere({
        requestId: args.requestId,
        scopeId: args.scopeId,
        lockVersion: args.expectedLockVersion,
      }),
      data: {
        statusKey: SCOPE_STATUS_APPROVED,
        approvedAt: now,
        approvedByUserId: args.actor.userId,
        approvedByName: args.actor.name,
        lockVersion: { increment: 1 },
      },
    });
    if (bumped.count !== 1) return false;
    await tx.release.update({
      where: { id: args.releaseId },
      data: { scopeDescription: after },
    });
    await tx.releaseScopeHistory.create({
      data: {
        scopeId: args.scopeId,
        actorUserId: args.actor.userId,
        actorName: args.actor.name,
        beforeText: before,
        afterText: after,
      },
    });
    return true;
  });

  if (!ok) {
    return {
      ok: false,
      code: "SCOPE_CONFLICT",
      error: "This change request was updated by someone else. Refresh and try again.",
    };
  }
  return { ok: true };
}

/**
 * Lifecycle write-lock helper used by routes.
 *
 * @param config - Caller lifecycle config.
 * @param status - Release status.
 */
export function releaseScopeWritesLocked(
  config: Parameters<typeof isReleaseSeatWriteLocked>[0],
  status: string
): boolean {
  return isReleaseSeatWriteLocked(config, status);
}

/**
 * Assignment picker payload (exact editors vs any directory user).
 * Labels are directory names — never free-typed.
 *
 * @param users - Same-tenant directory users.
 */
export function pickerPayload(users: DirectoryUserRef[]) {
  const { managers, owners } = assignmentPickerOptions(users);
  const toOption = (u: DirectoryUserRef) => ({
    id: u.id,
    label: u.userId ? `${u.userId} — ${u.name}` : u.name,
    name: u.name,
  });
  return {
    managers: managers.map(toOption),
    owners: owners.map(toOption),
  };
}
