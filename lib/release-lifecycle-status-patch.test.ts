/**
 * Wave 1: gate-fact status lists follow live flags, not hardcoded names.
 * Run: npx tsx --test lib/release-lifecycle-status-patch.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDefaultBlockerLifecycleConfig } from "@/lib/blocker-lifecycle-config";
import { createDefaultConflictLifecycleConfig } from "@/lib/conflict-lifecycle-config";
import { createDefaultIncidentLifecycleConfig } from "@/lib/incident-lifecycle-config";
import { releaseGateFactStatusLists } from "@/lib/release-lifecycle-status-patch";

function defaultLists() {
  return releaseGateFactStatusLists({
    blocker: createDefaultBlockerLifecycleConfig(),
    incident: createDefaultIncidentLifecycleConfig(),
    conflict: createDefaultConflictLifecycleConfig(),
  });
}

describe("releaseGateFactStatusLists", () => {
  it("counts blockers that block Ready, not a hardcoded Resolved/Closed exclusion list", () => {
    const lists = defaultLists();
    assert.ok(lists.blockingBlockerStatuses.includes("Open"));
    assert.ok(lists.blockingBlockerStatuses.includes("Assigned"));
    assert.ok(lists.blockingBlockerStatuses.includes("Reopened"));
    assert.equal(lists.blockingBlockerStatuses.includes("Resolved"), false);
    assert.equal(lists.blockingBlockerStatuses.includes("Closed"), false);
    assert.equal(lists.blockingBlockerStatuses.includes("Cancelled"), false);
  });

  it("uses blocksLinkedRelease for AV-06, including a renamed label", () => {
    const incident = createDefaultIncidentLifecycleConfig();
    const open = incident.statuses.find((s) => s.key === "open")!;
    open.label = "New";
    const lists = releaseGateFactStatusLists({
      blocker: createDefaultBlockerLifecycleConfig(),
      incident,
      conflict: createDefaultConflictLifecycleConfig(),
    });
    assert.ok(lists.blockingIncidentStatuses.includes("New"));
    assert.ok(lists.blockingIncidentStatuses.includes("open"));
    assert.ok(lists.blockingIncidentStatuses.includes("Investigating"));
    assert.equal(lists.blockingIncidentStatuses.includes("Resolved"), false);
    assert.equal(lists.blockingIncidentStatuses.includes("Closed"), false);
  });

  it("drops Investigating from AV-06 when the tenant turns the flag off", () => {
    const incident = createDefaultIncidentLifecycleConfig();
    const investigating = incident.statuses.find((s) => s.key === "investigating")!;
    investigating.blocksLinkedRelease = false;
    const lists = releaseGateFactStatusLists({
      blocker: createDefaultBlockerLifecycleConfig(),
      incident,
      conflict: createDefaultConflictLifecycleConfig(),
    });
    assert.equal(lists.blockingIncidentStatuses.includes("Investigating"), false);
    assert.ok(lists.blockingIncidentStatuses.includes("Active"));
    assert.ok(lists.blockingIncidentStatuses.includes("open"));
  });

  it("treats live terminal=false as open for VR-33 / VR-32", () => {
    const lists = defaultLists();
    assert.ok(lists.openIncidentStatuses.includes("Resolved"));
    assert.equal(lists.openIncidentStatuses.includes("Closed"), false);
    assert.ok(lists.openConflictStatuses.includes("Detected"));
    assert.ok(lists.openConflictStatuses.includes("Under Review"));
    assert.equal(lists.openConflictStatuses.includes("Resolved"), false);
  });
});
