import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDefaultSignoffLifecycleConfig } from "@/lib/signoff-lifecycle-config";
import { SIGNOFF_SLA_FIELDS } from "@/lib/signoff-lifecycle-config";
import {
  nextSignoffIntakeAtMap,
  parseSignoffIntakeAt,
  signoffFieldIntakeAnchor,
} from "@/lib/signoff-intake-at";
import { isPastDayThreshold } from "@/lib/lifecycle-automations/time";

const config = createDefaultSignoffLifecycleConfig();

describe("sign-off intake clock", () => {
  it("stamps now when a field enters Pending, keeps the stamp if already Pending", () => {
    const now = new Date("2026-08-14T12:00:00.000Z");
    const first = nextSignoffIntakeAtMap({
      config,
      existingValues: { businessSignoff: null },
      writes: { businessSignoff: "Pending" },
      previous: {},
      now,
    });
    assert.equal(first.businessSignoff, now.toISOString());

    const later = new Date("2026-08-20T12:00:00.000Z");
    const kept = nextSignoffIntakeAtMap({
      config,
      existingValues: { businessSignoff: "Pending" },
      writes: { businessSignoff: "Pending" },
      previous: first,
      now: later,
    });
    assert.equal(kept.businessSignoff, now.toISOString());
  });

  it("clears the stamp when the field leaves Pending", () => {
    const now = new Date("2026-08-14T12:00:00.000Z");
    const next = nextSignoffIntakeAtMap({
      config,
      existingValues: { businessSignoff: "Pending" },
      writes: { businessSignoff: "Approved" },
      previous: { businessSignoff: now.toISOString() },
      now,
    });
    assert.equal(next.businessSignoff, undefined);
  });

  it("does not expire a newly stamped field on an old release", () => {
    const createdAt = new Date("2025-01-01T00:00:00.000Z");
    const stamped = new Date("2026-08-14T12:00:00.000Z");
    const now = new Date("2026-08-14T13:00:00.000Z");
    assert.equal(isPastDayThreshold(createdAt, 30, now), true);
    const anchor = signoffFieldIntakeAnchor("businessSignoff", {
      businessSignoff: stamped.toISOString(),
    });
    assert.ok(anchor);
    assert.equal(isPastDayThreshold(anchor, 30, now), false);
  });

  it("expires only after the field clock passes the SLA", () => {
    const stamped = new Date("2026-07-01T12:00:00.000Z");
    const now = new Date("2026-08-14T12:00:00.000Z");
    const anchor = signoffFieldIntakeAnchor("opsSignoff", {
      opsSignoff: stamped.toISOString(),
    });
    assert.ok(anchor);
    assert.equal(isPastDayThreshold(anchor, 30, now), true);
  });

  it("skips expiry when the stamp is missing (fail-safe)", () => {
    assert.equal(signoffFieldIntakeAnchor("devSignoff", {}), null);
  });

  it("does not include trainingStatus in the SLA field list", () => {
    assert.equal(
      (SIGNOFF_SLA_FIELDS as readonly string[]).includes("trainingStatus"),
      false
    );
    assert.ok(SIGNOFF_SLA_FIELDS.includes("businessSignoff"));
    assert.ok(SIGNOFF_SLA_FIELDS.includes("opsSignoff"));
  });

  it("ignores unknown keys when parsing stored JSON", () => {
    const parsed = parseSignoffIntakeAt({
      businessSignoff: "2026-08-14T12:00:00.000Z",
      trainingStatus: "2026-08-14T12:00:00.000Z",
      junk: "nope",
    });
    assert.equal(parsed.businessSignoff, "2026-08-14T12:00:00.000Z");
    assert.equal(parsed.trainingStatus, undefined);
  });
});
