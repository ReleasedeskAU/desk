/**
 * Run: npx tsx --test lib/release-form-matrix.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  durationDaysBetween,
  durationDaysLabel,
  formatReleaseAuditInstant,
  parseGoLiveChecklistPercent,
} from "@/lib/release-form-matrix";

describe("durationDaysBetween", () => {
  it("returns whole days between start and end", () => {
    assert.equal(
      durationDaysBetween("2026-07-01T00:00:00.000Z", "2026-07-13T00:00:00.000Z"),
      12
    );
  });

  it("returns null when a date is missing or invalid", () => {
    assert.equal(durationDaysBetween(null, "2026-07-13"), null);
    assert.equal(durationDaysBetween("2026-07-01", ""), null);
    assert.equal(durationDaysBetween("not-a-date", "2026-07-13"), null);
  });
});

describe("durationDaysLabel", () => {
  it("pluralizes and uses an em dash when uncomputable", () => {
    assert.equal(durationDaysLabel("2026-07-01T00:00:00.000Z", "2026-07-02T00:00:00.000Z"), "1 day");
    assert.equal(durationDaysLabel(null, "2026-07-02"), "—");
  });
});

describe("parseGoLiveChecklistPercent", () => {
  it("accepts blank and 0–100", () => {
    assert.deepEqual(parseGoLiveChecklistPercent(""), { ok: true, value: null });
    assert.deepEqual(parseGoLiveChecklistPercent(0), { ok: true, value: 0 });
    assert.deepEqual(parseGoLiveChecklistPercent("100"), { ok: true, value: 100 });
  });

  it("rejects out of range and non-numeric", () => {
    const high = parseGoLiveChecklistPercent(101);
    assert.equal(high.ok, false);
    const junk = parseGoLiveChecklistPercent("n/a");
    assert.equal(junk.ok, false);
  });
});

describe("formatReleaseAuditInstant", () => {
  it("formats UTC and blanks", () => {
    assert.equal(formatReleaseAuditInstant(null), "—");
    assert.equal(
      formatReleaseAuditInstant("2026-09-09T11:40:00.000Z"),
      "2026-09-09 11:40"
    );
  });
});
