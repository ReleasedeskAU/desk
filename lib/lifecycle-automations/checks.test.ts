import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  escalateAfterDaysForRiskStatus,
  approvalExpiryDays,
  signoffPendingExpiryDays,
} from "@/lib/lifecycle-automations/thresholds";
import { dueRiskEscalationDays } from "@/lib/lifecycle-automations/checks";
import { createDefaultRiskLifecycleConfig } from "@/lib/risk-lifecycle-config";
import { createDefaultSignoffLifecycleConfig } from "@/lib/signoff-lifecycle-config";
import { createDefaultAlertLifecycleConfig } from "@/lib/alert-lifecycle-config";
import { isPastDayThreshold } from "@/lib/lifecycle-automations/time";

describe("AV-02 threshold resolution", () => {
  it("returns 3 days for Open and In Progress on defaults", () => {
    assert.equal(escalateAfterDaysForRiskStatus("Open"), 3);
    assert.equal(escalateAfterDaysForRiskStatus("In Progress"), 3);
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
    assert.equal(escalateAfterDaysForRiskStatus("Open", config), 7);
  });

  it("filters candidates through a customized live graph", () => {
    const config = createDefaultRiskLifecycleConfig();
    const assessing = config.statuses.find((status) => status.key === "assessing")!;
    assessing.label = "Triage";
    assessing.escalateAfterDays = 2;
    assert.equal(
      dueRiskEscalationDays({
        status: "Triage",
        statusChangedAt: new Date("2026-08-01T00:00:00.000Z"),
        config,
        now: new Date("2026-08-03T00:00:00.000Z"),
      }),
      2
    );
  });

  it("anchors AV-02 to statusChangedAt, independent of unrelated edits", () => {
    const config = createDefaultRiskLifecycleConfig();
    const statusChangedAt = new Date("2026-08-01T00:00:00.000Z");
    const unrelatedUpdatedAt = new Date("2026-08-03T23:59:00.000Z");
    assert.ok(unrelatedUpdatedAt > statusChangedAt);
    assert.equal(
      dueRiskEscalationDays({
        status: "Open",
        statusChangedAt,
        config,
        now: new Date("2026-08-04T00:00:00.000Z"),
      }),
      3
    );
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

  it("alert Starting status expiryDays defaults to 7", () => {
    const config = createDefaultAlertLifecycleConfig();
    const intake = config.statuses.find((status) => status.isIntake);
    assert.equal(intake?.expiryDays, 7);
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
