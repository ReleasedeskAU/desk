/**
 * Server-side propose / confirm for Phase-3 voice writes.
 * Validates with real Zod schemas; confirm executes via the same PATCH routes.
 */
import { patchApprovalSchema } from "@/lib/validation/approval";
import { patchMonitoringAlertSchema } from "@/lib/validation/monitoring-alert";
import { patchBlockerSchema } from "@/lib/validation/blocker";
import { patchConflictSchema } from "@/lib/validation/conflict";
import { prisma } from "@/lib/prisma";
import { auditActorName } from "@/lib/release-audit";
import { getDefaultOrganizationId } from "@/lib/org-compat";
import {
  isVoiceWriteActionType,
  voiceWriteActionTypesList,
  type VoiceWriteActionType,
} from "@/lib/voice/action-types";
import {
  consumeVoiceAction,
  discardVoiceAction,
  getVoiceAction,
  storeVoiceAction,
} from "@/lib/voice/action-store";
import type { SessionUser } from "@/lib/auth/roles";
import { canEdit } from "@/lib/auth/roles";

export type ProposeWriteResult =
  | {
      ok: true;
      tool: "propose_action";
      actionType: VoiceWriteActionType;
      actionId: string;
      description: string;
      instruction: string;
      actionLine: string;
      /** Distinct UI role for transcript strip. */
      transcriptRole: "propose";
    }
  | {
      ok: false;
      tool: "propose_action";
      reason: string;
      instruction: string;
      actionLine: string;
    };

export type ConfirmWriteResult =
  | {
      ok: true;
      tool: "confirm_action";
      actionType?: VoiceWriteActionType;
      description: string;
      resultSummary: string;
      instruction: string;
      actionLine: string;
      discarded?: boolean;
    }
  | {
      ok: false;
      tool: "confirm_action";
      reason: string;
      instruction: string;
      actionLine: string;
    };

export type WriteActionDeps = {
  /** Absolute origin for same-route PATCH (e.g. https://host). */
  origin: string;
  /** Forward session cookies so PATCH uses the same auth as the browser. */
  cookieHeader: string;
  /** Injectable fetch for tests. */
  fetch?: typeof fetch;
};

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Split voice params into entity id + PATCH body.
 * @param params - Model-supplied params (must include id).
 */
function splitIdParams(params: Record<string, unknown>): {
  entityId: string;
  body: Record<string, unknown>;
} | null {
  const rawId =
    params.id ??
    params.entityId ??
    params.approvalId ??
    params.alertId ??
    params.blockerId ??
    params.blockerCode ??
    params.conflictId ??
    params.conflictCode;
  if (typeof rawId !== "string" || !rawId.trim()) return null;
  const body = { ...params };
  delete body.id;
  delete body.entityId;
  delete body.approvalId;
  delete body.alertId;
  delete body.blockerId;
  delete body.blockerCode;
  delete body.conflictId;
  delete body.conflictCode;
  return { entityId: rawId.trim(), body };
}

function patchPathForAction(actionType: VoiceWriteActionType, entityId: string): string {
  const id = encodeURIComponent(entityId);
  switch (actionType) {
    case "set_approval_decision":
      return `/api/approvals/${id}`;
    case "acknowledge_alert":
      return `/api/monitoring-alerts/${id}`;
    case "update_blocker":
      return `/api/blockers/${id}`;
    case "update_conflict":
      return `/api/conflicts/${id}`;
  }
}

async function describeApproval(entityId: string, body: Record<string, unknown>): Promise<string | null> {
  try {
    const row =
      (await prisma.approval.findUnique({
        where: { id: entityId },
        include: { release: { select: { releaseCode: true, name: true } } },
      })) ??
      (await prisma.approval.findUnique({
        where: { approvalCode: entityId },
        include: { release: { select: { releaseCode: true, name: true } } },
      }));
    if (!row) return null;
    const decision = typeof body.decision === "string" ? body.decision : "(unchanged)";
    return `Set approval ${row.approvalCode} on ${row.release.releaseCode} (${row.release.name}) to “${decision}”${
      body.decisionDate ? ` (decision date ${String(body.decisionDate)})` : ""
    }`;
  } catch {
    return null;
  }
}

async function describeBlocker(entityId: string, body: Record<string, unknown>): Promise<string | null> {
  try {
    const row =
      (await prisma.blocker.findUnique({ where: { id: entityId } })) ??
      (await prisma.blocker.findUnique({ where: { blockerCode: entityId } }));
    if (!row) return null;
    const bits: string[] = [];
    if (typeof body.status === "string") bits.push(`status→${body.status}`);
    if (typeof body.escalationLevel === "string") bits.push(`escalation→${body.escalationLevel}`);
    if (typeof body.resolutionNotes === "string") bits.push("add resolution notes");
    if (typeof body.assignedTo === "string") bits.push(`assignee→${body.assignedTo}`);
    return `Update blocker ${row.blockerCode} (${row.releaseCode}): ${bits.join(", ") || "fields"}`;
  } catch {
    return null;
  }
}

async function describeConflict(entityId: string, body: Record<string, unknown>): Promise<string | null> {
  try {
    const row =
      (await prisma.environmentConflict.findUnique({ where: { id: entityId } })) ??
      (await prisma.environmentConflict.findUnique({ where: { conflictCode: entityId } }));
    if (!row) return null;
    const bits: string[] = [];
    if (typeof body.status === "string") bits.push(`status→${body.status}`);
    if (typeof body.priority === "string") bits.push(`priority→${body.priority}`);
    if (typeof body.notes === "string") bits.push("update notes");
    return `Update conflict ${row.conflictCode}: ${bits.join(", ") || "fields"}`;
  } catch {
    return null;
  }
}

async function describeAlert(entityId: string, body: Record<string, unknown>): Promise<string | null> {
  try {
    const row =
      (await prisma.monitoringAlert.findUnique({
        where: { id: entityId },
        include: { application: { select: { name: true } } },
      })) ??
      (await prisma.monitoringAlert.findUnique({
        where: { alertCode: entityId },
        include: { application: { select: { name: true } } },
      }));
    if (!row) return null;
    const status = typeof body.status === "string" ? body.status : "(unchanged)";
    return `Set monitoring alert ${row.alertCode} (${row.application.name} / ${row.environmentName}) status to “${status}”`;
  } catch {
    return null;
  }
}

/**
 * Validate + describe a write without mutating data.
 */
export async function proposeVoiceWrite(input: {
  user: SessionUser;
  actionType: string;
  params: Record<string, unknown>;
  proposeDispatchId: string;
}): Promise<ProposeWriteResult> {
  if (!canEdit(input.user)) {
    return {
      ok: false,
      tool: "propose_action",
      reason: "Forbidden — editor role required",
      instruction: "Tell the user they do not have permission to make this change.",
      actionLine: "Propose blocked — insufficient permissions",
    };
  }

  const actionType = input.actionType.trim();
  if (!isVoiceWriteActionType(actionType)) {
    return {
      ok: false,
      tool: "propose_action",
      reason: `Unsupported actionType “${actionType}”. Allowed: ${voiceWriteActionTypesList()}`,
      instruction: `Only these writes are available: ${voiceWriteActionTypesList()}. Do not invent other writes.`,
      actionLine: `Propose blocked — unknown action (${actionType || "?"})`,
    };
  }

  const split = splitIdParams(input.params);
  if (!split) {
    return {
      ok: false,
      tool: "propose_action",
      reason: "params.id is required (entity code/id)",
      instruction:
        "Ask for the record id/code from search_entity or get_page_context, then propose again.",
      actionLine: "Propose failed — missing id",
    };
  }

  let patchBody: Record<string, unknown>;
  if (actionType === "set_approval_decision") {
    const parsed = patchApprovalSchema.safeParse(split.body);
    if (!parsed.success) {
      return {
        ok: false,
        tool: "propose_action",
        reason: parsed.error.issues.map((i) => i.message).join("; ") || "Invalid approval params",
        instruction:
          "Params failed patchApprovalSchema. Pass decision (and decisionDate when deciding). Do not invent fields.",
        actionLine: "Propose rejected — invalid approval params",
      };
    }
    if (Object.keys(parsed.data).length === 0) {
      return {
        ok: false,
        tool: "propose_action",
        reason: "No updatable fields provided",
        instruction: "Include at least decision (e.g. Approved) in params.",
        actionLine: "Propose rejected — empty patch",
      };
    }
    patchBody = parsed.data as Record<string, unknown>;
  } else if (actionType === "acknowledge_alert") {
    const parsed = patchMonitoringAlertSchema.safeParse(split.body);
    if (!parsed.success) {
      return {
        ok: false,
        tool: "propose_action",
        reason: parsed.error.issues.map((i) => i.message).join("; ") || "Invalid alert params",
        instruction: "Params failed patchMonitoringAlertSchema. For acknowledge, pass status: Acknowledged.",
        actionLine: "Propose rejected — invalid alert params",
      };
    }
    if (Object.keys(parsed.data).length === 0) {
      return {
        ok: false,
        tool: "propose_action",
        reason: "No updatable fields provided",
        instruction: "Include status (e.g. Acknowledged) in params.",
        actionLine: "Propose rejected — empty patch",
      };
    }
    patchBody = parsed.data as Record<string, unknown>;
  } else if (actionType === "update_blocker") {
    const parsed = patchBlockerSchema.safeParse(split.body);
    if (!parsed.success) {
      return {
        ok: false,
        tool: "propose_action",
        reason: parsed.error.issues.map((i) => i.message).join("; ") || "Invalid blocker params",
        instruction:
          "Pass status and/or escalationLevel and/or resolutionNotes (patchBlockerSchema). Example escalate: escalationLevel=\"L2 - Manager\".",
        actionLine: "Propose rejected — invalid blocker params",
      };
    }
    if (Object.keys(parsed.data).length === 0) {
      return {
        ok: false,
        tool: "propose_action",
        reason: "No updatable fields provided",
        instruction: "Include status, escalationLevel, or resolutionNotes.",
        actionLine: "Propose rejected — empty patch",
      };
    }
    patchBody = parsed.data as Record<string, unknown>;
  } else {
    const parsed = patchConflictSchema.safeParse(split.body);
    if (!parsed.success) {
      return {
        ok: false,
        tool: "propose_action",
        reason: parsed.error.issues.map((i) => i.message).join("; ") || "Invalid conflict params",
        instruction:
          "Pass status and/or priority and/or notes (patchConflictSchema). Escalate: status=\"Escalated\" (optional priority P1-Critical).",
        actionLine: "Propose rejected — invalid conflict params",
      };
    }
    if (Object.keys(parsed.data).length === 0) {
      return {
        ok: false,
        tool: "propose_action",
        reason: "No updatable fields provided",
        instruction: "Include status, priority, or notes.",
        actionLine: "Propose rejected — empty patch",
      };
    }
    patchBody = parsed.data as Record<string, unknown>;
  }

  const description =
    actionType === "set_approval_decision"
      ? await describeApproval(split.entityId, patchBody)
      : actionType === "acknowledge_alert"
        ? await describeAlert(split.entityId, patchBody)
        : actionType === "update_blocker"
          ? await describeBlocker(split.entityId, patchBody)
          : await describeConflict(split.entityId, patchBody);

  if (!description) {
    return {
      ok: false,
      tool: "propose_action",
      reason: `Record not found for id “${split.entityId}”`,
      instruction: "Search for the correct code, then propose again.",
      actionLine: "Propose failed — record not found",
    };
  }

  const actionId = storeVoiceAction({
    userId: input.user.id,
    actionType,
    entityId: split.entityId,
    patchBody,
    description,
    proposeDispatchId: input.proposeDispatchId,
  });

  return {
    ok: true,
    tool: "propose_action",
    actionType,
    actionId,
    description,
    transcriptRole: "propose",
    instruction: [
      `Proposed write (NOT executed): ${description}`,
      `actionId=${actionId} — pass this EXACT value to confirm_action after the user says yes in a LATER turn.`,
      "Do NOT call confirm_action in the same turn/tool batch as this propose.",
      "If the user says no/cancel, call confirm_action with accept=false and this actionId (discards; no write).",
      "Never invent a different actionId.",
    ].join(" "),
    actionLine: `PROPOSE: ${description}`,
  };
}

/**
 * Confirm (execute) or reject (discard) a previously proposed action.
 * Execute path hits the real PATCH route + voice audit tag.
 */
export async function confirmVoiceWrite(input: {
  user: SessionUser;
  actionId: string;
  /** false = verbal no/cancel — discard without mutating. Default true. */
  accept?: boolean;
  confirmDispatchId: string;
  deps: WriteActionDeps;
}): Promise<ConfirmWriteResult> {
  const accept = input.accept !== false;

  if (!accept) {
    const discarded = discardVoiceAction(input.actionId, input.user.id);
    if (!discarded) {
      return {
        ok: false,
        tool: "confirm_action",
        reason: "No pending proposal with that actionId",
        instruction: "Tell the user there was no pending change to cancel.",
        actionLine: "Nothing to cancel",
      };
    }
    return {
      ok: true,
      tool: "confirm_action",
      description: "Cancelled",
      resultSummary: "Cancelled — no changes made",
      discarded: true,
      instruction: "Confirm verbally that the proposed change was cancelled and nothing was saved.",
      actionLine: "CANCELLED: no changes made",
    };
  }

  if (!canEdit(input.user)) {
    return {
      ok: false,
      tool: "confirm_action",
      reason: "Forbidden — editor role required",
      instruction: "Permissions changed or are insufficient. Do not retry confirm; tell the user.",
      actionLine: "Confirm blocked — insufficient permissions",
    };
  }

  const lookup = getVoiceAction(input.actionId, input.user.id, input.confirmDispatchId);
  if (!lookup.ok) {
    return {
      ok: false,
      tool: "confirm_action",
      reason: lookup.reason,
      instruction:
        lookup.code === "same_turn"
          ? "Wait for the user to confirm in a separate spoken turn, then call confirm_action alone."
          : "Propose the action again if the user still wants it.",
      actionLine: `Confirm blocked — ${lookup.reason}`,
    };
  }

  const action = lookup.action;
  const path = patchPathForAction(action.actionType, action.entityId);

  const fetchFn = input.deps.fetch ?? globalThis.fetch;
  let patchRes: Response;
  try {
    patchRes = await fetchFn(new URL(path, input.deps.origin).toString(), {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: input.deps.cookieHeader,
      },
      body: JSON.stringify(action.patchBody),
      cache: "no-store",
    });
  } catch {
    return {
      ok: false,
      tool: "confirm_action",
      reason: "Failed to reach the update API",
      instruction: "Apologize and suggest trying from the UI, or propose again later.",
      actionLine: "Confirm failed — network error",
    };
  }

  if (patchRes.status === 403) {
    return {
      ok: false,
      tool: "confirm_action",
      reason: "Forbidden — editor role required at confirm time",
      instruction: "RBAC denied the write. Tell the user they cannot perform this action.",
      actionLine: "Confirm blocked — RBAC at confirm",
    };
  }

  if (!patchRes.ok) {
    let detail = `HTTP ${patchRes.status}`;
    try {
      const j = (await patchRes.json()) as { error?: string };
      if (j.error) detail = j.error;
    } catch {
      /* ignore */
    }
    return {
      ok: false,
      tool: "confirm_action",
      reason: detail,
      instruction: "The update failed. Do not invent success. Offer to try again from the detail page.",
      actionLine: `Confirm failed — ${detail}`,
    };
  }

  // One-time use: consume only after successful PATCH.
  consumeVoiceAction(action.actionId);

  try {
    await writeVoiceAudit(
      input.user,
      action.actionType,
      action.entityId,
      action.description,
      action.patchBody
    );
  } catch {
    // Mutation already committed via PATCH — do not fail the voice confirm on audit write.
  }

  const resultSummary = `Done — ${action.description.replace(/^Set /, "")}`;

  return {
    ok: true,
    tool: "confirm_action",
    actionType: action.actionType,
    description: action.description,
    resultSummary,
    instruction: `Speak a short confirmation: ${resultSummary}. Do not call confirm_action again for this actionId.`,
    actionLine: `CONFIRMED: ${resultSummary}`,
  };
}

async function writeVoiceAudit(
  user: SessionUser,
  actionType: VoiceWriteActionType,
  entityId: string,
  description: string,
  patchBody: Record<string, unknown>
): Promise<void> {
  const actor = auditActorName({ name: user.name, email: user.email, userId: user.id });
  const detail = `source:voice · ${description} · patch=${JSON.stringify(patchBody)}`;

  if (actionType === "set_approval_decision") {
    const row =
      (await prisma.approval.findUnique({
        where: { id: entityId },
        select: { releaseId: true, approvalCode: true },
      })) ??
      (await prisma.approval.findUnique({
        where: { approvalCode: entityId },
        select: { releaseId: true, approvalCode: true },
      }));
    if (!row) return;
    await prisma.releaseAuditEvent.create({
      data: {
        releaseId: row.releaseId,
        action: "approval_decision",
        actor,
        detail,
      },
    });
    return;
  }

  if (actionType === "update_blocker") {
    const row =
      (await prisma.blocker.findUnique({
        where: { id: entityId },
        select: { releaseCode: true },
      })) ??
      (await prisma.blocker.findUnique({
        where: { blockerCode: entityId },
        select: { releaseCode: true },
      }));
    if (row) {
      const release = await prisma.release.findUnique({
        where: { releaseCode: row.releaseCode },
        select: { id: true },
      });
      if (release) {
        await prisma.releaseAuditEvent.create({
          data: {
            releaseId: release.id,
            action: "blocker_update",
            actor,
            detail,
          },
        });
        return;
      }
    }
  }

  if (actionType === "update_conflict") {
    // Conflicts may span two releases — notify without inventing a single FK.
  }

  // Alerts / conflicts / orphan blockers — portfolio notification (org-aware insert).
  const organizationId = await getDefaultOrganizationId();
  const id = `voice_${Date.now().toString(36)}`;
  const ts = new Date();
  const title =
    actionType === "acknowledge_alert"
      ? "Voice: alert updated"
      : actionType === "update_conflict"
        ? "Voice: conflict updated"
        : "Voice: blocker updated";
  if (organizationId) {
    await prisma.$executeRaw`
      INSERT INTO "AppNotificationRow"
        (id, timestamp, title, message, "releaseId", read, type, "organizationId")
      VALUES
        (${id}, ${ts}, ${title}, ${detail}, ${null}, false, ${"voice_action"}, ${organizationId})
    `;
  } else {
    await prisma.appNotificationRow.create({
      data: {
        id,
        title,
        message: detail,
        type: "voice_action",
        releaseId: null,
        read: false,
      },
    });
  }
}

/** Helper for tool descriptions / tests. */
export function defaultAcknowledgeParams(alertId: string): Record<string, unknown> {
  return { id: alertId, status: "Acknowledged" };
}

/** @deprecated internal — decisionDate helper for docs only; propose must not auto-fill. */
export function exampleApprovalParams(approvalId: string): Record<string, unknown> {
  return { id: approvalId, decision: "Approved", decisionDate: todayIsoDate() };
}
