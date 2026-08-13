/**
 * Release lifecycle status SSOT helpers.
 * Run: npx tsx --test lib/release-lifecycle-status-ui.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createDefaultReleaseLifecycleConfig, withReleaseStatusRoles } from "./release-lifecycle-config";
import {
  attentionStatusLabels,
  bucketReleaseStatusWithConfig,
  defaultReleaseStatusLabel,
  editReleaseStatusOptions,
  enabledReleaseStatusLabels,
  isEnabledReleaseStatusLabel,
  previewEditLegalNext,
  releaseStatusFilterOptions,
  resolveReleaseStatusDisplay,
  toneForLifecycleKind,
} from "./release-lifecycle-status-ui";

describe("enabledReleaseStatusLabels / filter options", () => {
  it("lists enabled labels in sort order and includes custom enabled unused", () => {
    const config = createDefaultReleaseLifecycleConfig();
    config.statuses.push(
      withReleaseStatusRoles({
        key: "hold_custom",
        label: "Hold Review",
        sortOrder: 25,
        terminal: false,
        kind: "branch",
        isSystem: false,
        enabled: true,
        editMode: "full",
      })
    );
    const labels = enabledReleaseStatusLabels(config);
    assert.ok(labels.includes("Hold Review"));
    assert.ok(labels.includes("Draft"));
    assert.ok(labels.indexOf("Draft") < labels.indexOf("Hold Review"));
  });

  it("hides Off unused but keeps Off-in-use after enabled list", () => {
    const config = createDefaultReleaseLifecycleConfig();
    const planning = config.statuses.find((s) => s.key === "planning")!;
    planning.enabled = false;
    const options = releaseStatusFilterOptions(config, ["Planning", "Draft"]);
    assert.ok(options.includes("Draft"));
    assert.ok(options.includes("Planning"));
    assert.ok(options.indexOf("Draft") < options.indexOf("Planning"));

    const withoutUsage = releaseStatusFilterOptions(config, ["Draft"]);
    assert.ok(!withoutUsage.includes("Planning"));
  });
});

describe("resolveReleaseStatusDisplay / attention", () => {
  it("resolves known status tone from kind and flags Off", () => {
    const config = createDefaultReleaseLifecycleConfig();
    config.statuses.find((s) => s.key === "blocked")!.enabled = false;
    const display = resolveReleaseStatusDisplay(config, "Blocked");
    assert.equal(display.known, true);
    assert.equal(display.enabled, false);
    assert.equal(display.tone, "bad");
    assert.equal(display.label, "Blocked");
  });

  it("returns neutral for unknown labels", () => {
    const config = createDefaultReleaseLifecycleConfig();
    const display = resolveReleaseStatusDisplay(config, "Weird Status");
    assert.equal(display.known, false);
    assert.equal(display.tone, "neutral");
  });

  it("attention labels are enabled interrupt statuses only", () => {
    const config = createDefaultReleaseLifecycleConfig();
    config.statuses.find((s) => s.key === "rolled_back")!.enabled = false;
    const labels = attentionStatusLabels(config);
    assert.deepEqual(labels, ["Blocked"]);
    assert.ok(!labels.includes("At Risk"));
  });
});

describe("defaults and buckets", () => {
  it("default label prefers first enabled mainline", () => {
    const config = createDefaultReleaseLifecycleConfig();
    assert.equal(defaultReleaseStatusLabel(config), "Draft");
    config.statuses.find((s) => s.key === "draft")!.enabled = false;
    assert.equal(defaultReleaseStatusLabel(config), "Planning");
  });

  it("isEnabledReleaseStatusLabel rejects Off and unknown", () => {
    const config = createDefaultReleaseLifecycleConfig();
    config.statuses.find((s) => s.key === "planning")!.enabled = false;
    assert.equal(isEnabledReleaseStatusLabel(config, "Draft"), true);
    assert.equal(isEnabledReleaseStatusLabel(config, "Planning"), false);
    assert.equal(isEnabledReleaseStatusLabel(config, "Nope"), false);
  });

  it("bucketReleaseStatusWithConfig uses kind when config provided", () => {
    const config = createDefaultReleaseLifecycleConfig();
    assert.equal(bucketReleaseStatusWithConfig("Blocked", config), "blocked");
    assert.equal(bucketReleaseStatusWithConfig("Deployed", config), "shipped");
    assert.equal(bucketReleaseStatusWithConfig("Deferred", config), "atRisk");
    assert.equal(toneForLifecycleKind("mainline"), "info");
  });
});

describe("editReleaseStatusOptions", () => {
  it("lists current plus legal next and disables blocked steps", () => {
    const options = editReleaseStatusOptions("Pending CAB", [
      { label: "CAB Approved", outcome: "allowed" },
      { label: "Rejected", outcome: "needs_override" },
      { label: "Blocked", outcome: "blocked" },
    ]);
    assert.deepEqual(
      options.map((o) => o.label),
      ["Pending CAB", "CAB Approved", "Rejected", "Blocked"]
    );
    assert.equal(options.some((o) => o.label === "Rolled Back"), false);
    assert.equal(options.find((o) => o.label === "Blocked")?.disabled, true);
    assert.equal(options.find((o) => o.label === "Rejected")?.disabled, false);
  });
});

describe("previewEditLegalNext", () => {
  it("lists Draft exits from the default graph without a DB round", () => {
    const next = previewEditLegalNext("Draft", undefined, {
      name: "CRM cutover",
      applicationCount: 1,
    });
    assert.deepEqual(
      next.map((s) => s.label).sort(),
      ["Cancelled", "Planning"]
    );
    assert.equal(next.find((s) => s.label === "Planning")?.outcome, "allowed");
  });
});
