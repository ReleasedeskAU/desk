import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDefaultBlockerLifecycleConfig } from "@/lib/blocker-lifecycle-config";
import {
  blockerStatusBlocksReleaseReady,
  resolveBlockerLifecycleStatusRef,
  validateBlockerTransition,
} from "@/lib/blocker-lifecycle-transition";
import {
  deniedBlockerEditFields,
  resolveBlockerEditMode,
} from "@/lib/blocker-lifecycle-edit-policy";

const config = createDefaultBlockerLifecycleConfig();

describe("resolveBlockerLifecycleStatusRef", () => {
  it("matches by key and by label (case-insensitive)", () => {
    assert.equal(resolveBlockerLifecycleStatusRef(config, "open")?.key, "open");
    assert.equal(resolveBlockerLifecycleStatusRef(config, "In Progress")?.key, "in_progress");
    assert.equal(resolveBlockerLifecycleStatusRef(config, "ESCALATED")?.key, "escalated");
  });
});

describe("validateBlockerTransition", () => {
  it("allows Open → In Progress", () => {
    const result = validateBlockerTransition({
      config,
      fromStatus: "Open",
      toStatus: "in_progress",
    });
    assert.equal(result.allowed, true);
    if (!result.allowed) return;
    assert.equal(result.canonicalStatus, "In Progress");
  });

  it("blocks illegal Open → Closed jump", () => {
    const result = validateBlockerTransition({
      config,
      fromStatus: "Open",
      toStatus: "Closed",
    });
    assert.equal(result.allowed, false);
    if (result.allowed) return;
    assert.equal(result.code, "ILLEGAL_TRANSITION");
  });

  it("blocks any exit from terminal Closed", () => {
    const result = validateBlockerTransition({
      config,
      fromStatus: "Closed",
      toStatus: "Reopened",
    });
    assert.equal(result.allowed, false);
    if (result.allowed) return;
    assert.equal(result.code, "ILLEGAL_TRANSITION");
  });

  it("allows Resolved → Reopened and Reopened → In Progress", () => {
    const reopen = validateBlockerTransition({
      config,
      fromStatus: "Resolved",
      toStatus: "Reopened",
    });
    assert.equal(reopen.allowed, true);
    const progress = validateBlockerTransition({
      config,
      fromStatus: "Reopened",
      toStatus: "In Progress",
    });
    assert.equal(progress.allowed, true);
  });
});

describe("blockerStatusBlocksReleaseReady", () => {
  it("blocks Ready for open-like statuses and not for Resolved/Closed/Cancelled", () => {
    assert.equal(blockerStatusBlocksReleaseReady(config, "Open"), true);
    assert.equal(blockerStatusBlocksReleaseReady(config, "Escalated"), true);
    assert.equal(blockerStatusBlocksReleaseReady(config, "Reopened"), true);
    assert.equal(blockerStatusBlocksReleaseReady(config, "Resolved"), false);
    assert.equal(blockerStatusBlocksReleaseReady(config, "Closed"), false);
    assert.equal(blockerStatusBlocksReleaseReady(config, "Cancelled"), false);
  });
});

describe("blocker edit policy", () => {
  it("marks Closed/Cancelled immutable and Resolved limited", () => {
    assert.equal(resolveBlockerEditMode(config, "Closed"), "immutable");
    assert.equal(resolveBlockerEditMode(config, "Cancelled"), "immutable");
    assert.equal(resolveBlockerEditMode(config, "Resolved"), "limited");
    assert.equal(resolveBlockerEditMode(config, "Open"), "full");
  });

  it("denies description edits on Closed but allows status attempts", () => {
    const { denied } = deniedBlockerEditFields(config, "Closed", [
      "blockerDescription",
      "status",
    ]);
    assert.deepEqual(denied, ["blockerDescription"]);
  });
});
