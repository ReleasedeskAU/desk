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
  it("follows the live graph from Detected", () => {
    const { primary, secondary } = conflictWorkflow("Detected");
    assert.equal(primary?.status, "Under Review");
    assert.equal(primary?.label, "Start review");
    assert.deepEqual(
      secondary.map((s) => s.status).sort(),
      ["Dismissed", "Resolved"]
    );
  });

  it("leaves Resolved with no one-click (no outgoing edges)", () => {
    const { primary, secondary } = conflictWorkflow("Resolved");
    assert.equal(primary, null);
    assert.deepEqual(secondary, []);
  });
});

describe("driftWorkflow", () => {
  it("starts investigation from Detected", () => {
    const { primary } = driftWorkflow("Detected");
    assert.equal(primary?.status, "Investigating");
    assert.equal(primary?.label, "Start investigation");
  });

  it("falls back to Starting status when the label is unknown", () => {
    assert.equal(driftWorkflow("Open").primary?.status, "Investigating");
  });
});

describe("dependencyWorkflow", () => {
  it("offers At Risk first from Pending, then Met/Waived/Removed", () => {
    const { primary, secondary } = dependencyWorkflow("Pending");
    assert.equal(primary?.status, "At Risk");
    assert.deepEqual(
      secondary.map((s) => s.status).sort(),
      ["Met", "Removed", "Waived"]
    );
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
  it("acknowledges a pending alert first", () => {
    const { primary, secondary } = alertWorkflow("Pending");
    assert.equal(primary?.status, "Acknowledged");
    assert.ok(secondary.some((s) => s.status === "Dismissed"));
  });

  it("moves Acknowledged to Actioned", () => {
    assert.equal(alertWorkflow("Acknowledged").primary?.status, "Actioned");
  });

  it("falls back to Starting status when the label is unknown", () => {
    assert.equal(alertWorkflow("Open").primary?.status, "Acknowledged");
  });

  it("leaves Actioned with no one-click (no outgoing edges)", () => {
    const { primary, secondary } = alertWorkflow("Actioned");
    assert.equal(primary, null);
    assert.deepEqual(secondary, []);
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
  it("walks Identified → Assessing via the Open alias", () => {
    const { primary, secondary } = riskWorkflow("Open");
    assert.equal(primary?.status, "Assessing");
    assert.ok(secondary.some((s) => s.status === "Escalated"));
  });

  it("moves Mitigating to Mitigated", () => {
    assert.equal(riskWorkflow("Mitigating").primary?.status, "Mitigated");
  });

  it("routes an escalated risk back to mitigation", () => {
    const { primary, secondary } = riskWorkflow("Escalated");
    assert.equal(primary?.status, "Mitigating");
    assert.ok(secondary.some((s) => s.status === "Accepted"));
  });

  it("leaves Closed with no one-click (terminal)", () => {
    const { primary, secondary } = riskWorkflow("Closed");
    assert.equal(primary, null);
    assert.deepEqual(secondary, []);
  });

  it("treats an unrecognised status as Starting (Identified)", () => {
    assert.equal(riskWorkflow("Needs review").primary?.status, "Assessing");
  });
});
