/**
 * Run: npx tsx --test lib/signoff-record-actions.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createDefaultSignoffLifecycleConfig } from "@/lib/signoff-lifecycle-config";
import {
  isSignoffDecisionStillEditable,
  signoffDecisionControlEnabled,
  signoffDetailActionFlags,
  signoffListCreateAllowed,
  signoffManualNextLabels,
  signoffWithdrawTargetLabel,
  SIGNOFF_WITHDRAW_STATUS_KEY,
} from "@/lib/signoff-record-actions";

const config = createDefaultSignoffLifecycleConfig();
const withdrawnLabel = config.statuses.find((s) => s.key === SIGNOFF_WITHDRAW_STATUS_KEY)?.label;

describe("signoffDecisionControlEnabled (Record modal Decision field)", () => {
  it("enables Decision for create/intake and Pending so the second field is usable", () => {
    assert.equal(signoffDecisionControlEnabled(config, null), true);
    assert.equal(signoffDecisionControlEnabled(config, ""), true);
    assert.equal(signoffDecisionControlEnabled(config, "Pending"), true);
    const labels = signoffManualNextLabels(config, null);
    assert.ok(labels.length > 0);
    assert.ok(withdrawnLabel && labels.includes(withdrawnLabel));
  });

  it("disables Decision for terminal/immutable recorded decisions and missing config", () => {
    assert.equal(signoffDecisionControlEnabled(config, "Approved"), false);
    assert.equal(signoffDecisionControlEnabled(config, "Rejected"), false);
    assert.equal(signoffDecisionControlEnabled(config, "Approved with Conditions"), false);
    assert.equal(signoffDecisionControlEnabled(config, "Withdrawn"), false);
    assert.equal(signoffDecisionControlEnabled(config, "Expired"), false);
    assert.equal(signoffDecisionControlEnabled(null, "Pending"), false);
    assert.equal(signoffDecisionControlEnabled(config, "Not A Real Status"), false);
  });
});

describe("signoff detail Edit / Delete (withdraw) gating", () => {
  it("offers Edit and withdraw for an editor on a pending decision (main path)", () => {
    assert.equal(isSignoffDecisionStillEditable(config, "Pending"), true);
    const flags = signoffDetailActionFlags({
      roleCanEdit: true,
      config,
      status: "Pending",
    });
    assert.deepEqual(flags, { edit: true, withdraw: true });
    assert.equal(signoffWithdrawTargetLabel(config, "Pending"), withdrawnLabel);
    assert.equal(signoffListCreateAllowed(true), true);
  });

  it("hides Edit and Delete for terminal/immutable and for readonly (edge)", () => {
    assert.equal(isSignoffDecisionStillEditable(config, "Approved"), false);
    assert.deepEqual(
      signoffDetailActionFlags({ roleCanEdit: true, config, status: "Approved" }),
      { edit: false, withdraw: false }
    );
    assert.equal(signoffWithdrawTargetLabel(config, "Approved"), null);
    assert.deepEqual(
      signoffDetailActionFlags({ roleCanEdit: false, config, status: "Pending" }),
      { edit: false, withdraw: false }
    );
    assert.equal(signoffListCreateAllowed(false), false);
    assert.deepEqual(
      signoffDetailActionFlags({ roleCanEdit: true, config: null, status: "Pending" }),
      { edit: false, withdraw: false }
    );
  });

  it("follows configured labels and terminal/editMode flags, not English names", () => {
    const custom = createDefaultSignoffLifecycleConfig();
    const pending = custom.statuses.find((s) => s.key === "pending");
    const approved = custom.statuses.find((s) => s.key === "approved");
    const withdrawn = custom.statuses.find((s) => s.key === SIGNOFF_WITHDRAW_STATUS_KEY);
    assert.ok(pending && approved && withdrawn);
    pending.label = "Waiting";
    approved.label = "Go for launch";
    withdrawn.label = "Pulled back";
    assert.equal(signoffDecisionControlEnabled(custom, "Waiting"), true);
    assert.equal(signoffDecisionControlEnabled(custom, "Go for launch"), false);
    assert.deepEqual(
      signoffDetailActionFlags({ roleCanEdit: true, config: custom, status: "Waiting" }),
      { edit: true, withdraw: true }
    );
    assert.equal(signoffWithdrawTargetLabel(custom, "Waiting"), "Pulled back");
    assert.deepEqual(
      signoffDetailActionFlags({ roleCanEdit: true, config: custom, status: "Go for launch" }),
      { edit: false, withdraw: false }
    );
  });
});

describe("list create and detail chrome", () => {
  it("offers Create new record on the Sign-offs list for editors", () => {
    const src = readFileSync(
      join(__dirname, "..", "app", "(main)", "signoffs", "SignoffsContent.tsx"),
      "utf8"
    );
    assert.match(src, /signoffListCreateAllowed/);
    assert.match(src, /aria-label="Create new record"/);
    assert.match(src, /Add New Sign-off/);
  });

  it("gates detail Edit/Delete through lifecycle flags and withdraws instead of hard-delete", () => {
    const src = readFileSync(
      join(__dirname, "..", "app", "(main)", "signoffs", "[id]", "page.tsx"),
      "utf8"
    );
    assert.match(src, /signoffDetailActionFlags/);
    assert.match(src, /signoffWithdrawTargetLabel/);
    assert.doesNotMatch(src, /method:\s*"DELETE"/);
    assert.match(src, /<Edit3/);
    assert.match(src, />\s*Delete/);
    assert.match(src, /Withdraw this sign-off\?/);
  });
});
