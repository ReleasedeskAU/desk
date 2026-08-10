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
  it("offers starting work first on an open blocker", () => {
    const { primary, secondary } = blockerWorkflow("Open");

    assert.equal(primary?.status, "In Progress");
    assert.equal(primary?.label, "Start work");
    assert.deepEqual(
      secondary.map((s) => s.status),
      ["Resolved"]
    );
  });

  it("stamps a resolution date when resolving in-flight work", () => {
    const { primary } = blockerWorkflow("In Progress");

    assert.equal(primary?.status, "Resolved");
    assert.equal(primary?.stampsResolution, true);
  });

  it("offers closing once resolved, and clears the date on reopen", () => {
    const { primary, secondary } = blockerWorkflow("Resolved");

    assert.equal(primary?.status, "Closed");
    assert.equal(secondary[0]?.status, "Open");
    assert.equal(secondary[0]?.clearsResolution, true);
  });

  it("leaves a closed blocker with no primary action", () => {
    const { primary, secondary } = blockerWorkflow("Closed");

    assert.equal(primary, null);
    assert.deepEqual(
      secondary.map((s) => s.status),
      ["Open"]
    );
  });

  it("treats blank or unrecognised statuses as untouched work", () => {
    for (const status of ["", "   ", "Awaiting triage"]) {
      assert.equal(blockerWorkflow(status).primary?.status, "In Progress");
    }
  });

  it("matches status case-insensitively", () => {
    assert.equal(blockerWorkflow("RESOLVED").primary?.status, "Closed");
  });
});

describe("conflictWorkflow", () => {
  it("uses conflict-specific copy and stamps no resolution date", () => {
    const { primary } = conflictWorkflow("In Progress");

    assert.equal(primary?.label, "Mark resolved");
    assert.equal(primary?.stampsResolution, false);
  });

  it("offers reopening a closed conflict without touching dates", () => {
    const { primary, secondary } = conflictWorkflow("Closed");

    assert.equal(primary, null);
    assert.equal(secondary[0]?.label, "Reopen conflict");
    assert.equal(secondary[0]?.clearsResolution, false);
  });
});

describe("driftWorkflow", () => {
  it("uses remediation copy and stamps no resolution date", () => {
    const { primary } = driftWorkflow("In Progress");

    assert.equal(primary?.label, "Mark remediated");
    assert.equal(primary?.status, "Resolved");
    assert.equal(primary?.stampsResolution, false);
  });

  it("offers starting remediation on an open drift", () => {
    assert.equal(driftWorkflow("Open").primary?.label, "Start remediation");
  });
});

describe("dependencyWorkflow", () => {
  it("pushes a blocked link toward cleared, with at-risk as the softer move", () => {
    const { primary, secondary } = dependencyWorkflow("Blocked");

    assert.equal(primary?.status, "Clear");
    assert.deepEqual(
      secondary.map((s) => s.status),
      ["At Risk"]
    );
  });

  it("lets an at-risk link clear or fall back to blocked", () => {
    const { primary, secondary } = dependencyWorkflow("At Risk");

    assert.equal(primary?.status, "Clear");
    assert.deepEqual(
      secondary.map((s) => s.status),
      ["Blocked"]
    );
  });

  it("closes out a cleared link by resolving it", () => {
    assert.equal(dependencyWorkflow("Clear").primary?.status, "Resolved");
  });

  it("treats resolved as terminal and reopens to at risk", () => {
    const { primary, secondary } = dependencyWorkflow("Resolved");

    assert.equal(primary, null);
    assert.equal(secondary[0]?.status, "At Risk");
  });

  it("only emits statuses the dependency schema accepts", () => {
    const allowed = new Set(["Blocked", "At Risk", "Clear", "Resolved"]);
    for (const status of ["Blocked", "At Risk", "Clear", "Resolved", "Unknown"]) {
      const { primary, secondary } = dependencyWorkflow(status);
      for (const step of [...(primary ? [primary] : []), ...secondary]) {
        assert.ok(allowed.has(step.status), `${status} → ${step.status}`);
      }
    }
  });
});

describe("incidentWorkflow", () => {
  it("walks the containment ladder one rung at a time", () => {
    assert.equal(incidentWorkflow("Active").primary?.status, "Investigating");
    assert.equal(incidentWorkflow("Investigating").primary?.status, "Mitigated");
    assert.equal(incidentWorkflow("Mitigated").primary?.status, "Resolved");
    assert.equal(incidentWorkflow("Resolved").primary?.status, "Closed");
  });

  it("treats closed as terminal and reopens to active", () => {
    const { primary, secondary } = incidentWorkflow("Closed");

    assert.equal(primary, null);
    assert.equal(secondary[0]?.status, "Active");
  });

  it("treats an unrecognised status as nobody being on it yet", () => {
    assert.equal(incidentWorkflow("Triage").primary?.status, "Investigating");
  });
});

describe("approvalWorkflow", () => {
  it("offers approve, reject and defer on an open gate", () => {
    const { primary, secondary } = approvalWorkflow("Pending");

    assert.equal(primary?.status, "Approved");
    assert.deepEqual(
      secondary.map((s) => s.status),
      ["Rejected", "Deferred"]
    );
  });

  it("stamps a decision date on both outcomes", () => {
    const { primary, secondary } = approvalWorkflow("Pending");

    assert.equal(primary?.stampsResolution, true);
    assert.equal(secondary[0]?.stampsResolution, true);
  });

  it("drops defer once the gate has already been deferred", () => {
    const { primary, secondary } = approvalWorkflow("Deferred");

    assert.equal(primary?.status, "Approved");
    assert.deepEqual(
      secondary.map((s) => s.status),
      ["Rejected"]
    );
  });

  it("treats a recorded decision as final, with reopen clearing the date", () => {
    for (const decision of ["Approved", "Rejected"]) {
      const { primary, secondary } = approvalWorkflow(decision);
      assert.equal(primary, null, decision);
      assert.equal(secondary[0]?.status, "Pending", decision);
      assert.equal(secondary[0]?.clearsResolution, true, decision);
    }
  });
});

describe("alertWorkflow", () => {
  it("asks for acknowledgement before investigation on a fresh alert", () => {
    const { primary, secondary } = alertWorkflow("Open");

    assert.equal(primary?.status, "Acknowledged");
    assert.deepEqual(
      secondary.map((s) => s.status),
      ["Investigating"]
    );
  });

  it("moves an acknowledged alert into investigation", () => {
    assert.equal(alertWorkflow("Acknowledged").primary?.status, "Investigating");
  });

  it("treats a cleared alert the same as a resolved one", () => {
    assert.equal(alertWorkflow("Cleared").primary?.status, "Closed");
  });

  it("treats closed as terminal and reopens to open", () => {
    const { primary, secondary } = alertWorkflow("Closed");

    assert.equal(primary, null);
    assert.equal(secondary[0]?.status, "Open");
  });

  it("treats a firing alert as unacknowledged", () => {
    assert.equal(alertWorkflow("Firing").primary?.status, "Acknowledged");
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
  it("pushes an open risk toward mitigation, with escalate and accept as alternatives", () => {
    const { primary, secondary } = riskWorkflow("Open");

    assert.equal(primary?.status, "Mitigating");
    assert.deepEqual(
      secondary.map((s) => s.status),
      ["Escalated", "Accepted"]
    );
  });

  it("offers closing once mitigation or monitoring is under way", () => {
    for (const status of ["Mitigating", "Monitoring", "In Progress"]) {
      assert.equal(riskWorkflow(status).primary?.status, "Closed", status);
    }
  });

  it("routes an escalated risk back to mitigation", () => {
    const { primary, secondary } = riskWorkflow("Escalated");

    assert.equal(primary?.status, "Mitigating");
    assert.deepEqual(
      secondary.map((s) => s.status),
      ["Accepted"]
    );
  });

  it("treats accepted and closed as terminal", () => {
    for (const status of ["Accepted", "Closed"]) {
      const { primary, secondary } = riskWorkflow(status);
      assert.equal(primary, null, status);
      assert.deepEqual(
        secondary.map((s) => s.status),
        ["Open"],
        status
      );
    }
  });

  it("treats an unrecognised status as open exposure", () => {
    assert.equal(riskWorkflow("Needs review").primary?.status, "Mitigating");
  });
});
