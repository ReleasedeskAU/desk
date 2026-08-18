/**
 * Run: npx tsx --test lib/release-detail-related-filters.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  dependencyTouchesRelease,
  filterSeedDependencies,
  type DependencyViewRow,
} from "./dependency-view";
import {
  conflictTouchesRelease,
  filterSeedConflicts,
  type ConflictViewRow,
} from "./conflict-view";

function dep(partial: Partial<DependencyViewRow>): DependencyViewRow {
  return {
    id: "1",
    depCode: "DEP-001",
    releaseCode: "REL-0001",
    releaseName: "One",
    releaseDbId: "id-1",
    dependsOnCode: "REL-0002",
    dependsOnName: "Two",
    dependsOnDbId: "id-2",
    dependencyType: "Hard",
    status: "Pending",
    impactIfBlocked: "Delay",
    notes: null,
    ...partial,
  };
}

function conflict(partial: Partial<ConflictViewRow>): ConflictViewRow {
  return {
    id: "c1",
    conflictCode: "CNF-0001",
    status: "Detected",
    priority: "P2 - High",
    assignedTo: "",
    release1Code: "REL-0001",
    release2Code: "REL-0002",
    release1DbId: "id-1",
    release2DbId: "id-2",
    application: "App",
    department: "Dept",
    conflictingEnvironment: "UAT",
    environmentConflictType: "Schedule",
    notes: null,
    ...partial,
  };
}

describe("dependencyTouchesRelease", () => {
  it("matches either side by exact code or id", () => {
    const row = dep({});
    assert.equal(dependencyTouchesRelease(row, "REL-0001"), true);
    assert.equal(dependencyTouchesRelease(row, "REL-0002"), true);
    assert.equal(dependencyTouchesRelease(row, "id-2"), true);
    assert.equal(dependencyTouchesRelease(row, "REL-00010"), false);
  });
});

describe("filterSeedDependencies linkedReleaseQ", () => {
  it("returns both depends-on and depended-by rows", () => {
    const rows = [
      dep({ id: "a", releaseCode: "REL-0003", releaseDbId: "id-3" }),
      dep({ id: "b", dependsOnCode: "REL-0003", dependsOnDbId: "id-3" }),
      dep({ id: "c", releaseCode: "REL-0009", dependsOnCode: "REL-0008" }),
    ];
    const linked = filterSeedDependencies(rows, { linkedReleaseQ: "REL-0003" });
    assert.deepEqual(linked.map((r) => r.id).sort(), ["a", "b"]);
  });
});

describe("conflictTouchesRelease", () => {
  it("matches either side by exact code only", () => {
    const row = conflict({});
    assert.equal(conflictTouchesRelease(row, "REL-0001"), true);
    assert.equal(conflictTouchesRelease(row, "REL-0002"), true);
    assert.equal(conflictTouchesRelease(row, "REL-00010"), false);
  });
});

describe("filterSeedConflicts eitherReleaseQ", () => {
  it("returns conflicts where the release is either side", () => {
    const rows = [
      conflict({ id: "a", release1Code: "REL-0004", release2Code: "REL-0005" }),
      conflict({ id: "b", release1Code: "REL-0009", release2Code: "REL-0004" }),
      conflict({ id: "c", release1Code: "REL-0001", release2Code: "REL-0002" }),
    ];
    const linked = filterSeedConflicts(rows, { eitherReleaseQ: "REL-0004" });
    assert.deepEqual(linked.map((r) => r.id).sort(), ["a", "b"]);
  });
});
