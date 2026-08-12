/**
 * Release Lifecycle Settings UI helpers.
 * Run: npx tsx --test lib/release-lifecycle-settings-ui.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createDefaultReleaseLifecycleConfig,
  validateReleaseLifecycleConfig,
} from "./release-lifecycle-config";
import { RELEASE_LIFECYCLE_GATE_TYPES } from "./release-lifecycle-gates";
import {
  addLifecycleStatus,
  addLifecycleTransition,
  cloneLifecycleConfig,
  isAlwaysPassLifecycleGate,
  isHardBoundaryStatusKey,
  moveLifecycleStatus,
  partitionTransitionGateCatalog,
  removeLifecycleStatus,
  removeLifecycleTransition,
  reorderLifecycleStatuses,
  setLifecycleTransitionEnforcement,
  statusRemovalBlockReason,
  toggleLifecycleGate,
  toggleLifecycleStatus,
  toggleLifecycleTransition,
  transitionRemovalBlockReason,
} from "./release-lifecycle-settings-ui";

describe("statusRemovalBlockReason / removeLifecycleStatus", () => {
  it("blocks removing a system default even with zero usage", () => {
    const config = createDefaultReleaseLifecycleConfig();
    const draft = config.statuses.find((s) => s.key === "planning")!;
    assert.match(statusRemovalBlockReason(draft, 0) ?? "", /system default/);
    const result = removeLifecycleStatus(config, "planning", 0);
    assert.ok("error" in result);
  });

  it("blocks removing a hard-boundary status (deploying / deployed)", () => {
    assert.equal(isHardBoundaryStatusKey("deploying"), true);
    assert.equal(isHardBoundaryStatusKey("deployed"), true);
    const config = createDefaultReleaseLifecycleConfig();
    const result = removeLifecycleStatus(config, "deploying", 0);
    assert.ok("error" in result);
  });

  it("blocks removing a custom status that is in use by a real release", () => {
    const base = createDefaultReleaseLifecycleConfig();
    const added = addLifecycleStatus(base, "Hold Desk", false);
    assert.ok("config" in added);
    const custom = added.config.statuses.find((s) => s.label === "Hold Desk")!;
    assert.match(
      statusRemovalBlockReason(custom, 3) ?? "",
      /3 releases currently use/
    );
    const blocked = removeLifecycleStatus(added.config, custom.key, 3);
    assert.ok("error" in blocked);
    assert.match(blocked.error, /Cannot remove/);
  });

  it("allows removing an unused custom status and drops its transitions", () => {
    const base = createDefaultReleaseLifecycleConfig();
    const added = addLifecycleStatus(base, "Hold Desk", false);
    assert.ok("config" in added);
    const custom = added.config.statuses.find((s) => s.label === "Hold Desk")!;
    const withEdge = addLifecycleTransition(added.config, "planning", custom.key);
    assert.ok("config" in withEdge);
    const removed = removeLifecycleStatus(withEdge.config, custom.key, 0);
    assert.ok("config" in removed);
    assert.equal(
      removed.config.statuses.some((s) => s.key === custom.key),
      false
    );
    assert.equal(
      removed.config.transitions.some((t) => t.toKey === custom.key),
      false
    );
    assert.equal(validateReleaseLifecycleConfig(removed.config), null);
  });
});

describe("status toggle and reorder", () => {
  it("disables a default status and turns off its transitions", () => {
    const config = createDefaultReleaseLifecycleConfig();
    const off = toggleLifecycleStatus(config, "uat", false);
    assert.ok("config" in off);
    const uat = off.config.statuses.find((s) => s.key === "uat");
    assert.equal(uat?.enabled, false);
    assert.equal(
      off.config.transitions.some(
        (t) => t.enabled && (t.fromKey === "uat" || t.toKey === "uat")
      ),
      false
    );
    assert.equal(validateReleaseLifecycleConfig(off.config), null);
  });

  it("moves a status earlier in sortOrder for the timeline", () => {
    const config = createDefaultReleaseLifecycleConfig();
    const before = [...config.statuses]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((s) => s.key);
    const planningIdx = before.indexOf("planning");
    assert.ok(planningIdx > 0);
    const moved = moveLifecycleStatus(config, "planning", "up");
    assert.ok("config" in moved);
    const after = [...moved.config.statuses]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((s) => s.key);
    assert.equal(after[planningIdx - 1], "planning");
    assert.equal(validateReleaseLifecycleConfig(moved.config), null);
  });

  it("reorders statuses by full key list (drag-and-drop)", () => {
    const config = createDefaultReleaseLifecycleConfig();
    const keys = [...config.statuses]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((s) => s.key);
    const swapped = [keys[1]!, keys[0]!, ...keys.slice(2)];
    const result = reorderLifecycleStatuses(config, swapped);
    assert.ok("config" in result);
    const after = [...result.config.statuses]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((s) => s.key);
    assert.deepEqual(after.slice(0, 2), [keys[1], keys[0]]);
  });
});

describe("transition toggles", () => {
  it("toggles a transition on/off", () => {
    const config = createDefaultReleaseLifecycleConfig();
    const off = toggleLifecycleTransition(config, "draft", "planning", false);
    assert.ok("config" in off);
    const edge = off.config.transitions.find(
      (t) => t.fromKey === "draft" && t.toKey === "planning"
    );
    assert.equal(edge?.enabled, false);
  });

  it("removes a custom transition but blocks deleting system defaults", () => {
    const config = createDefaultReleaseLifecycleConfig();
    const system = config.transitions.find(
      (t) => t.fromKey === "draft" && t.toKey === "planning"
    )!;
    assert.match(transitionRemovalBlockReason(system) ?? "", /cannot be deleted/);
    assert.ok("error" in removeLifecycleTransition(config, "draft", "planning"));

    const added = addLifecycleTransition(config, "draft", "testing");
    assert.ok("config" in added);
    const removed = removeLifecycleTransition(added.config, "draft", "testing");
    assert.ok("config" in removed);
    assert.equal(
      removed.config.transitions.some(
        (t) => t.fromKey === "draft" && t.toKey === "testing"
      ),
      false
    );
  });

  it("warns when setting Required with no enabled gates", () => {
    const config = createDefaultReleaseLifecycleConfig();
    // draft→cancelled has no default checks — Required with an empty gate list warns.
    const result = setLifecycleTransitionEnforcement(
      config,
      "draft",
      "cancelled",
      "required"
    );
    assert.ok("config" in result);
    assert.match(result.warning ?? "", /no checks attached/);
  });

  it("adds a new transition between statuses", () => {
    const config = createDefaultReleaseLifecycleConfig();
    const result = addLifecycleTransition(config, "testing", "deferred");
    assert.ok("config" in result);
    assert.ok(
      result.config.transitions.some(
        (t) => t.fromKey === "testing" && t.toKey === "deferred"
      )
    );
  });
});

describe("gates panel helpers", () => {
  it("marks only unverifiable gates as always-pass UI warning", () => {
    // CAB scope snapshot is now reliable — no longer always-pass.
    assert.equal(isAlwaysPassLifecycleGate("scope_unchanged_since_cab"), false);
    assert.equal(isAlwaysPassLifecycleGate("environment_booked_for_deploy"), false);
    assert.equal(isAlwaysPassLifecycleGate("owner_set"), false);
  });

  it("toggles a catalog gate onto a transition", () => {
    const config = createDefaultReleaseLifecycleConfig();
    const on = toggleLifecycleGate(config, "draft", "planning", "owner_set", true);
    assert.ok("config" in on);
    const edge = on.config.transitions.find(
      (t) => t.fromKey === "draft" && t.toKey === "planning"
    );
    assert.ok(edge?.gates.some((g) => g.gateType === "owner_set" && g.enabled));
  });

  it("attaches required_fields_set with default approved fields", () => {
    const config = createDefaultReleaseLifecycleConfig();
    const on = toggleLifecycleGate(
      config,
      "draft",
      "cancelled",
      "required_fields_set",
      true
    );
    assert.ok("config" in on);
    const edge = on.config.transitions.find(
      (t) => t.fromKey === "draft" && t.toKey === "cancelled"
    );
    const gate = edge?.gates.find((g) => g.gateType === "required_fields_set");
    assert.ok(gate?.enabled);
    assert.deepEqual(gate?.params?.fields, ["owner", "priority", "releaseSize"]);
  });

  it("hides an enabled check from Available on that move", () => {
    const config = createDefaultReleaseLifecycleConfig();
    const before = config.transitions.find(
      (t) => t.fromKey === "draft" && t.toKey === "cancelled"
    )!;
    const catalogSize = RELEASE_LIFECYCLE_GATE_TYPES.length;
    assert.equal(partitionTransitionGateCatalog(before).attached.length, 0);
    assert.equal(partitionTransitionGateCatalog(before).available.length, catalogSize);

    const on = toggleLifecycleGate(config, "draft", "cancelled", "owner_set", true);
    assert.ok("config" in on);
    const after = on.config.transitions.find(
      (t) => t.fromKey === "draft" && t.toKey === "cancelled"
    )!;
    const { attached, available } = partitionTransitionGateCatalog(after);
    assert.deepEqual(attached, ["owner_set"]);
    assert.equal(available.length, catalogSize - 1);
    assert.ok(!available.includes("owner_set"));
  });
});

describe("cloneLifecycleConfig", () => {
  it("does not share nested references with the original", () => {
    const original = createDefaultReleaseLifecycleConfig();
    const originalGateCount = original.transitions[0]!.gates.length;
    const copy = cloneLifecycleConfig(original);
    copy.statuses[0]!.label = "Changed";
    copy.transitions[0]!.gates.push({
      gateType: "owner_set",
      enabled: true,
      enforcement: "inherit",
      sortOrder: 1,
    });
    assert.equal(original.statuses[0]!.label, "Draft");
    assert.equal(original.transitions[0]!.gates.length, originalGateCount);
  });
});
