/**
 * Layout helpers for Release Command Center.
 * Run: npx tsx --test lib/release-detail-layout.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  pickHeadlineReadiness,
  pickUrgentNextAction,
  shouldDefaultOpenBlockersTile,
} from "./release-detail-layout";

describe("pickHeadlineReadiness", () => {
  it("prefers computed live readiness over stored planning value", () => {
    assert.equal(pickHeadlineReadiness(50, 75), 50);
  });

  it("falls back to stored when computed is unavailable", () => {
    assert.equal(pickHeadlineReadiness(null, 75), 75);
    assert.equal(pickHeadlineReadiness(undefined, 0), 0);
  });

  it("returns 0 when neither signal exists", () => {
    assert.equal(pickHeadlineReadiness(null, null), 0);
  });
});

describe("pickUrgentNextAction", () => {
  it("returns the first next best action", () => {
    const action = pickUrgentNextAction([
      { label: "Review blockers", href: "#blockers", detail: "BLK-0001" },
      { label: "Book environment", href: "/booking" },
    ]);
    assert.equal(action?.label, "Review blockers");
  });

  it("returns null for empty or missing lists", () => {
    assert.equal(pickUrgentNextAction([]), null);
    assert.equal(pickUrgentNextAction(null), null);
  });
});

describe("shouldDefaultOpenBlockersTile", () => {
  it("opens for blocked, at-risk, or conflict releases", () => {
    assert.equal(shouldDefaultOpenBlockersTile("Blocked", false), true);
    assert.equal(shouldDefaultOpenBlockersTile("At Risk", false), true);
    assert.equal(shouldDefaultOpenBlockersTile("In Progress", true), true);
  });

  it("stays collapsed for calm releases without conflicts", () => {
    assert.equal(shouldDefaultOpenBlockersTile("Planned", false), false);
    assert.equal(shouldDefaultOpenBlockersTile("In Progress", false), false);
  });
});
