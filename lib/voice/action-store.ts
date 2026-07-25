/**
 * Short-lived store for voice propose_action → confirm_action.
 * In-memory Map (same pattern as voice session rate-limit). One-time use + TTL.
 */
import { randomUUID } from "crypto";
import type { VoiceWriteActionType } from "@/lib/voice/action-types";

/** Proposals expire quickly so a stale “yes” cannot mutate later. */
export const VOICE_ACTION_TTL_MS = 3 * 60 * 1000;

export type StoredVoiceAction = {
  actionId: string;
  userId: string;
  actionType: VoiceWriteActionType;
  /** Entity path id (approvalCode/cuid or alertCode/cuid). */
  entityId: string;
  /** Validated PATCH body (Zod-parsed). */
  patchBody: Record<string, unknown>;
  description: string;
  /** Dispatch batch that created this proposal — confirm must use a different batch. */
  proposeDispatchId: string;
  createdAt: number;
  expiresAt: number;
  consumedAt: number | null;
};

const store = new Map<string, StoredVoiceAction>();

function sweep(now = Date.now()) {
  for (const [id, row] of store) {
    if (row.expiresAt <= now || row.consumedAt != null) {
      if (row.consumedAt != null || row.expiresAt <= now) {
        // Keep consumed rows briefly so reuse can return a clear error, then drop.
        if (row.consumedAt != null && now - row.consumedAt > 60_000) store.delete(id);
        else if (row.expiresAt <= now && row.consumedAt == null) store.delete(id);
      }
    }
  }
}

/**
 * Store a validated proposal for later confirm_action.
 * @returns actionId
 */
export function storeVoiceAction(input: {
  userId: string;
  actionType: VoiceWriteActionType;
  entityId: string;
  patchBody: Record<string, unknown>;
  description: string;
  proposeDispatchId: string;
}): string {
  sweep();
  // Supersede any open proposals for this user (new propose discards prior pending).
  for (const [id, row] of store) {
    if (row.userId === input.userId && row.consumedAt == null) store.delete(id);
  }
  const actionId = `va_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
  const now = Date.now();
  store.set(actionId, {
    actionId,
    userId: input.userId,
    actionType: input.actionType,
    entityId: input.entityId,
    patchBody: input.patchBody,
    description: input.description,
    proposeDispatchId: input.proposeDispatchId,
    createdAt: now,
    expiresAt: now + VOICE_ACTION_TTL_MS,
    consumedAt: null,
  });
  return actionId;
}

export type VoiceActionLookup =
  | { ok: true; action: StoredVoiceAction }
  | { ok: false; reason: string; code: "not_found" | "expired" | "consumed" | "wrong_user" | "same_turn" };

/**
 * Look up a proposal without consuming it.
 */
export function getVoiceAction(
  actionId: string,
  userId: string,
  confirmDispatchId: string
): VoiceActionLookup {
  sweep();
  const row = store.get(actionId);
  if (!row) return { ok: false, reason: "Unknown or expired actionId", code: "not_found" };
  if (row.userId !== userId) {
    return { ok: false, reason: "This proposal belongs to another session", code: "wrong_user" };
  }
  if (row.consumedAt != null) {
    return {
      ok: false,
      reason: "This action was already confirmed and cannot run again",
      code: "consumed",
    };
  }
  if (row.expiresAt <= Date.now()) {
    store.delete(actionId);
    return { ok: false, reason: "This proposal expired — propose the action again", code: "expired" };
  }
  // Hard two-turn gate: confirm in the same Live toolCall batch as propose is rejected.
  if (row.proposeDispatchId === confirmDispatchId) {
    return {
      ok: false,
      reason:
        "Confirmation must be a separate turn after the user explicitly says yes — propose and confirm cannot run in the same tool batch",
      code: "same_turn",
    };
  }
  return { ok: true, action: row };
}

/**
 * Mark a proposal consumed (one-time use). Idempotent.
 */
export function consumeVoiceAction(actionId: string): void {
  const row = store.get(actionId);
  if (!row) return;
  row.consumedAt = Date.now();
}

/**
 * Discard a pending proposal (verbal “no” / cancel).
 */
export function discardVoiceAction(actionId: string, userId: string): boolean {
  const row = store.get(actionId);
  if (!row || row.userId !== userId) return false;
  if (row.consumedAt != null) return false;
  store.delete(actionId);
  return true;
}

/** Test-only: clear store. */
export function __resetVoiceActionStoreForTests(): void {
  store.clear();
}

/** Test-only: force-expire a row. */
export function __expireVoiceActionForTests(actionId: string): void {
  const row = store.get(actionId);
  if (row) row.expiresAt = Date.now() - 1;
}
