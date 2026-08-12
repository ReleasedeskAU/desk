import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  daysElapsed,
  isPastDayThreshold,
  sameUtcDeployDay,
  utcDayKey,
} from "@/lib/lifecycle-automations/time";

describe("lifecycle automation time helpers", () => {
  it("daysElapsed floors whole days", () => {
    const from = new Date("2026-08-01T10:00:00.000Z");
    const now = new Date("2026-08-04T09:00:00.000Z");
    assert.equal(daysElapsed(from, now), 2);
  });

  it("isPastDayThreshold main path and edge (threshold not met)", () => {
    const from = new Date("2026-08-01T00:00:00.000Z");
    const day3 = new Date("2026-08-04T00:00:00.000Z");
    assert.equal(isPastDayThreshold(from, 3, day3), true);
    assert.equal(
      isPastDayThreshold(from, 3, new Date("2026-08-03T23:59:59.000Z")),
      false
    );
    assert.equal(isPastDayThreshold(from, 0, day3), false);
  });

  it("sameUtcDeployDay compares calendar days only", () => {
    assert.equal(
      sameUtcDeployDay(
        new Date("2026-08-11T01:00:00.000Z"),
        new Date("2026-08-11T23:00:00.000Z")
      ),
      true
    );
    assert.equal(
      sameUtcDeployDay(
        new Date("2026-08-11T23:00:00.000Z"),
        new Date("2026-08-12T01:00:00.000Z")
      ),
      false
    );
    assert.equal(utcDayKey(null), null);
  });
});
