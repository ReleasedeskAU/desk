/**
 * RD-168 / RD-193 / RD-194 — related-create pickers omit Cancelled and Blocked.
 * Run: npx tsx --test lib/release-related-link-eligibility.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDefaultReleaseLifecycleConfig } from "@/lib/release-lifecycle-config";
import {
  cancelledLinkedReleaseLockMessage,
  filterReleasesForRelatedCreate,
  isConflictEditLockedByCancelledRelease,
  isReleaseBlockedForRelatedLink,
  isReleaseExcludedFromRelatedCreate,
} from "@/lib/release-related-link-eligibility";

const config = createDefaultReleaseLifecycleConfig();

describe("isReleaseExcludedFromRelatedCreate (RD-168 / RD-193)", () => {
  it("omits Cancelled and Blocked by status key, including renamed labels", () => {
    const renamed = createDefaultReleaseLifecycleConfig();
    renamed.statuses = renamed.statuses.map((s) => {
      if (s.key === "cancelled") return { ...s, label: "Aborted" };
      if (s.key === "blocked") return { ...s, label: "On Hold" };
      return s;
    });
    assert.equal(isReleaseExcludedFromRelatedCreate(renamed, "Aborted"), true);
    assert.equal(isReleaseExcludedFromRelatedCreate(renamed, "cancelled"), true);
    assert.equal(isReleaseExcludedFromRelatedCreate(renamed, "On Hold"), true);
    assert.equal(isReleaseExcludedFromRelatedCreate(renamed, "blocked"), true);
    assert.equal(isReleaseExcludedFromRelatedCreate(renamed, "Planning"), false);
    assert.equal(isReleaseExcludedFromRelatedCreate(renamed, "Rolled Back"), false);
    assert.equal(isReleaseExcludedFromRelatedCreate(renamed, "Closed"), false);
  });

  it("fails closed when config or status is missing", () => {
    assert.equal(isReleaseExcludedFromRelatedCreate(null, "Planning"), true);
    assert.equal(isReleaseExcludedFromRelatedCreate(config, ""), true);
    assert.equal(isReleaseExcludedFromRelatedCreate(config, null), true);
  });

  it("treats default Cancelled / Blocked labels as excluded", () => {
    assert.equal(isReleaseExcludedFromRelatedCreate(config, "Cancelled"), true);
    assert.equal(isReleaseExcludedFromRelatedCreate(config, "Blocked"), true);
    assert.equal(isReleaseBlockedForRelatedLink(config, "Blocked"), true);
    assert.equal(isReleaseBlockedForRelatedLink(config, "Planning"), false);
  });
});

describe("filterReleasesForRelatedCreate", () => {
  it("keeps usable releases and drops Cancelled and Blocked", () => {
    const rows = [
      { id: "1", status: "Planning" },
      { id: "2", status: "Cancelled" },
      { id: "3", status: "Blocked" },
      { id: "4", status: "UAT" },
    ];
    assert.deepEqual(
      filterReleasesForRelatedCreate(rows, config).map((r) => r.id),
      ["1", "4"]
    );
  });

  it("returns no rows while the graph is loading", () => {
    assert.deepEqual(
      filterReleasesForRelatedCreate([{ id: "1", status: "Planning" }], null),
      []
    );
  });
});

describe("isConflictEditLockedByCancelledRelease (RD-194)", () => {
  it("locks edit when either linked release is Cancelled, not when only Blocked", () => {
    assert.equal(
      isConflictEditLockedByCancelledRelease(config, ["Planning", "Cancelled"]),
      true
    );
    assert.equal(
      isConflictEditLockedByCancelledRelease(config, ["Blocked", "UAT"]),
      false
    );
    assert.equal(
      isConflictEditLockedByCancelledRelease(config, ["Planning", "Testing"]),
      false
    );
  });

  it("fails closed without config", () => {
    assert.equal(isConflictEditLockedByCancelledRelease(null, ["Planning"]), true);
  });

  it("uses the tenant Cancelled label in the lock message", () => {
    const renamed = createDefaultReleaseLifecycleConfig();
    renamed.statuses = renamed.statuses.map((s) =>
      s.key === "cancelled" ? { ...s, label: "Aborted" } : s
    );
    assert.match(
      cancelledLinkedReleaseLockMessage(renamed, "Aborted"),
      /Aborted/
    );
  });
});
