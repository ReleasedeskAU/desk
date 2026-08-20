import { readFileSync } from "node:fs";
import { join } from "node:path";
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
  legalNextSignoffStatuses,
  signoffDecisionTypesForForm,
  signoffFieldCompleteWhenRequired,
  signoffTypeRequiredForRelease,
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

  it("does not require Business or Ops unless Settings marks them mandatory", () => {
    assert.equal(
      mandatorySignoffsComplete(config, {
        devSignoff: "Approved",
        testSignoff: "Approved",
        uatSignoff: "Approved",
        securityClearance: "Approved",
        businessSignoff: "Rejected",
        opsSignoff: "Pending",
      }),
      true
    );
  });

  it("requires Business from Medium+ and Ops from High/Critical via type floors (no hardcoded keys)", () => {
    const approved = {
      devSignoff: "Approved",
      testSignoff: "Approved",
      uatSignoff: "Approved",
      securityClearance: "Approved",
      businessSignoff: "Pending",
      opsSignoff: "Pending",
    };
    assert.equal(
      mandatorySignoffsComplete(config, {
        ...approved,
        releaseSize: "Small",
        priority: "P3 - Medium",
      }),
      true
    );
    assert.equal(
      mandatorySignoffsComplete(config, {
        ...approved,
        releaseSize: "Medium",
        priority: "P3 - Medium",
      }),
      false
    );
    assert.equal(
      mandatorySignoffsComplete(config, {
        ...approved,
        businessSignoff: "Approved",
        releaseSize: "Medium",
        priority: "P3 - Medium",
      }),
      true
    );
    assert.equal(
      mandatorySignoffsComplete(config, {
        ...approved,
        businessSignoff: "Approved",
        releaseSize: "Medium",
        priority: "P2 - High",
      }),
      false
    );
    assert.equal(
      mandatorySignoffsComplete(config, {
        ...approved,
        businessSignoff: "Approved",
        opsSignoff: "Approved",
        releaseSize: "Large",
        priority: "P1 - Critical",
      }),
      true
    );

    const business = config.types.find((t) => t.key === "business")!;
    const ops = config.types.find((t) => t.key === "ops")!;
    assert.equal(
      signoffTypeRequiredForRelease(business, { releaseSize: "Medium" }),
      true
    );
    assert.equal(
      signoffTypeRequiredForRelease(business, { releaseSize: "Small" }),
      false
    );
    assert.equal(
      signoffTypeRequiredForRelease(ops, { priority: "P2 - High" }),
      true
    );
    assert.equal(
      signoffTypeRequiredForRelease(ops, { priority: "P3 - Medium" }),
      false
    );
  });

  it("makes field-specific Ready gates conditional on Size/Priority", () => {
    assert.equal(
      signoffFieldCompleteWhenRequired(
        config,
        "businessSignoff",
        "Pending",
        { releaseSize: "Small", priority: "P3 - Medium" }
      ),
      true
    );
    assert.equal(
      signoffFieldCompleteWhenRequired(
        config,
        "businessSignoff",
        "Pending",
        { releaseSize: "Medium", priority: "P3 - Medium" }
      ),
      false
    );
    assert.equal(
      signoffFieldCompleteWhenRequired(
        config,
        "opsSignoff",
        "Approved",
        { releaseSize: "Medium", priority: "P2 - High" }
      ),
      true
    );
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

  it("blocks flipping a recorded decision on all six types (Dev/Test/UAT/Security/Business/Ops)", () => {
    const fields = [
      "devSignoff",
      "testSignoff",
      "uatSignoff",
      "securityClearance",
      "businessSignoff",
      "opsSignoff",
    ] as const;
    for (const field of fields) {
      const denied = enforceSignoffFieldChanges({
        config,
        existing: { [field]: "Approved" },
        body: { [field]: "Rejected" },
      });
      assert.equal(denied.ok, false, field);
      if (denied.ok) continue;
      assert.equal(denied.httpStatus, 409, field);
      assert.equal(denied.body.code, "EDIT_POLICY_DENIED", field);
      assert.match(denied.body.error, /can’t be changed|can't be changed|Recorded decisions/i, field);
    }
  });
});

describe("legalNextSignoffStatuses / Edit Release picker", () => {
  it("lists Approved / Rejected / Approved with Conditions / Withdrawn from Pending, not Expired", () => {
    const next = legalNextSignoffStatuses(config, "Pending").map((s) => s.label);
    assert.deepEqual(next, [
      "Approved",
      "Rejected",
      "Approved with Conditions",
      "Withdrawn",
    ]);
  });

  it("returns no next steps from a recorded Approved decision", () => {
    assert.deepEqual(legalNextSignoffStatuses(config, "Approved"), []);
    assert.deepEqual(legalNextSignoffStatuses(config, "Rejected"), []);
  });

  it("exposes all six decision types for the Edit Release form", () => {
    const rows = signoffDecisionTypesForForm(config);
    assert.deepEqual(
      rows.map((r) => r.field),
      [
        "devSignoff",
        "testSignoff",
        "uatSignoff",
        "securityClearance",
        "businessSignoff",
        "opsSignoff",
      ]
    );
    assert.ok(
      rows.some((r) => r.field === "businessSignoff" && r.label === "Business Review")
    );
    assert.ok(
      rows.some((r) => r.field === "opsSignoff" && r.label === "Operations Review")
    );
    assert.ok(
      rows.some(
        (r) => r.field === "testSignoff" && r.label === "QA Sign-Off — Test Phase"
      )
    );
    assert.ok(
      rows.some(
        (r) => r.field === "uatSignoff" && r.label === "QA Sign-Off — UAT Phase"
      )
    );
  });
});

describe("Edit Release form wiring", () => {
  it("renders all six sign-off fields on ReleaseFormModal", () => {
    const src = readFileSync(
      join(__dirname, "..", "components", "releases", "ReleaseFormModal.tsx"),
      "utf8"
    );
    for (const field of [
      "devSignoff",
      "testSignoff",
      "uatSignoff",
      "securityClearance",
      "businessSignoff",
      "opsSignoff",
    ]) {
      assert.match(src, new RegExp(field));
    }
    assert.match(src, /signoffDecisionTypesForForm/);
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
