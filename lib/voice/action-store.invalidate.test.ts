/**
 * Remint / reconnect must invalidate pending proposals.
 * Run: npx tsx --test lib/voice/action-store.invalidate.test.ts
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  __resetVoiceActionStoreForTests,
  discardVoiceAction,
  getVoiceAction,
  invalidatePendingVoiceActionsForUser,
  storeVoiceAction,
} from "./action-store";

describe("invalidatePendingVoiceActionsForUser", () => {
  beforeEach(() => {
    __resetVoiceActionStoreForTests();
  });

  it("drops open proposals so confirm after reconnect cannot succeed", () => {
    const actionId = storeVoiceAction({
      userId: "user_a",
      actionType: "set_approval_decision",
      entityId: "APR-1",
      patchBody: { decision: "Approved", decisionDate: "2026-07-22" },
      description: "test",
      proposeDispatchId: "dispatch-1",
    });

    const n = invalidatePendingVoiceActionsForUser("user_a");
    assert.equal(n, 1);

    const lookup = getVoiceAction(actionId, "user_a", "dispatch-2");
    assert.equal(lookup.ok, false);
    if (lookup.ok) return;
    assert.equal(lookup.code, "not_found");
  });

  it("does not remove another user's proposal", () => {
    const idB = storeVoiceAction({
      userId: "user_b",
      actionType: "acknowledge_alert",
      entityId: "ALT-1",
      patchBody: { status: "Acknowledged" },
      description: "ack",
      proposeDispatchId: "d1",
    });
    invalidatePendingVoiceActionsForUser("user_a");
    const lookup = getVoiceAction(idB, "user_b", "d2");
    assert.equal(lookup.ok, true);
    assert.equal(discardVoiceAction(idB, "user_b"), true);
  });
});
