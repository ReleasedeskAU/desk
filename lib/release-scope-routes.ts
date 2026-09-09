/**
 * HTTP handlers for native scope / change-request writes.
 * No Jira, no CAB snapshot, no applicationIds.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { listDirectoryUsersForAssignment } from "@/lib/release-directory-user";
import {
  loadScopeRouteContext,
  routeActor,
  scopeDenied,
  sessionTenantKey,
} from "@/lib/release-scope-http";
import {
  approveDraftScope,
  approveScopeChangeRequest,
  buildScopeCapabilities,
  createScopeChangeRequest,
  ensureReleaseScope,
  toScopeClientPayload,
  updateDraftChangeRequest,
  updateDraftScope,
} from "@/lib/release-scope-service";
import {
  SCOPE_ATTACHMENT_MAX_BYTES,
  safeAttachmentDownloadName,
  validateScopeAttachment,
} from "@/lib/release-scope-attachments";
import { canGrantDraftSection } from "@/lib/release-scope-permissions";
import { isAssignableScopeSectionEditor } from "@/lib/release-seats";
import { isScopeDraft } from "@/lib/release-scope-status";
import { readScopeFile, writeScopeFile } from "@/lib/release-scope-files";
import { auditActorName } from "@/lib/release-audit";

const draftScopeSchema = z
  .object({
    description: z.string().max(20000).optional(),
    approvalDueAt: z.union([z.string(), z.null()]).optional(),
    lockVersion: z.number().int().nonnegative(),
  })
  .strict();

const draftRequestSchema = z
  .object({
    proposedText: z.string().max(20000).optional(),
    approvalWhy: z.union([z.string().max(4000), z.null()]).optional(),
    lockVersion: z.number().int().nonnegative(),
  })
  .strict();

const grantSchema = z
  .object({
    granteeUserId: z.string().trim().min(1).max(64),
  })
  .strict();

const approveSchema = z
  .object({
    lockVersion: z.number().int().nonnegative(),
  })
  .strict();

function parseDue(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

async function scopeJson(
  releaseId: string,
  description: string | null,
  ctx: Awaited<ReturnType<typeof loadScopeRouteContext>> & { ok: true }
) {
  const scope = await ensureReleaseScope(releaseId);
  const capabilities = buildScopeCapabilities(ctx.decision, scope);
  return {
    scope: toScopeClientPayload(scope, description, ctx.config, capabilities),
    capabilities,
  };
}

/**
 * PATCH draft scope description / due date. Does not touch CAB or applications.
 */
export async function handlePatchScope(req: Request, idParam: string): Promise<NextResponse> {
  const ctx = await loadScopeRouteContext(idParam);
  if (!ctx.ok) return ctx.response;
  const caps = buildScopeCapabilities(ctx.decision, ctx.scope);
  if (!caps.scope.canEditDescription) {
    return scopeDenied(403, "You cannot edit this scope.", "SCOPE_EDIT_DENIED");
  }
  const parsed = draftScopeSchema.safeParse(await req.json());
  if (!parsed.success) {
    return scopeDenied(400, "Invalid scope update.", "VALIDATION_FAILED");
  }
  const due = parseDue(parsed.data.approvalDueAt);
  if (parsed.data.approvalDueAt !== undefined && parsed.data.approvalDueAt !== null && due === undefined) {
    return scopeDenied(400, "Scope-approval due date is not a valid date.", "INVALID_DUE_DATE");
  }
  const result = await updateDraftScope({
    scopeId: ctx.scope.id,
    releaseId: ctx.release.id,
    expectedLockVersion: parsed.data.lockVersion,
    description: parsed.data.description ?? ctx.release.scopeDescription ?? "",
    approvalDueAt: due,
    actor: routeActor(ctx.user, ctx.directoryUser),
  });
  if (!result.ok) return scopeDenied(result.code === "SCOPE_CONFLICT" ? 409 : 400, result.error, result.code);
  const body = await scopeJson(ctx.release.id, ctx.release.scopeDescription, ctx);
  const latest = await prisma.release.findUnique({
    where: { id: ctx.release.id },
    select: { scopeDescription: true },
  });
  return NextResponse.json({
    ...body,
    scope: toScopeClientPayload(
      result.scope,
      latest?.scopeDescription ?? parsed.data.description ?? "",
      ctx.config,
      body.capabilities
    ),
  });
}

/**
 * First scope approve — no why.
 */
export async function handleApproveScope(req: Request, idParam: string): Promise<NextResponse> {
  const ctx = await loadScopeRouteContext(idParam);
  if (!ctx.ok) return ctx.response;
  const caps = buildScopeCapabilities(ctx.decision, ctx.scope);
  if (!caps.scope.canApprove) {
    return scopeDenied(403, "You cannot approve this scope.", "SCOPE_APPROVE_DENIED");
  }
  const parsed = approveSchema.safeParse(await req.json());
  if (!parsed.success) {
    return scopeDenied(400, "Invalid approve request.", "VALIDATION_FAILED");
  }
  const result = await approveDraftScope({
    scopeId: ctx.scope.id,
    releaseId: ctx.release.id,
    expectedLockVersion: parsed.data.lockVersion,
    actor: routeActor(ctx.user, ctx.directoryUser),
    approvalDueRequired: ctx.config.approvalDueRequired,
  });
  if (!result.ok) return scopeDenied(result.code === "SCOPE_CONFLICT" ? 409 : 400, result.error, result.code);
  const latest = await prisma.release.findUnique({
    where: { id: ctx.release.id },
    select: { scopeDescription: true },
  });
  const capabilities = buildScopeCapabilities(ctx.decision, result.scope);
  return NextResponse.json({
    scope: toScopeClientPayload(
      result.scope,
      latest?.scopeDescription ?? "",
      ctx.config,
      capabilities
    ),
    capabilities,
  });
}

/**
 * Create the single draft change request.
 */
export async function handleCreateChangeRequest(idParam: string): Promise<NextResponse> {
  const ctx = await loadScopeRouteContext(idParam);
  if (!ctx.ok) return ctx.response;
  const caps = buildScopeCapabilities(ctx.decision, ctx.scope);
  if (!caps.scope.canStartChangeRequest) {
    return scopeDenied(403, "You cannot start a scope-change request.", "SCOPE_REQUEST_DENIED");
  }
  const result = await createScopeChangeRequest({
    scopeId: ctx.scope.id,
    actor: routeActor(ctx.user, ctx.directoryUser),
  });
  if (!result.ok) return scopeDenied(409, result.error, result.code);
  const payload = await scopeJson(ctx.release.id, ctx.release.scopeDescription, ctx);
  return NextResponse.json({ ...payload, requestId: result.requestId }, { status: 201 });
}

/**
 * PATCH draft change request (proposed text / why).
 */
export async function handlePatchChangeRequest(
  req: Request,
  idParam: string,
  requestId: string
): Promise<NextResponse> {
  const ctx = await loadScopeRouteContext(idParam);
  if (!ctx.ok) return ctx.response;
  const caps = buildScopeCapabilities(ctx.decision, ctx.scope);
  const section = caps.changeRequests[requestId];
  if (!section?.canEditDescription) {
    return scopeDenied(403, "You cannot edit this change request.", "SCOPE_EDIT_DENIED");
  }
  const parsed = draftRequestSchema.safeParse(await req.json());
  if (!parsed.success) {
    return scopeDenied(400, "Invalid change-request update.", "VALIDATION_FAILED");
  }
  const result = await updateDraftChangeRequest({
    requestId,
    expectedLockVersion: parsed.data.lockVersion,
    proposedText: parsed.data.proposedText,
    approvalWhy: parsed.data.approvalWhy,
    actor: routeActor(ctx.user, ctx.directoryUser),
  });
  if (!result.ok) return scopeDenied(result.code === "SCOPE_CONFLICT" ? 409 : 400, result.error, result.code);
  return NextResponse.json(await scopeJson(ctx.release.id, ctx.release.scopeDescription, ctx));
}

/**
 * Approve change request — why must already be saved. Does not clear VR-21.
 */
export async function handleApproveChangeRequest(
  req: Request,
  idParam: string,
  requestId: string
): Promise<NextResponse> {
  const ctx = await loadScopeRouteContext(idParam);
  if (!ctx.ok) return ctx.response;
  const caps = buildScopeCapabilities(ctx.decision, ctx.scope);
  if (!caps.changeRequests[requestId]?.canApprove) {
    return scopeDenied(403, "You cannot approve this change request.", "SCOPE_APPROVE_DENIED");
  }
  const parsed = approveSchema.safeParse(await req.json());
  if (!parsed.success) {
    return scopeDenied(400, "Invalid approve request.", "VALIDATION_FAILED");
  }
  const result = await approveScopeChangeRequest({
    requestId,
    releaseId: ctx.release.id,
    scopeId: ctx.scope.id,
    expectedLockVersion: parsed.data.lockVersion,
    actor: routeActor(ctx.user, ctx.directoryUser),
  });
  if (!result.ok) {
    const status = result.code === "SCOPE_CHANGE_WHY_REQUIRED" ? 400 : result.code === "SCOPE_CONFLICT" ? 409 : 400;
    return scopeDenied(status, result.error, result.code);
  }
  const latest = await prisma.release.findUnique({
    where: { id: ctx.release.id },
    select: { scopeDescription: true },
  });
  return NextResponse.json(await scopeJson(ctx.release.id, latest?.scopeDescription ?? "", ctx));
}

async function persistAttachment(args: {
  idParam: string;
  requestId?: string;
  formData: FormData;
}): Promise<NextResponse> {
  const ctx = await loadScopeRouteContext(args.idParam);
  if (!ctx.ok) return ctx.response;
  const caps = buildScopeCapabilities(ctx.decision, ctx.scope);
  const canAdd = args.requestId
    ? Boolean(caps.changeRequests[args.requestId]?.canAddAttachments)
    : caps.scope.canAddAttachments;
  if (!canAdd) {
    return scopeDenied(403, "You cannot add attachments to this section.", "SCOPE_ATTACH_DENIED");
  }
  if (args.requestId) {
    const reqRow = ctx.scope.changeRequests.find((r) => r.id === args.requestId);
    if (!reqRow || !isScopeDraft(reqRow.statusKey)) {
      return scopeDenied(409, "Attachments can only be added while the section is draft.", "SCOPE_LOCKED");
    }
  } else if (!isScopeDraft(ctx.scope.statusKey)) {
    return scopeDenied(409, "Attachments can only be added while the section is draft.", "SCOPE_LOCKED");
  }

  const file = args.formData.get("file");
  if (!(file instanceof File)) {
    return scopeDenied(400, "A file is required.", "VALIDATION_FAILED");
  }
  if (file.size > SCOPE_ATTACHMENT_MAX_BYTES) {
    return scopeDenied(400, "File is too large. Maximum size is 10 MB.", "FILE_TOO_LARGE");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const validated = validateScopeAttachment(file.name, bytes);
  if (!validated.ok) {
    return scopeDenied(400, validated.error, "FILE_TYPE_DENIED");
  }

  const tenantKey = await sessionTenantKey();
  const stored = await writeScopeFile(tenantKey, bytes);
  const actor = routeActor(ctx.user, ctx.directoryUser);
  await prisma.releaseScopeFile.create({
    data: {
      id: stored.fileId,
      tenantKey,
      storageKey: stored.storageKey,
      originalName: safeAttachmentDownloadName(file.name),
      mimeType: validated.mimeType,
      byteSize: bytes.byteLength,
      uploadedByUserId: actor.userId,
      uploadedByName: actor.name,
      scopeId: args.requestId ? null : ctx.scope.id,
      changeRequestId: args.requestId ?? null,
    },
  });
  return NextResponse.json(await scopeJson(ctx.release.id, ctx.release.scopeDescription, ctx), {
    status: 201,
  });
}

/**
 * Add a scope attachment (append-only).
 */
export async function handleAddScopeAttachment(req: Request, idParam: string): Promise<NextResponse> {
  return persistAttachment({ idParam, formData: await req.formData() });
}

/**
 * Add a change-request attachment (stays on the request).
 */
export async function handleAddRequestAttachment(
  req: Request,
  idParam: string,
  requestId: string
): Promise<NextResponse> {
  return persistAttachment({ idParam, requestId, formData: await req.formData() });
}

/**
 * Download an attachment after tenant + membership check.
 */
export async function handleDownloadAttachment(args: {
  idParam: string;
  fileId: string;
  requestId?: string;
}): Promise<NextResponse> {
  const ctx = await loadScopeRouteContext(args.idParam);
  if (!ctx.ok) return ctx.response;
  const tenantKey = await sessionTenantKey();
  const row = await prisma.releaseScopeFile.findFirst({
    where: {
      id: args.fileId,
      tenantKey,
      ...(args.requestId
        ? { changeRequestId: args.requestId }
        : { scopeId: ctx.scope.id, changeRequestId: null }),
    },
  });
  if (!row) {
    return scopeDenied(404, "Attachment was not found.", "NOT_FOUND");
  }
  try {
    const bytes = await readScopeFile(row.storageKey, tenantKey);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": row.mimeType,
        "Content-Disposition": `attachment; filename="${safeAttachmentDownloadName(row.originalName)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("[scope-file] read failed", {
      fileId: row.id,
      message: err instanceof Error ? err.message : "unknown",
    });
    return scopeDenied(404, "Attachment was not found.", "NOT_FOUND");
  }
}

async function addGrant(args: {
  idParam: string;
  requestId?: string;
  granteeUserId: string;
}): Promise<NextResponse> {
  const ctx = await loadScopeRouteContext(args.idParam);
  if (!ctx.ok) return ctx.response;
  const statusKey = args.requestId
    ? ctx.scope.changeRequests.find((r) => r.id === args.requestId)?.statusKey
    : ctx.scope.statusKey;
  if (!statusKey || !canGrantDraftSection(ctx.decision, statusKey)) {
    return scopeDenied(403, "You cannot add people to this section.", "SCOPE_GRANT_DENIED");
  }
  const users = await listDirectoryUsersForAssignment();
  const grantee = users.find((u) => u.id === args.granteeUserId);
  // Section editor = any existing same-tenant user, not account-role editors only.
  if (!grantee || !isAssignableScopeSectionEditor(grantee)) {
    return scopeDenied(400, "Choose an existing Release Desk user.", "INVALID_GRANTEE");
  }
  if (grantee.id === ctx.directoryUser?.id) {
    return scopeDenied(400, "You already have access to this section.", "INVALID_GRANTEE");
  }
  const existing = await prisma.releaseScopeSectionGrant.findFirst({
    where: args.requestId
      ? { changeRequestId: args.requestId, granteeUserId: grantee.id }
      : { scopeId: ctx.scope.id, granteeUserId: grantee.id, changeRequestId: null },
  });
  if (!existing) {
    await prisma.releaseScopeSectionGrant.create({
      data: {
        granteeUserId: grantee.id,
        grantedByUserId: ctx.directoryUser?.id ?? ctx.user.id,
        scopeId: args.requestId ? null : ctx.scope.id,
        changeRequestId: args.requestId ?? null,
      },
    });
  }
  return NextResponse.json(await scopeJson(ctx.release.id, ctx.release.scopeDescription, ctx), {
    status: 201,
  });
}

/**
 * Add a draft-section grant.
 */
export async function handleAddGrant(req: Request, idParam: string, requestId?: string): Promise<NextResponse> {
  const parsed = grantSchema.safeParse(await req.json());
  if (!parsed.success) {
    return scopeDenied(400, "Choose an existing Release Desk user.", "VALIDATION_FAILED");
  }
  return addGrant({ idParam, requestId, granteeUserId: parsed.data.granteeUserId });
}

/**
 * Remove a draft-section grant.
 */
export async function handleRemoveGrant(args: {
  idParam: string;
  grantId: string;
  requestId?: string;
}): Promise<NextResponse> {
  const ctx = await loadScopeRouteContext(args.idParam);
  if (!ctx.ok) return ctx.response;
  const statusKey = args.requestId
    ? ctx.scope.changeRequests.find((r) => r.id === args.requestId)?.statusKey
    : ctx.scope.statusKey;
  if (!statusKey || !canGrantDraftSection(ctx.decision, statusKey)) {
    return scopeDenied(403, "You cannot remove people from this section.", "SCOPE_GRANT_DENIED");
  }
  await prisma.releaseScopeSectionGrant.deleteMany({
    where: {
      id: args.grantId,
      ...(args.requestId
        ? { changeRequestId: args.requestId }
        : { scopeId: ctx.scope.id, changeRequestId: null }),
    },
  });
  return NextResponse.json(await scopeJson(ctx.release.id, ctx.release.scopeDescription, ctx));
}

/**
 * Reassignment audit line (release audit log — not scope history).
 */
export async function writeAssignmentAudit(args: {
  releaseId: string;
  field: "releaseManagerId" | "releaseOwnerId";
  actorName: string;
  previousId: string | null;
  nextId: string | null;
}): Promise<void> {
  await prisma.releaseAuditEvent.create({
    data: {
      releaseId: args.releaseId,
      action: args.field === "releaseManagerId" ? "manager_reassign" : "owner_reassign",
      actor: args.actorName,
      detail: `${args.field === "releaseManagerId" ? "Release Manager" : "Release Owner"}: ${
        args.previousId ?? "(none)"
      } → ${args.nextId ?? "(none)"}`,
    },
  });
}

export { auditActorName };
