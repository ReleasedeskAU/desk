import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { remapDependencyRowStatus } from "@/lib/dependency-status-remap";

describe("remapDependencyRowStatus", () => {
  it("maps Clear to Resolved with statusKey=resolved", () => {
    const next = remapDependencyRowStatus("Clear", "");
    assert.equal(next.status, "Resolved");
    assert.equal(next.statusKey, "resolved");
    assert.equal(next.changed, true);
  });

  it("keeps Resolved and backfills statusKey", () => {
    const next = remapDependencyRowStatus("Resolved", "");
    assert.equal(next.status, "Resolved");
    assert.equal(next.statusKey, "resolved");
    assert.equal(next.changed, true);
  });

  it("defaults empty status to Identified", () => {
    const next = remapDependencyRowStatus("", "");
    assert.equal(next.status, "Identified");
    assert.equal(next.statusKey, "identified");
    assert.equal(next.changed, true);
  });

  it("maps Waived to Removed if it ever appears", () => {
    const next = remapDependencyRowStatus("Waived", "");
    assert.equal(next.status, "Removed");
    assert.equal(next.statusKey, "removed");
    assert.equal(next.changed, true);
  });

  it("backfills At Risk and Blocked without changing the label", () => {
    const atRisk = remapDependencyRowStatus("At Risk", "");
    assert.equal(atRisk.status, "At Risk");
    assert.equal(atRisk.statusKey, "at_risk");
    assert.equal(atRisk.changed, true);

    const blocked = remapDependencyRowStatus("Blocked", "");
    assert.equal(blocked.status, "Blocked");
    assert.equal(blocked.statusKey, "blocked");
    assert.equal(blocked.changed, true);
  });

  it("is a no-op when label and key already match", () => {
    const next = remapDependencyRowStatus("Identified", "identified");
    assert.equal(next.status, "Identified");
    assert.equal(next.statusKey, "identified");
    assert.equal(next.changed, false);
  });
});
