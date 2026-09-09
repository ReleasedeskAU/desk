/**
 * RD-120: Alerts status PATCH must accept the UI body and persist a legal next
 * status. Run: npx tsx --test lib/validation/monitoring-alert-patch.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDefaultAlertLifecycleConfig } from "@/lib/alert-lifecycle-config";
import { validateAlertTransition } from "@/lib/alert-lifecycle-transition";
import { persistResolvedStatus } from "@/lib/lifecycle-status-persist";
import {
  monitoringAlertPatchValidationBody,
  patchMonitoringAlertSchema,
} from "./monitoring-alert";

const config = createDefaultAlertLifecycleConfig();

/** Detail-page next-step button: only the target status label. */
const NEXT_STEP_BODY = { status: "Acknowledged" };

/** Edit-form save after choosing a legal next status — includes alertSource. */
const EDIT_FORM_STATUS_BODY = {
  timestamp: "2026-08-18",
  applicationId: "app_1",
  departmentName: null,
  alertType: "Warning",
  severity: "Critical",
  metric: "cpu",
  threshold: null,
  currentValue: null,
  status: "Acknowledged",
  assignedTo: null,
  environmentName: "UAT",
  notes: null,
  alertSource: "System" as const,
};

type PersistDecision =
  | { persist: true; status: string; statusKey: string }
  | {
      persist: false;
      error: string;
      code?: string;
      issues?: { path: string; message: string }[];
    };

/**
 * Mirrors PATCH /api/monitoring-alerts/[id] status write: schema then graph.
 * @param fromStatus - Stored alert status label
 * @param body - Client JSON
 */
function decideAlertStatusPersist(
  fromStatus: string,
  body: unknown
): PersistDecision {
  const parsed = patchMonitoringAlertSchema.safeParse(body);
  if (!parsed.success) {
    const validation = monitoringAlertPatchValidationBody(parsed.error);
    return { persist: false, ...validation };
  }
  const next = parsed.data.status;
  if (next === undefined || next === fromStatus) {
    return { persist: false, error: "No status change to persist" };
  }
  const transition = validateAlertTransition({
    config,
    fromStatus,
    toStatus: next,
    overrideReason: parsed.data.overrideReason ?? null,
  });
  if (!transition.allowed) {
    return {
      persist: false,
      error: transition.reason,
      code: transition.code,
    };
  }
  return {
    persist: true,
    ...persistResolvedStatus({
      key: transition.toKey,
      label: transition.canonicalStatus,
    }),
  };
}

describe("patchMonitoringAlertSchema Alerts UI payloads (RD-120)", () => {
  it("accepts a next-step status-only PATCH", () => {
    const parsed = patchMonitoringAlertSchema.safeParse(NEXT_STEP_BODY);
    assert.equal(parsed.success, true);
  });

  it("accepts the edit-form save body that includes alertSource", () => {
    const parsed = patchMonitoringAlertSchema.safeParse(EDIT_FORM_STATUS_BODY);
    assert.equal(parsed.success, true);
    if (!parsed.success) return;
    assert.equal(parsed.data.alertSource, "System");
    assert.equal(parsed.data.status, "Acknowledged");
  });
});

describe("alert status persist (RD-120)", () => {
  it("persists a legal next status from Active (main path)", () => {
    const nextStep = decideAlertStatusPersist("Active", NEXT_STEP_BODY);
    assert.equal(nextStep.persist, true);
    if (!nextStep.persist) return;
    assert.equal(nextStep.status, "Acknowledged");
    assert.equal(nextStep.statusKey, "acknowledged");

    const editForm = decideAlertStatusPersist("Active", EDIT_FORM_STATUS_BODY);
    assert.equal(editForm.persist, true);
    if (!editForm.persist) return;
    assert.equal(editForm.status, "Acknowledged");
    assert.equal(editForm.statusKey, "acknowledged");
  });

  it("does not persist an illegal transition and returns a client-safe reason", () => {
    const decision = decideAlertStatusPersist("Active", { status: "Resolved" });
    assert.equal(decision.persist, false);
    if (decision.persist) return;
    assert.equal(decision.code, "ILLEGAL_TRANSITION");
    assert.notEqual(decision.error, "Validation failed");
    assert.match(decision.error, /not allowed by the alert lifecycle/i);
  });

  it("does not persist a blank status and surfaces the field error (Validation failed regression)", () => {
    const decision = decideAlertStatusPersist("Active", { status: "   " });
    assert.equal(decision.persist, false);
    if (decision.persist) return;
    assert.notEqual(decision.error, "Validation failed");
    assert.match(decision.error, /status:/i);
    assert.ok(decision.issues?.some((i) => i.path === "status"));
  });

  it("rejects an unknown extra field with the specific key, not a generic Validation failed", () => {
    const parsed = patchMonitoringAlertSchema.safeParse({
      status: "Acknowledged",
      inventedField: "nope",
    });
    assert.equal(parsed.success, false);
    if (parsed.success) return;
    const body = monitoringAlertPatchValidationBody(parsed.error);
    assert.notEqual(body.error, "Validation failed");
    assert.match(body.error, /unrecognized key/i);
    assert.match(body.error, /inventedField/i);
  });
});
