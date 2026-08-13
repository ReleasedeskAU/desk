import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  escalateAfterDaysForRiskStatus,
  approvalExpiryDays,
  signoffPendingExpiryDays,
} from "@/lib/lifecycle-automations/thresholds";
import { createDefaultRiskLifecycleConfig } from "@/lib/risk-lifecycle-config";
import { createDefaultSignoffLifecycleConfig } from "@/lib/signoff-lifecycle-config";
import { isPastDayThreshold } from "@/lib/lifecycle-automations/time";

describe("AV-02 threshold resolution", () => {
  it("returns 3 days for Identified and Assessing on defaults", () => {
    assert.equal(escalateAfterDaysForRiskStatus("Identified"), 3);
    assert.equal(escalateAfterDaysForRiskStatus("Assessing"), 3);
  });

  it("returns null for Escalated / Mitigating (no auto-escalate)", () => {
    assert.equal(escalateAfterDaysForRiskStatus("Escalated"), null);
    assert.equal(escalateAfterDaysForRiskStatus("Mitigating"), null);
  });

  it("respects a personalized escalateAfterDays on the owner config", () => {
    const config = createDefaultRiskLifecycleConfig();
    const identified = config.statuses.find((s) => s.key === "identified");
    assert.ok(identified);
    identified!.escalateAfterDays = 7;
    assert.equal(escalateAfterDaysForRiskStatus("Identified", config), 7);
  });
});

describe("sign-off / approval SLA thresholds", () => {
  it("Pending carries expiryDays 30 by default", () => {
    const config = createDefaultSignoffLifecycleConfig();
    assert.equal(signoffPendingExpiryDays(config), 30);
  });

  it("approval Approved expiryDays defaults to 30", () => {
    assert.equal(approvalExpiryDays(), 30);
  });

  it("sign-off expiry follows Starting status, not the pending key", () => {
    const config = createDefaultSignoffLifecycleConfig();
    const approved = config.statuses.find((s) => s.key === "approved")!;
    const pending = config.statuses.find((s) => s.key === "pending")!;
    pending.isIntake = false;
    pending.expiryDays = null;
    approved.isIntake = true;
    approved.expiryDays = 12;
    assert.equal(signoffPendingExpiryDays(config), 12);
  });
});

describe("elapsed simulation", () => {
  it("simulates AV-02 elapsed time without waiting", () => {
    const entered = new Date("2026-08-01T12:00:00.000Z");
    const before = new Date("2026-08-04T11:59:59.000Z");
    const after = new Date("2026-08-04T12:00:00.000Z");
    assert.equal(isPastDayThreshold(entered, 3, before), false);
    assert.equal(isPastDayThreshold(entered, 3, after), true);
  });
});
