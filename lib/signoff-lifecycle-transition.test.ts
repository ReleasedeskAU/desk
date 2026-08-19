import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createDefaultSignoffLifecycleConfig,
  validateSignoffLifecycleConfig,
} from "@/lib/signoff-lifecycle-config";
import {
  mandatorySignoffsComplete,
  resolveSignoffLifecycleStatusRef,
  signoffNextStatusLabels,
  signoffStatusCountsAsComplete,
  validateSignoffTransition,
} from "@/lib/signoff-lifecycle-transition";
import { enforceSignoffFieldChanges } from "@/lib/signoff-lifecycle-enforce";

const config = createDefaultSignoffLifecycleConfig();

describe("default sign-off lifecycle", () => {
  it("validates the enterprise default graph and types", () => {
    assert.equal(validateSignoffLifecycleConfig(config), null);
    assert.ok(config.types.some((t) => t.key === "dev" && t.mandatory));
    assert.ok(config.types.some((t) => t.key === "business" && !t.mandatory));
  });
});

describe("resolveSignoffLifecycleStatusRef", () => {
  it("maps legacy Yes/No/Not Started and empty to lifecycle statuses", () => {
    assert.equal(resolveSignoffLifecycleStatusRef(config, "Yes")?.key, "approved");
    assert.equal(resolveSignoffLifecycleStatusRef(config, "No")?.key, "rejected");
    assert.equal(resolveSignoffLifecycleStatusRef(config, "Not Started")?.key, "pending");
    assert.equal(resolveSignoffLifecycleStatusRef(config, null)?.key, "pending");
    assert.equal(
      resolveSignoffLifecycleStatusRef(config, "Approved with Conditions")?.key,
      "approved_with_conditions"
    );
  });
});

describe("validateSignoffTransition", () => {
  it("allows Pending → Approved / Rejected / Approved with Conditions", () => {
    for (const to of [
      "Approved",
      "Rejected",
      "Approved with Conditions",
    ] as const) {
      const result = validateSignoffTransition({
        config,
        fromStatus: "Pending",
        toStatus: to,
      });
      assert.equal(result.allowed, true);
      if (!result.allowed) return;
      assert.equal(result.canonicalStatus, to);
    }
  });

  it("blocks exit from Approved (immutable terminal)", () => {
    const result = validateSignoffTransition({
      config,
      fromStatus: "Approved",
      toStatus: "Rejected",
    });
    assert.equal(result.allowed, false);
  });

  it("§3-21: allows Approved → Pending only when superseding", () => {
    assert.equal(
      validateSignoffTransition({
        config,
        fromStatus: "Approved",
        toStatus: "Pending",
      }).allowed,
      false
    );
    const ok = validateSignoffTransition({
      config,
      fromStatus: "Approved",
      toStatus: "Pending",
      allowSupersede: true,
    });
    assert.equal(ok.allowed, true);
    if (!ok.allowed) return;
    assert.equal(ok.canonicalStatus, "Pending");
  });

  it("allows Pending → Expired (SLA) and Pending → Withdrawn", () => {
    assert.equal(
      validateSignoffTransition({
        config,
        fromStatus: "Pending",
        toStatus: "Expired",
      }).allowed,
      true
    );
    assert.equal(
      validateSignoffTransition({
        config,
        fromStatus: "Pending",
        toStatus: "Withdrawn",
      }).allowed,
      true
    );
  });

  it("treats legacy Yes as Approved (already complete, same-status)", () => {
    const result = validateSignoffTransition({
      config,
      fromStatus: "Yes",
      toStatus: "Approved",
    });
    assert.equal(result.allowed, true);
  });
});

describe("mandatorySignoffsComplete", () => {
  it("requires Dev/Test/UAT/Security complete", () => {
    assert.equal(
      mandatorySignoffsComplete(config, {
        devSignoff: "Approved",
        testSignoff: "Yes",
        uatSignoff: "Approved with Conditions",
        securityClearance: "Approved",
      }),
      true
    );
    assert.equal(
      mandatorySignoffsComplete(config, {
        devSignoff: "Approved",
        testSignoff: "Pending",
        uatSignoff: "Approved",
        securityClearance: "Approved",
      }),
      false
    );
    assert.equal(signoffStatusCountsAsComplete(config, "Rejected"), false);
  });
});

describe("enforceSignoffFieldChanges", () => {
  it("canonicalizes Pending → Approved and blocks terminal exits", () => {
    const ok = enforceSignoffFieldChanges({
      config,
      existing: { devSignoff: "Pending" },
      body: { devSignoff: "approved" },
    });
    assert.equal(ok.ok, true);
    if (!ok.ok) return;
    assert.equal(ok.canonical.devSignoff, "Approved");

    const denied = enforceSignoffFieldChanges({
      config,
      existing: { devSignoff: "Approved" },
      body: { devSignoff: "Rejected" },
    });
    assert.equal(denied.ok, false);
    if (denied.ok) return;
    assert.equal(denied.httpStatus, 409);
  });
});

describe("signoffNextStatusLabels", () => {
  it("lists enabled exits from Pending", () => {
    const labels = signoffNextStatusLabels(config, "Pending");
    assert.ok(labels.includes("Approved"));
    assert.ok(labels.includes("Rejected"));
  });

  it("returns no exits from a terminal Approved decision", () => {
    assert.deepEqual(signoffNextStatusLabels(config, "Approved"), []);
  });

  it("treats a blank stored value as Pending", () => {
    const fromBlank = signoffNextStatusLabels(config, null);
    const fromPending = signoffNextStatusLabels(config, "Pending");
    assert.deepEqual(fromBlank, fromPending);
    assert.ok(fromBlank.includes("Approved"));
  });
});
