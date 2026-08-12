/**
 * Run: npx tsx --test lib/release-planning-entry-rules.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isLargeReleaseSize,
  validateReleaseDateOrder,
  validateReleaseNameAndApplications,
} from "@/lib/release-planning-entry-rules";

describe("validateReleaseNameAndApplications (§1-02 / §1-03)", () => {
  it("accepts a non-empty name with at least one application id", () => {
    assert.equal(
      validateReleaseNameAndApplications({
        name: "Search v2",
        applicationIds: ["app-1"],
      }),
      null
    );
  });

  it("rejects blank name and empty application list", () => {
    assert.match(
      validateReleaseNameAndApplications({ name: "  ", applicationIds: ["app-1"] }) ??
        "",
      /name/i
    );
    assert.match(
      validateReleaseNameAndApplications({ name: "Search v2", applicationIds: [] }) ??
        "",
      /application/i
    );
  });
});

describe("validateReleaseDateOrder (VR-01)", () => {
  it("allows missing either side and equal dates", () => {
    assert.equal(
      validateReleaseDateOrder({ startDate: null, endDate: "2026-12-01" }),
      null
    );
    assert.equal(
      validateReleaseDateOrder({
        startDate: "2026-12-01",
        endDate: "2026-12-01",
      }),
      null
    );
  });

  it("rejects End Date before Start Date", () => {
    const err = validateReleaseDateOrder({
      startDate: "2026-12-10",
      endDate: "2026-12-01",
    });
    assert.match(err ?? "", /End Date cannot be before Start Date/i);
  });
});

describe("isLargeReleaseSize (VR-26)", () => {
  it("detects Large / L / XL variants", () => {
    assert.equal(isLargeReleaseSize("Large"), true);
    assert.equal(isLargeReleaseSize("L"), true);
    assert.equal(isLargeReleaseSize("XL"), true);
    assert.equal(isLargeReleaseSize("Medium"), false);
    assert.equal(isLargeReleaseSize("M"), false);
  });
});
