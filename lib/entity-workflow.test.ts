/**
 * Detail-page status transition rules.
 * Run: npx tsx --test lib/entity-workflow.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  alertWorkflow,
  approvalWorkflow,
  blockerWorkflow,
  conflictWorkflow,
  dependencyWorkflow,
  driftWorkflow,
  incidentWorkflow,
  maintenanceWorkflow,
  riskWorkflow,
} from "./entity-workflow";

describe("blockerWorkflow", () => {
  it("offers assigning first on an open blocker, then sheet Escalated only", () => {
    const { primary, secondary } = blockerWorkflow("Open");

    assert.equal(primary?.status, "Assigned");
    assert.equal(primary?.label, "Assign owner");
    assert.deepEqual(
      secondary.map((s) => s.status).sort(),
      ["Escalated"]
    );
  });

  it("stamps a resolution date when resolving in-flight work", () => {
    const { primary } = blockerWorkflow("In Progress");

    assert.equal(primary?.status, "Resolved");
    assert.equal(primary?.stampsResolution, true);
  });

  it("offers closing once resolved (Reopened exit defaults Off)", () => {
    const { primary, secondary } = blockerWorkflow("Resolved");

    assert.equal(primary?.status, "Closed");
    assert.deepEqual(secondary, []);
  });

  it("leaves a closed blocker with no actions (terminal)", () => {
    const { primary, secondary } = blockerWorkflow("Closed");

    assert.equal(primary, null);
    assert.deepEqual(secondary, []);
  });

  it("treats blank or unrecognised statuses as untouched work", () => {
    for (const status of ["", "   ", "Awaiting triage"]) {
      assert.equal(blockerWorkflow(status).primary?.status, "Assigned");
    }
  });

  it("matches status case-insensitively", () => {
    assert.equal(blockerWorkflow("RESOLVED").primary?.status, "Closed");
  });
});

describe("conflictWorkflow", () => {
  it("follows the live graph from Open / Detected", () => {
    const { primary, secondary } = conflictWorkflow("Detected");
    assert.equal(primary?.status, "In Progress");
    assert.equal(primary?.label, "Start work");
    assert.deepEqual(
      secondary.map((s) => s.status).sort(),
      ["Escalated"]
    );
  });

  it("offers Close once resolved", () => {
    const { primary, secondary } = conflictWorkflow("Resolved");
    assert.equal(primary?.status, "Closed");
    assert.equal(primary?.label, "Close conflict");
    assert.deepEqual(secondary, []);
  });
});

describe("driftWorkflow", () => {
  it("starts work from Open / leftover Detected", () => {
    const { primary, secondary } = driftWorkflow("Open");
    assert.equal(primary?.status, "In Progress");
    assert.ok(secondary.some((s) => s.status === "Scheduled"));
    assert.ok(secondary.some((s) => s.status === "Escalated"));
    assert.ok(secondary.some((s) => s.status === "Reverted"));
    assert.equal(driftWorkflow("Detected").primary?.status, "In Progress");
  });

  it("closes a leftover Approved / Resolved drift, not a Reverted one", () => {
    assert.equal(driftWorkflow("Approved").primary?.status, "Closed");
    assert.equal(driftWorkflow("Resolved").primary?.status, "Closed");
    assert.equal(driftWorkflow("Reverted").primary, null);
  });
});

describe("dependencyWorkflow", () => {
  it("offers In Progress first from Pending", () => {
    const { primary, secondary } = dependencyWorkflow("Pending");
    assert.equal(primary?.status, "In Progress");
    assert.ok(secondary.some((s) => s.status === "At Risk"));
    assert.ok(secondary.some((s) => s.status === "Met"));
  });

  it("offers Pending first from Identified", () => {
    const { primary } = dependencyWorkflow("Identified");
    assert.equal(primary?.status, "Pending");
  });

  it("moves At Risk toward Met", () => {
    const { primary } = dependencyWorkflow("At Risk");
    assert.equal(primary?.status, "Met");
  });

  it("leaves Met with no one-click (terminal / no outgoing)", () => {
    const { primary, secondary } = dependencyWorkflow("Met");
    assert.equal(primary, null);
    assert.deepEqual(secondary, []);
  });
});

describe("incidentWorkflow", () => {
  it("walks the sheet incident graph (Resolving defaults Off)", () => {
    assert.equal(incidentWorkflow("Active").primary?.status, "Acknowledged");
    assert.equal(incidentWorkflow("Open").primary?.status, "Acknowledged");
    assert.deepEqual(
      incidentWorkflow("Active").secondary.map((s) => s.status).sort(),
      ["Investigating"]
    );
    assert.equal(incidentWorkflow("Acknowledged").primary?.status, "Investigating");
    assert.equal(incidentWorkflow("Investigating").primary?.status, "Resolved");
    assert.deepEqual(
      incidentWorkflow("Investigating").secondary.map((s) => s.status).sort(),
      ["Escalated"]
    );
    assert.equal(incidentWorkflow("Resolved").primary?.status, "Closed");
  });

  it("leaves Closed with no one-click (terminal)", () => {
    const { primary, secondary } = incidentWorkflow("Closed");
    assert.equal(primary, null);
    assert.deepEqual(secondary, []);
  });

  it("treats an unrecognised status as Starting (Open)", () => {
    assert.equal(incidentWorkflow("Triage").primary?.status, "Acknowledged");
  });
});

describe("approvalWorkflow", () => {
  it("offers approve first on Pending, then legal extras", () => {
    const { primary, secondary } = approvalWorkflow("Pending");
    assert.equal(primary?.status, "Approved");
    assert.equal(primary?.stampsResolution, true);
    assert.ok(secondary.some((s) => s.status === "Approved with Conditions"));
    assert.ok(secondary.some((s) => s.status === "Rejected"));
    assert.ok(secondary.some((s) => s.status === "Deferred"));
  });

  it("hides the required Approved → Expired cron edge from one-click", () => {
    const { primary, secondary } = approvalWorkflow("Approved");
    assert.equal(primary, null);
    assert.deepEqual(secondary, []);
  });

  it("leaves Deferred with no one-click (no outgoing edges)", () => {
    const { primary, secondary } = approvalWorkflow("Deferred");
    assert.equal(primary, null);
    assert.deepEqual(secondary, []);
  });
});

describe("alertWorkflow", () => {
  it("acknowledges an Active / leftover Pending alert first", () => {
    const { primary, secondary } = alertWorkflow("Active");
    assert.equal(primary?.status, "Acknowledged");
    assert.ok(secondary.some((s) => s.status === "Dismissed"));
    assert.ok(!secondary.some((s) => s.status === "Expired"));
    assert.equal(alertWorkflow("Pending").primary?.status, "Acknowledged");
  });

  it("moves Acknowledged to Investigating, then Resolve", () => {
    assert.equal(alertWorkflow("Acknowledged").primary?.status, "Investigating");
    assert.equal(alertWorkflow("Investigating").primary?.status, "Resolved");
  });

  it("falls back to Starting status when the leftover Open label is used", () => {
    assert.equal(alertWorkflow("Open").primary?.status, "Acknowledged");
  });

  it("closes a leftover Actioned / Resolved alert", () => {
    assert.equal(alertWorkflow("Actioned").primary?.status, "Closed");
    assert.equal(alertWorkflow("Resolved").primary?.status, "Closed");
  });
});

describe("maintenanceWorkflow", () => {
  it("walks approval then execution one stage at a time", () => {
    assert.equal(maintenanceWorkflow("Pending").primary?.status, "Approved");
    assert.equal(maintenanceWorkflow("Approved").primary?.status, "Scheduled");
    assert.equal(maintenanceWorkflow("Scheduled").primary?.status, "In Progress");
    assert.equal(maintenanceWorkflow("In Progress").primary?.status, "Completed");
  });

  it("offers rejection only while the window is still pending", () => {
    assert.deepEqual(
      maintenanceWorkflow("Pending").secondary.map((s) => s.status),
      ["Rejected"]
    );
    assert.deepEqual(
      maintenanceWorkflow("Approved").secondary.map((s) => s.status),
      ["Cancelled"]
    );
  });

  it("leaves a completed window with nothing to do", () => {
    const { primary, secondary } = maintenanceWorkflow("Completed");

    assert.equal(primary, null);
    assert.deepEqual(secondary, []);
  });

  it("lets a rejected or cancelled window be resubmitted as pending", () => {
    for (const status of ["Rejected", "Cancelled"]) {
      const { primary, secondary } = maintenanceWorkflow(status);
      assert.equal(primary, null, status);
      assert.equal(secondary[0]?.status, "Pending", status);
    }
  });

  it("does not mistake Rejected for an approval", () => {
    assert.notEqual(maintenanceWorkflow("Rejected").primary?.status, "Scheduled");
  });
});

describe("riskWorkflow", () => {
  it("walks Open → In Progress using stable underlying keys", () => {
    const { primary, secondary } = riskWorkflow("Open");
    assert.equal(primary?.status, "In Progress");
    assert.ok(secondary.some((s) => s.status === "Accepted"));
    assert.ok(secondary.some((s) => s.status === "Escalated"));
  });

  it("moves Mitigating to Monitoring", () => {
    assert.equal(riskWorkflow("Mitigating").primary?.status, "Monitoring");
  });

  it("routes an escalated risk back to In Progress first", () => {
    const { primary, secondary } = riskWorkflow("Escalated");
    assert.equal(primary?.status, "In Progress");
    assert.ok(secondary.some((s) => s.status === "Mitigating"));
    assert.ok(secondary.some((s) => s.status === "Accepted"));
  });

  it("routes Accepted to Monitoring with reversal as a secondary move", () => {
    const { primary, secondary } = riskWorkflow("Accepted");
    assert.equal(primary?.status, "Monitoring");
    assert.ok(secondary.some((s) => s.status === "Mitigating"));
  });

  it("leaves Closed with no one-click (terminal)", () => {
    const { primary, secondary } = riskWorkflow("Closed");
    assert.equal(primary, null);
    assert.deepEqual(secondary, []);
  });

  it("treats an unrecognised status as Starting (Open)", () => {
    assert.equal(riskWorkflow("Needs review").primary?.status, "In Progress");
  });
});
