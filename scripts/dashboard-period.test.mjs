import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseDashboardPeriod } from "../lib/dashboard-period.ts";

/**
 * Regression checks for dashboard period parsing.
 * Run: npx tsx --test scripts/dashboard-period.test.mjs
 */
describe("parseDashboardPeriod", () => {
  it("accepts known periods", () => {
    assert.equal(parseDashboardPeriod("today"), "today");
    assert.equal(parseDashboardPeriod("week"), "week");
    assert.equal(parseDashboardPeriod("month"), "month");
    assert.equal(parseDashboardPeriod("all"), "all");
  });

  it("falls back to all for invalid or null input", () => {
    assert.equal(parseDashboardPeriod(null), "all");
    assert.equal(parseDashboardPeriod("nope"), "all");
    assert.equal(parseDashboardPeriod(""), "all");
  });
});
