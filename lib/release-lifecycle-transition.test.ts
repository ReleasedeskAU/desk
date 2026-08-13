import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDefaultReleaseLifecycleConfig } from "@/lib/release-lifecycle-config";
import {
  buildLifecycleStepperModel,
  emptyLifecycleGateFacts,
  listLegalNextStatuses,
  resolveLifecycleStatusRef,
  validateReleaseTransition,
} from "@/lib/release-lifecycle-transition";
import {
  enforceReleaseStatusChange,
  statusEnforcementDeniedResponse,
  type ReleaseStatusPatchRelease,
} from "@/lib/release-lifecycle-status-patch";

const config = createDefaultReleaseLifecycleConfig();

const baseFacts = emptyLifecycleGateFacts({
  owner: "Ada",
  releaseSize: "M",
  priority: "P2",
  name: "Ada Release",
  applicationCount: 1,
  startDate: new Date("2026-08-01"),
  releaseDate: new Date("2026-09-01"),
  notes: "Decision recorded",
  rollbackPlan: "Rollback to v1",
  goLiveChecklistPercent: 100,
  openBlockerCount: 0,
  openIncidentCount: 0,
  openEnvironmentConflictCount: 0,
  expiredEnvBookingCount: 0,
  changeFreezeActive: false,
  deploymentOutcomeConfirmed: true,
  testSignoffComplete: true,
  dressRehearsalComplete: true,
  opsSignoffComplete: true,
  incompleteWorkItemCount: 0,
  pirComplete: true,
  scopeDescription: "Initial scope",
  cabScopeSnapshot: {
    releaseSize: "M",
    priority: "P2",
    scopeDescription: "Initial scope",
  },
  hardDependenciesMet: true,
  hasDeployBooking: true,
  signoffsComplete: true,
});

describe("resolveLifecycleStatusRef", () => {
  it("matches by key and by label (case-insensitive)", () => {
    assert.equal(resolveLifecycleStatusRef(config, "draft")?.key, "draft");
    assert.equal(resolveLifecycleStatusRef(config, "Planning")?.key, "planning");
    assert.equal(resolveLifecycleStatusRef(config, "READY TO DEPLOY")?.key, "ready_to_deploy");
  });

  it("does not alias legacy labels like Planned", () => {
    assert.equal(resolveLifecycleStatusRef(config, "Planned"), null);
    assert.equal(resolveLifecycleStatusRef(config, "In Progress"), null);
  });
});

describe("validateReleaseTransition", () => {
  it("allows a legal next status when gates pass", () => {
    const result = validateReleaseTransition({
      config,
      fromStatus: "Draft",
      toStatus: "planning",
      gateFacts: baseFacts,
    });
    assert.equal(result.allowed, true);
    if (!result.allowed) return;
    assert.equal(result.overridden, false);
    assert.equal(result.canonicalStatus, "Planning");
  });

  it("blocks an illegal jump (draft → deployed)", () => {
    const result = validateReleaseTransition({
      config,
      fromStatus: "draft",
      toStatus: "deployed",
      gateFacts: baseFacts,
    });
    assert.equal(result.allowed, false);
    if (result.allowed) return;
    assert.equal(result.code, "ILLEGAL_TRANSITION");
    assert.match(result.reason, /isn’t allowed from here/);
  });

  it("blocks unknown/legacy current status without aliasing", () => {
    const result = validateReleaseTransition({
      config,
      fromStatus: "Planned",
      toStatus: "Planning",
      gateFacts: baseFacts,
    });
    assert.equal(result.allowed, false);
    if (result.allowed) return;
    assert.equal(result.code, "UNKNOWN_STATUS");
  });

  it("requires overrideReason when Flexible gates are unmet", () => {
    const needs = validateReleaseTransition({
      config,
      fromStatus: "planning",
      toStatus: "testing",
      gateFacts: emptyLifecycleGateFacts({ owner: null, releaseSize: null }),
    });
    assert.equal(needs.allowed, false);
    if (needs.allowed) return;
    assert.equal(needs.code, "TRANSITION_NEEDS_OVERRIDE");
    assert.ok((needs.unmetReasons ?? []).length >= 1);

    const overridden = validateReleaseTransition({
      config,
      fromStatus: "planning",
      toStatus: "testing",
      overrideReason: "Proceeding with size TBD — approved by RM",
      gateFacts: emptyLifecycleGateFacts({ owner: null, releaseSize: null }),
    });
    assert.equal(overridden.allowed, true);
    if (!overridden.allowed) return;
    assert.equal(overridden.overridden, true);
  });

  it("hard-blocks Required gates with no override path", () => {
    const requiredConfig = createDefaultReleaseLifecycleConfig();
    const edge = requiredConfig.transitions.find(
      (t) => t.fromKey === "planning" && t.toKey === "testing"
    )!;
    edge.enforcement = "required";
    for (const gate of edge.gates) gate.enforcement = "inherit";

    const result = validateReleaseTransition({
      config: requiredConfig,
      fromStatus: "planning",
      toStatus: "testing",
      overrideReason: "please let me through",
      gateFacts: emptyLifecycleGateFacts({ owner: null, releaseSize: null }),
    });
    assert.equal(result.allowed, false);
    if (result.allowed) return;
    assert.equal(result.code, "TRANSITION_BLOCKED");
  });

  it("supports previous-status return from Blocked when hint matches", () => {
    const result = validateReleaseTransition({
      config,
      fromStatus: "blocked",
      toStatus: "planning",
      previousStatus: "Planning",
      gateFacts: emptyLifecycleGateFacts({ openBlockerCount: 0 }),
    });
    assert.equal(result.allowed, true);
  });

  it("allows Blocked → Testing without a previousStatus hint (sheet: any previous)", () => {
    const result = validateReleaseTransition({
      config,
      fromStatus: "Blocked",
      toStatus: "Testing",
      previousStatus: null,
      gateFacts: emptyLifecycleGateFacts({ openBlockerCount: 0 }),
    });
    assert.equal(result.allowed, true);
  });
});

describe("listLegalNextStatuses / stepper", () => {
  it("lists only legal next statuses with soft gate flags", () => {
    const next = listLegalNextStatuses({
      config,
      fromStatus: "Planning",
      gateFacts: emptyLifecycleGateFacts({ owner: null, releaseSize: null }),
    });
    const testing = next.find((n) => n.key === "testing");
    assert.ok(testing);
    assert.equal(testing!.outcome, "needs_override");
    assert.ok(testing!.gates.some((g) => g.soft));
    assert.equal(
      next.some((n) => n.key === "deployed"),
      false
    );
  });

  it("lists mainline returns from Blocked, not only Cancelled", () => {
    const next = listLegalNextStatuses({
      config,
      fromStatus: "Blocked",
      previousStatus: null,
      gateFacts: emptyLifecycleGateFacts({ openBlockerCount: 0 }),
    });
    const labels = next.map((n) => n.label).sort();
    assert.ok(labels.includes("Cancelled"));
    assert.ok(labels.includes("Planning"));
    assert.ok(labels.includes("Testing"));
    assert.ok(labels.includes("UAT"));
    assert.equal(labels.includes("Blocked"), false);
    assert.equal(labels.includes("Closed"), false);
  });

  it("builds mainline rail and interrupt panels", () => {
    const model = buildLifecycleStepperModel({
      config,
      currentStatus: "Blocked",
    });
    assert.ok(model.mainline.some((s) => s.key === "draft"));
    assert.ok(model.interruptPanels.some((p) => p.key === "blocked" && p.active));
    assert.equal(
      model.mainline.every((s) => s.state === "upcoming"),
      true
    );
  });

  it("allows Testing → Planning and Rolled Back → Cancelled from the default graph", () => {
    const toPlanning = validateReleaseTransition({
      config,
      fromStatus: "Testing",
      toStatus: "Planning",
      gateFacts: baseFacts,
    });
    assert.equal(toPlanning.allowed, true);

    const toCancelled = validateReleaseTransition({
      config,
      fromStatus: "Rolled Back",
      toStatus: "Cancelled",
      gateFacts: baseFacts,
    });
    assert.equal(toCancelled.allowed, true);
  });

  it("VR-27: high-score risks without a mitigation plan need override before Ready", () => {
    const denied = validateReleaseTransition({
      config,
      fromStatus: "CAB Approved",
      toStatus: "Ready to deploy",
      gateFacts: { ...baseFacts, unmitigatedHighRiskCount: 1 },
    });
    assert.equal(denied.allowed, false);
    if (!denied.allowed) {
      assert.equal(denied.code, "TRANSITION_NEEDS_OVERRIDE");
      assert.ok((denied.unmetReasons ?? []).some((r) => /mitigation plan/i.test(r)));
    }

    const ok = validateReleaseTransition({
      config,
      fromStatus: "CAB Approved",
      toStatus: "Ready to deploy",
      gateFacts: baseFacts,
    });
    assert.equal(ok.allowed, true);
  });

  it("Wave A: Ready → Deploying needs override when VR-19/VR-18 facts fail (flexible)", () => {
    const denied = validateReleaseTransition({
      config,
      fromStatus: "Ready to deploy",
      toStatus: "Deploying",
      gateFacts: emptyLifecycleGateFacts({
        hasDeployBooking: false,
        hardDependenciesMet: false,
      }),
    });
    assert.equal(denied.allowed, false);
    if (!denied.allowed) {
      assert.equal(denied.code, "TRANSITION_NEEDS_OVERRIDE");
    }

    const overridden = validateReleaseTransition({
      config,
      fromStatus: "Ready to deploy",
      toStatus: "Deploying",
      overrideReason: "emergency deploy window",
      gateFacts: emptyLifecycleGateFacts({
        hasDeployBooking: false,
        hardDependenciesMet: false,
      }),
    });
    assert.equal(overridden.allowed, true);
  });

  it("hard-blocks Deploying → Deployed when deployment outcome is unconfirmed (§4-08 / CFG-06)", () => {
    const denied = validateReleaseTransition({
      config,
      fromStatus: "Deploying",
      toStatus: "Deployed",
      overrideReason: "please let me through",
      gateFacts: emptyLifecycleGateFacts({
        deploymentOutcomeConfirmed: false,
      }),
    });
    assert.equal(denied.allowed, false);
    if (!denied.allowed) {
      assert.equal(denied.code, "TRANSITION_BLOCKED");
    }

    const ok = validateReleaseTransition({
      config,
      fromStatus: "Deploying",
      toStatus: "Deployed",
      gateFacts: emptyLifecycleGateFacts({
        deploymentOutcomeConfirmed: true,
      }),
    });
    assert.equal(ok.allowed, true);
  });

  it("requires notes for Deferred → Pending CAB and Rejected → Planning", () => {
    const deferredDenied = validateReleaseTransition({
      config,
      fromStatus: "Deferred",
      toStatus: "Pending CAB",
      gateFacts: emptyLifecycleGateFacts({ notes: null }),
    });
    assert.equal(deferredDenied.allowed, false);

    const rejectedOk = validateReleaseTransition({
      config,
      fromStatus: "Rejected",
      toStatus: "Planning",
      gateFacts: emptyLifecycleGateFacts({ notes: "Rework started" }),
    });
    assert.equal(rejectedOk.allowed, true);
  });

  it("keeps a disabled current status on the rail and blocks moves into disabled targets", () => {
    const draft = {
      ...config,
      statuses: config.statuses.map((s) =>
        s.key === "uat" ? { ...s, enabled: false } : s
      ),
      transitions: config.transitions.map((t) =>
        t.fromKey === "uat" || t.toKey === "uat" ? { ...t, enabled: false } : t
      ),
    };
    const model = buildLifecycleStepperModel({
      config: draft,
      currentStatus: "UAT",
    });
    assert.ok(model.mainline.some((s) => s.key === "uat" && s.state === "current"));
    const denied = validateReleaseTransition({
      config: draft,
      fromStatus: "Testing",
      toStatus: "UAT",
      gateFacts: baseFacts,
    });
    assert.equal(denied.allowed, false);
  });
});

describe("enforceReleaseStatusChange (PATCH path)", () => {
  const release: ReleaseStatusPatchRelease = {
    id: "rel_1",
    releaseCode: "REL-0001",
    status: "Draft",
    name: "Ada Release",
    owner: "Ada",
    releaseSize: "M",
    priority: "P2",
    startDate: new Date("2026-08-01"),
    releaseDate: new Date("2026-09-01"),
    rollbackPlan: "Rollback to v1",
    goLiveChecklistPercent: 100,
    lifecycleConfigVersionId: null,
  };

  it("rejects an illegal transition with the API denial shape (422)", async () => {
    const denial = await enforceReleaseStatusChange(
      {
        clerkUserId: "user_test",
        release,
        requestedStatus: "Deployed",
      },
      {
        resolveConfig: async () => ({
          config,
          versionId: "ver_latest",
          version: 1,
          configPin: "latest-unpinned",
        }),
        loadGateFacts: async () => baseFacts,
        loadPreviousStatus: async () => null,
      }
    );
    assert.equal(denial.ok, false);
    if (denial.ok) return;
    const http = statusEnforcementDeniedResponse(denial);
    assert.equal(http.status, 422);
    assert.equal(http.body.code, "ILLEGAL_TRANSITION");
    assert.equal(http.body.configPin, "latest-unpinned");
    assert.equal(http.body.transition.allowed, false);
  });

  it("allows a legal transition and returns canonical label", async () => {
    const ok = await enforceReleaseStatusChange(
      {
        clerkUserId: "user_test",
        release,
        requestedStatus: "planning",
      },
      {
        resolveConfig: async () => ({
          config,
          versionId: "ver_1",
          version: 1,
          configPin: "pinned",
        }),
        loadGateFacts: async () => baseFacts,
        loadPreviousStatus: async () => null,
      }
    );
    assert.equal(ok.ok, true);
    if (!ok.ok) return;
    assert.equal(ok.canonicalStatus, "Planning");
    assert.equal(ok.configPin, "pinned");
  });

  it("returns 422 TRANSITION_NEEDS_OVERRIDE when Flexible gates fail without reason", async () => {
    const denial = await enforceReleaseStatusChange(
      {
        clerkUserId: "user_test",
        release: { ...release, status: "Planning", owner: "", releaseSize: null },
        requestedStatus: "Testing",
      },
      {
        resolveConfig: async () => ({
          config,
          versionId: null,
          version: null,
          configPin: "latest-unpinned",
        }),
        loadGateFacts: async () =>
          emptyLifecycleGateFacts({ owner: "", releaseSize: null }),
        loadPreviousStatus: async () => "Draft",
      }
    );
    assert.equal(denial.ok, false);
    if (denial.ok) return;
    assert.equal(denial.httpStatus, 422);
    assert.equal(denial.body.code, "TRANSITION_NEEDS_OVERRIDE");
    assert.ok((denial.body.transition.unmetReasons ?? []).length >= 1);
  });
});
