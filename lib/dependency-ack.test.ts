import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bothDependencyPartiesAcknowledged,
  isDependencySideAcknowledged,
  ownerIdForDependencyAckSide,
} from "@/lib/dependency-ack";

describe("dependency dual acknowledgment", () => {
  it("treats each side independently — never a single boolean", () => {
    const sourceOnly = {
      sourceAcknowledgedAt: new Date(),
      sourceAcknowledgedByUserId: "src",
      targetAcknowledgedAt: null,
      targetAcknowledgedByUserId: null,
    };
    assert.equal(isDependencySideAcknowledged(sourceOnly, "source"), true);
    assert.equal(isDependencySideAcknowledged(sourceOnly, "target"), false);
    assert.equal(bothDependencyPartiesAcknowledged(sourceOnly), false);
  });

  it("treats omitted ack columns as not acknowledged", () => {
    assert.equal(bothDependencyPartiesAcknowledged({}), false);
    assert.equal(
      bothDependencyPartiesAcknowledged({ sourceAcknowledgedAt: new Date() }),
      false
    );
  });

  it("is complete only when both sides are recorded", () => {
    const both = {
      sourceAcknowledgedAt: new Date(),
      sourceAcknowledgedByUserId: "src",
      targetAcknowledgedAt: new Date(),
      targetAcknowledgedByUserId: "tgt",
    };
    assert.equal(bothDependencyPartiesAcknowledged(both), true);
  });

  it("resolves the owner User id for each side", () => {
    assert.equal(ownerIdForDependencyAckSide("src", "tgt", "source"), "src");
    assert.equal(ownerIdForDependencyAckSide("src", "tgt", "target"), "tgt");
    assert.equal(ownerIdForDependencyAckSide("  ", "tgt", "source"), null);
    assert.equal(ownerIdForDependencyAckSide(null, undefined, "target"), null);
  });
});
