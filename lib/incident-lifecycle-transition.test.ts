import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createDefaultIncidentLifecycleConfig,
  validateIncidentLifecycleConfig,
} from "@/lib/incident-lifecycle-config";
import {
  resolveIncidentLifecycleStatusRef,
  validateIncidentTransition,
} from "@/lib/incident-lifecycle-transition";
import {
  deniedIncidentEditFields,
  resolveIncidentEditMode,
} from "@/lib/incident-lifecycle-edit-policy";

const config = createDefaultIncidentLifecycleConfig();

describe("default incident lifecycle", () => {
  it("validates the enterprise default graph", () => {
    assert.equal(validateIncidentLifecycleConfig(config), null);
  });
});

describe("resolveIncidentLifecycleStatusRef", () => {
  it("maps legacy Active / Acknowledged / Mitigated aliases", () => {
    assert.equal(resolveIncidentLifecycleStatusRef(config, "Active")?.key, "open");
    assert.equal(
      resolveIncidentLifecycleStatusRef(config, "Acknowledged")?.key,
      "investigating"
    );
    assert.equal(
      resolveIncidentLifecycleStatusRef(config, "Mitigated")?.key,
      "resolving"
    );
  });
});

describe("validateIncidentTransition", () => {
  it("allows Open → Investigating", () => {
    const result = validateIncidentTransition({
      config,
      fromStatus: "Open",
      toStatus: "Investigating",
      facts: { severity: "Medium", assignedTo: "Ada" },
    });
    assert.equal(result.allowed, true);
    if (!result.allowed) return;
    assert.equal(result.canonicalStatus, "Investigating");
  });

  it("blocks illegal Open → Resolved jump", () => {
    const result = validateIncidentTransition({
      config,
      fromStatus: "Open",
      toStatus: "Resolved",
      facts: { severity: "Medium", assignedTo: "Ada" },
    });
    assert.equal(result.allowed, false);
    if (result.allowed) return;
    assert.equal(result.code, "ILLEGAL_TRANSITION");
  });

  it("requires override when Critical Open exits without owner (VR-13)", () => {
    const denied = validateIncidentTransition({
      config,
      fromStatus: "Open",
      toStatus: "Investigating",
      facts: { severity: "Critical", assignedTo: null },
    });
    assert.equal(denied.allowed, false);
    if (denied.allowed) return;
    assert.equal(denied.code, "TRANSITION_NEEDS_OVERRIDE");

    const ok = validateIncidentTransition({
      config,
      fromStatus: "Open",
      toStatus: "Investigating",
      overrideReason: "War-room already engaged",
      facts: { severity: "Critical", assignedTo: null },
    });
    assert.equal(ok.allowed, true);
    if (!ok.allowed) return;
    assert.equal(ok.overridden, true);
  });

  it("blocks exit from Closed and allows Resolved → Reopened → Investigating", () => {
    assert.equal(
      validateIncidentTransition({
        config,
        fromStatus: "Closed",
        toStatus: "Reopened",
        facts: { severity: "Low", assignedTo: "Ada" },
      }).allowed,
      false
    );
    assert.equal(
      validateIncidentTransition({
        config,
        fromStatus: "Resolved",
        toStatus: "Reopened",
        facts: { severity: "Low", assignedTo: "Ada" },
      }).allowed,
      true
    );
    assert.equal(
      validateIncidentTransition({
        config,
        fromStatus: "Reopened",
        toStatus: "Investigating",
        facts: { severity: "Low", assignedTo: "Ada" },
      }).allowed,
      true
    );
  });
});

describe("incident edit policy", () => {
  it("marks Resolved limited and Closed immutable", () => {
    assert.equal(resolveIncidentEditMode(config, "Resolved"), "limited");
    assert.equal(resolveIncidentEditMode(config, "Closed"), "immutable");
    assert.equal(resolveIncidentEditMode(config, "Active"), "full");
  });

  it("denies title edits on Closed", () => {
    const { denied } = deniedIncidentEditFields(config, "Closed", [
      "title",
      "status",
    ]);
    assert.deepEqual(denied, ["title"]);
  });
});
