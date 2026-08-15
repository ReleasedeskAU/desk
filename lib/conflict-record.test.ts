import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDefaultConflictLifecycleConfig } from "@/lib/conflict-lifecycle-config";
import {
  conflictTypeLabelForKey,
  formatConflictPeriod,
  UNLINKED_CONFLICT_RELEASE,
} from "@/lib/conflict-record";
import { orderedReleaseCodes } from "@/lib/lifecycle-event-hook-helpers";

describe("formatConflictPeriod", () => {
  it("formats an overlap range in UTC date-time", () => {
    const from = new Date("2026-08-14T10:00:00.000Z");
    const to = new Date("2026-08-14T18:00:00.000Z");
    assert.equal(formatConflictPeriod(from, to), "2026-08-14 10:00 – 2026-08-14 18:00");
  });

  it("returns a single side when the other date is invalid", () => {
    const from = new Date("2026-08-14T10:00:00.000Z");
    assert.equal(formatConflictPeriod(from, new Date("not-a-date")), "2026-08-14 10:00");
  });
});

describe("conflictTypeLabelForKey", () => {
  it("reads the live catalog label, not a hardcoded string", () => {
    const config = createDefaultConflictLifecycleConfig();
    assert.equal(conflictTypeLabelForKey(config, "environment_booking"), "Environment Booking");
    assert.equal(conflictTypeLabelForKey(config, "maintenance_window"), "Maintenance Window");
    assert.equal(conflictTypeLabelForKey(config, "freeze_period"), "Freeze Period");
    assert.equal(conflictTypeLabelForKey(config, "schedule"), "Schedule");
  });
});

describe("booking overlap pair", () => {
  it("orders the new release against the overlapping booking’s release", () => {
    assert.deepEqual(orderedReleaseCodes("REL-0009", "REL-0002"), [
      "REL-0002",
      "REL-0009",
    ]);
    assert.deepEqual(orderedReleaseCodes("REL-0009", UNLINKED_CONFLICT_RELEASE), [
      "REL-0009",
      UNLINKED_CONFLICT_RELEASE,
    ]);
  });
});
