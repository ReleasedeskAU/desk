/**
 * Approval Queue create path: validate, resolve lifecycle decision, persist.
 * Auth stays on the route (requireRole editor+). This module never logs PII.
 */
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { jsonError } from "@/lib/api-errors";
import { prisma } from "@/lib/prisma";
import {
  createApprovalRow,
  type CreateApprovalInput as ApprovalRowInsert,
} from "@/lib/org-compat";
import {
  createApprovalSchema,
  type CreateApprovalInput,
} from "@/lib/validation/approval";
import { loadApprovalLifecycleConfig } from "@/lib/approval-lifecycle-config-db";
import type { ApprovalLifecycleConfig } from "@/lib/approval-lifecycle-config";
import { resolveCreateLifecycleStatus } from "@/lib/entity-lifecycle-create-guard";
import { defaultEntityStatusLabel } from "@/lib/entity-lifecycle-status-ui";
import { resolveApprovalLifecycleStatusRef } from "@/lib/approval-lifecycle-transition";
import {
  guardReleaseFullyLocked,
  loadGuardReleaseConfig,
} from "@/lib/release-related-entity-guards";
import type { ReleaseLifecycleConfig } from "@/lib/release-lifecycle-config";

export type ApprovalCreateResult =
  | { ok: true; row: Awaited<ReturnType<typeof createApprovalRow>> }
  | { ok: false; response: NextResponse };

export type ApprovalCreateRelease = {
  id: string;
  status: string;
  lifecycleConfigVersionId?: string | null;
  department: { name: string };
  applications: { application: { name: string } }[];
};

/**
 * Persistence and lookup seams for create tests. Production uses liveApprovalCreateStore.
 */
export type ApprovalCreateStore = {
  loadConfig: (clerkUserId: string) => Promise<{ config: ApprovalLifecycleConfig }>;
  findRelease: (id: string) => Promise<ApprovalCreateRelease | null>;
  loadReleaseConfig: (
    clerkUserId: string,
    versionId?: string | null
  ) => Promise<ReleaseLifecycleConfig>;
  findApprover: (id: string) => Promise<{ id: string } | null>;
  nextApprovalCode: () => Promise<string>;
  nextSourceOrder: () => Promise<number>;
  persist: (data: ApprovalRowInsert) => ReturnType<typeof createApprovalRow>;
};

/**
 * 400 body for Zod failures — first field message, no stack traces.
 */
export function approvalCreateZodErrorResponse(err: ZodError): NextResponse {
  const issues = err.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
  return NextResponse.json(
    {
      error: issues[0]?.message ?? "Validation failed",
      issues,
    },
    { status: 400 }
  );
}

/**
 * Resolve decision against the caller's lifecycle config (labels are not hardcoded).
 */
export function guardApprovalCreateDecision(
  config: ApprovalLifecycleConfig,
  body: CreateApprovalInput
):
  | { ok: true; decision: string; decisionKey: string }
  | { ok: false; response: NextResponse } {
  const resolved = resolveCreateLifecycleStatus(config, body.decision, "approval");
  if (!resolved.ok) return resolved;
  const defaultDecision = defaultEntityStatusLabel(config);
  // Non-default decisions require a decision date (same rule as the create form).
  if (
    resolved.status.toLocaleLowerCase() !== defaultDecision.toLocaleLowerCase() &&
    !body.decisionDate
  ) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Decision date is required when a decision has been made" },
        { status: 400 }
      ),
    };
  }
  const dest = resolveApprovalLifecycleStatusRef(config, resolved.status);
  if (dest?.requiresConditions && !String(body.conditions ?? "").trim()) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            "This decision needs the conditions written down — the terms this approval is subject to. Add them, then save.",
          code: "CONDITIONS_REQUIRED",
        },
        { status: 400 }
      ),
    };
  }
  return { ok: true, decision: resolved.status, decisionKey: resolved.statusKey };
}

/**
 * Production lookups/persist used by POST /api/approvals.
 */
export function liveApprovalCreateStore(): ApprovalCreateStore {
  return {
    loadConfig: loadApprovalLifecycleConfig,
    findRelease: (id) =>
      prisma.release.findUnique({
        where: { id },
        include: {
          department: { select: { name: true } },
          applications: { include: { application: { select: { name: true } } }, take: 1 },
        },
      }),
    loadReleaseConfig: loadGuardReleaseConfig,
    findApprover: (id) => prisma.user.findUnique({ where: { id }, select: { id: true } }),
    nextApprovalCode,
    nextSourceOrder: async () => {
      const maxOrder = await prisma.approval.aggregate({ _max: { sourceOrder: true } });
      return (maxOrder._max.sourceOrder ?? 0) + 1;
    },
    persist: createApprovalRow,
  };
}

/**
 * Validate a create payload and persist when fields and lifecycle checks pass.
 * @param clerkUserId - Authenticated editor (or higher); used only as a config key.
 * @param rawBody - JSON body from the client.
 * @param store - Override for tests; defaults to Prisma + lifecycle loaders.
 */
export async function createApprovalFromBody(
  clerkUserId: string,
  rawBody: unknown,
  store: ApprovalCreateStore = liveApprovalCreateStore()
): Promise<ApprovalCreateResult> {
  const parsed = createApprovalSchema.safeParse(rawBody);
  if (!parsed.success) {
    return { ok: false, response: approvalCreateZodErrorResponse(parsed.error) };
  }
  const body = parsed.data;

  let config: ApprovalLifecycleConfig;
  try {
    ({ config } = await store.loadConfig(clerkUserId));
  } catch (err) {
    console.error("[approvals-create] lifecycle config load failed", {
      message: err instanceof Error ? err.message : "unknown",
    });
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Approval lifecycle configuration is temporarily unavailable" },
        { status: 503 }
      ),
    };
  }

  const guarded = guardApprovalCreateDecision(config, body);
  if (!guarded.ok) return guarded;

  try {
    return await persistApprovalCreate(clerkUserId, body, guarded, store);
  } catch (err) {
    return {
      ok: false,
      response: jsonError(err, {
        publicMessage: "Failed to create approval",
        status: 500,
        logLabel: "api/approvals POST",
      }),
    };
  }
}

async function persistApprovalCreate(
  clerkUserId: string,
  body: CreateApprovalInput,
  decision: { decision: string; decisionKey: string },
  store: ApprovalCreateStore
): Promise<ApprovalCreateResult> {
  const release = await store.findRelease(body.releaseId);
  if (!release) {
    return { ok: false, response: NextResponse.json({ error: "Release not found" }, { status: 404 }) };
  }
  const releaseConfig = await store.loadReleaseConfig(
    clerkUserId,
    release.lifecycleConfigVersionId
  );
  const cancelledLock = guardReleaseFullyLocked(release.status, releaseConfig);
  if (!cancelledLock.ok) return cancelledLock;
  const approver = await store.findApprover(body.approverId);
  if (!approver) {
    return { ok: false, response: NextResponse.json({ error: "Approver not found" }, { status: 404 }) };
  }

  const row = await store.persist({
    approvalCode: await store.nextApprovalCode(),
    releaseId: body.releaseId,
    applicationName: release.applications[0]?.application.name ?? null,
    departmentName: release.department.name,
    approvalType: body.approvalType,
    approverId: body.approverId,
    submittedDate: new Date(body.submittedDate),
    decisionDate: body.decisionDate ? new Date(body.decisionDate) : null,
    decision: decision.decision,
    decisionKey: decision.decisionKey,
    comments: body.comments ?? null,
    conditions: body.conditions ?? null,
    cabMeetingId: body.cabMeetingId ?? null,
    sourceOrder: await store.nextSourceOrder(),
  });
  return { ok: true, row };
}

async function nextApprovalCode(): Promise<string> {
  const rows = await prisma.approval.findMany({ select: { approvalCode: true } });
  const max = rows.reduce((current, row) => {
    const match = /^APR-(\d+)$/i.exec(row.approvalCode);
    return match ? Math.max(current, Number(match[1])) : current;
  }, 0);
  return `APR-${String(max + 1).padStart(4, "0")}`;
}
