import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createDefaultDriftLifecycleConfig,
  validateDriftLifecycleConfig,
} from "@/lib/drift-lifecycle-config";
import {
  legalNextDriftStatuses,
  resolveDriftLifecycleStatusRef,
  validateDriftTransition,
} from "@/lib/drift-lifecycle-transition";
import {
  deniedDriftEditFields,
  resolveDriftEditMode,
} from "@/lib/drift-lifecycle-edit-policy";

const config = createDefaultDriftLifecycleConfig();

describe("default drift lifecycle", () => {
  it("validates the 7-status enterprise graph", () => {
    assert.equal(validateDriftLifecycleConfig(config), null);
    assert.deepEqual(
      config.statuses.map((status) => status.label),
      [
        "Open",
        "In Progress",
        "Scheduled",
        "Escalated",
        "Resolved",
        "Closed",
        "Reverted",
      ]
    );
  });

  it("keeps Reverted terminal and Resolved working", () => {
    const resolved = config.statuses.find((status) => status.label === "Resolved");
    const reverted = config.statuses.find((status) => status.label === "Reverted");
    const closed = config.statuses.find((status) => status.label === "Closed");
    assert.equal(resolved?.terminal, false);
    assert.equal(resolved?.editMode, "limited");
    assert.equal(reverted?.terminal, true);
    assert.equal(reverted?.editMode, "immutable");
    assert.equal(closed?.terminal, true);
  });
});

describe("resolveDriftLifecycleStatusRef", () => {
  it("resolves leftover Detected / Investigating / Approved after real labels", () => {
    assert.equal(resolveDriftLifecycleStatusRef(config, "Open")?.key, "detected");
    assert.equal(resolveDriftLifecycleStatusRef(config, "Detected")?.key, "detected");
    assert.equal(
      resolveDriftLifecycleStatusRef(config, "In Progress")?.key,
      "investigating"
    );
    assert.equal(
      resolveDriftLifecycleStatusRef(config, "Investigating")?.key,
      "investigating"
    );
    assert.equal(resolveDriftLifecycleStatusRef(config, "Approved")?.key, "approved");
    assert.equal(resolveDriftLifecycleStatusRef(config, "Resolved")?.key, "approved");
  });

  it("does not hide new real statuses behind leftover aliases", () => {
    assert.equal(resolveDriftLifecycleStatusRef(config, "Scheduled")?.label, "Scheduled");
    assert.equal(resolveDriftLifecycleStatusRef(config, "Closed")?.label, "Closed");
    assert.notEqual(resolveDriftLifecycleStatusRef(config, "Closed")?.key, "reverted");
    assert.notEqual(
      resolveDriftLifecycleStatusRef(config, "Scheduled")?.key,
      "investigating"
    );
  });
});

describe("validateDriftTransition", () => {
  it("allows Open → In Progress when review notes are set", () => {
    const denied = validateDriftTransition({
      config,
      fromStatus: "Open",
      toStatus: "In Progress",
      facts: { notes: null, etaToFix: null, baselineNotes: null },
    });
    assert.equal(denied.allowed, false);
    if (denied.allowed) return;
    assert.equal(denied.code, "TRANSITION_NEEDS_OVERRIDE");

    const ok = validateDriftTransition({
      config,
      fromStatus: "Open",
      toStatus: "In Progress",
      facts: { notes: "Reviewed — config mismatch confirmed", etaToFix: null, baselineNotes: null },
    });
    assert.equal(ok.allowed, true);
  });

  it("allows Open → Escalated and leftover Detected → Reverted", () => {
    const escalate = validateDriftTransition({
      config,
      fromStatus: "Open",
      toStatus: "Escalated",
    });
    assert.equal(escalate.allowed, true);

    const revert = validateDriftTransition({
      config,
      fromStatus: "Detected",
      toStatus: "Reverted",
    });
    assert.equal(revert.allowed, true);
  });

  it("requires ETA to enter Scheduled and baseline notes to Resolve", () => {
    const noEta = validateDriftTransition({
      config,
      fromStatus: "In Progress",
      toStatus: "Scheduled",
      facts: { notes: "reviewed", etaToFix: null, baselineNotes: null },
    });
    assert.equal(noEta.allowed, false);

    const scheduled = validateDriftTransition({
      config,
      fromStatus: "In Progress",
      toStatus: "Scheduled",
      facts: { notes: "reviewed", etaToFix: "2026-09-01", baselineNotes: null },
    });
    assert.equal(scheduled.allowed, true);

    const noBaseline = validateDriftTransition({
      config,
      fromStatus: "In Progress",
      toStatus: "Resolved",
      facts: { notes: "reviewed", etaToFix: null, baselineNotes: null },
    });
    assert.equal(noBaseline.allowed, false);

    const resolved = validateDriftTransition({
      config,
      fromStatus: "In Progress",
      toStatus: "Resolved",
      facts: {
        notes: "reviewed",
        etaToFix: null,
        baselineNotes: "UAT Oracle 19c is now the accepted baseline",
      },
    });
    assert.equal(resolved.allowed, true);
  });

  it("allows Resolved → Closed and blocks exit from Closed / Reverted", () => {
    const close = validateDriftTransition({
      config,
      fromStatus: "Resolved",
      toStatus: "Closed",
    });
    assert.equal(close.allowed, true);

    for (const from of ["Closed", "Reverted"] as const) {
      const result = validateDriftTransition({
        config,
        fromStatus: from,
        toStatus: "Open",
      });
      assert.equal(result.allowed, false);
    }
  });

  it("does not treat Reverted as Closed", () => {
    const result = validateDriftTransition({
      config,
      fromStatus: "Resolved",
      toStatus: "Reverted",
    });
    assert.equal(result.allowed, false);
  });

  it("lets a Flexible unmet gate proceed with an exception reason", () => {
    const result = validateDriftTransition({
      config,
      fromStatus: "Open",
      toStatus: "In Progress",
      overrideReason: "Reviewer on leave — starting work from the ticket",
      facts: { notes: null, etaToFix: null, baselineNotes: null },
    });
    assert.equal(result.allowed, true);
    if (!result.allowed) return;
    assert.equal(result.overridden, true);
  });

  it("keeps the Approved path and Reverted path separate", () => {
    const resolve = validateDriftTransition({
      config,
      fromStatus: "Detected",
      toStatus: "Approved",
      facts: {
        notes: null,
        etaToFix: null,
        baselineNotes: "Accept the drifted UAT config as the new baseline",
      },
    });
    assert.equal(resolve.allowed, true);
    if (resolve.allowed) {
      assert.equal(resolve.canonicalStatus, "Resolved");
    }

    const close = validateDriftTransition({
      config,
      fromStatus: "Approved",
      toStatus: "Closed",
    });
    assert.equal(close.allowed, true);

    const revert = validateDriftTransition({
      config,
      fromStatus: "Open",
      toStatus: "Reverted",
    });
    assert.equal(revert.allowed, true);
    if (revert.allowed) {
      assert.equal(revert.canonicalStatus, "Reverted");
    }
  });

  it("allows In Progress ↔ Scheduled and Escalated ↔ Scheduled", () => {
    const facts = {
      notes: "Reviewed",
      etaToFix: "2026-09-15",
      baselineNotes: null,
    };
    assert.equal(
      validateDriftTransition({
        config,
        fromStatus: "In Progress",
        toStatus: "Scheduled",
        facts,
      }).allowed,
      true
    );
    assert.equal(
      validateDriftTransition({
        config,
        fromStatus: "Scheduled",
        toStatus: "In Progress",
        facts,
      }).allowed,
      true
    );
    assert.equal(
      validateDriftTransition({
        config,
        fromStatus: "Escalated",
        toStatus: "Scheduled",
        facts,
      }).allowed,
      true
    );
    assert.equal(
      validateDriftTransition({
        config,
        fromStatus: "Scheduled",
        toStatus: "Escalated",
      }).allowed,
      true
    );
  });
});

describe("legalNextDriftStatuses", () => {
  it("lists sheet next steps from Open plus live early exits", () => {
    const next = legalNextDriftStatuses(config, "Open").map((item) => item.label);
    assert.ok(next.includes("In Progress"));
    assert.ok(next.includes("Scheduled"));
    assert.ok(next.includes("Escalated"));
    assert.ok(next.includes("Resolved"));
    assert.ok(next.includes("Reverted"));
    assert.ok(!next.includes("Closed"));
  });
});

describe("drift edit policy", () => {
  it("marks Resolved limited and Closed / Reverted immutable", () => {
    assert.equal(resolveDriftEditMode(config, "Resolved"), "limited");
    assert.equal(resolveDriftEditMode(config, "Approved"), "limited");
    assert.equal(resolveDriftEditMode(config, "Closed"), "immutable");
    assert.equal(resolveDriftEditMode(config, "Reverted"), "immutable");
    assert.equal(resolveDriftEditMode(config, "Open"), "full");
  });

  it("allows notes on Resolved and denies severity", () => {
    const { denied } = deniedDriftEditFields(config, "Resolved", [
      "severity",
      "status",
      "notes",
      "baselineNotes",
    ]);
    assert.deepEqual(denied, ["severity"]);
  });
});
