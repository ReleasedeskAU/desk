/**
 * Run: npx tsx --test lib/signoff-lifecycle-spec-reconcile.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createDefaultSignoffLifecycleConfig } from "@/lib/signoff-lifecycle-config";
import { reconcileSignoffLifecycleSpec } from "@/lib/signoff-lifecycle-spec-reconcile";
import {
  mandatorySignoffsComplete,
  signoffDecisionTypesForForm,
} from "@/lib/signoff-lifecycle-transition";

describe("reconcileSignoffLifecycleSpec", () => {
  it("restores Business → businessSignoff and Ops → opsSignoff when stored fields drifted", () => {
    const drifted = createDefaultSignoffLifecycleConfig();
    const business = drifted.types.find((type) => type.key === "business");
    const ops = drifted.types.find((type) => type.key === "ops");
    const training = drifted.types.find((type) => type.key === "training");
    const dress = drifted.types.find((type) => type.key === "dress_rehearsal");
    assert.ok(business && ops && training && dress);
    // Live screenshot: Business showed trainingStatus, Ops showed dressRehearsal.
    business.releaseField = "trainingStatus";
    training.releaseField = "businessSignoff";
    ops.releaseField = "dressRehearsal";
    dress.releaseField = "opsSignoff";

    const reconciled = reconcileSignoffLifecycleSpec(drifted);
    assert.equal(
      reconciled.types.find((type) => type.key === "business")?.releaseField,
      "businessSignoff"
    );
    assert.equal(
      reconciled.types.find((type) => type.key === "ops")?.releaseField,
      "opsSignoff"
    );
    assert.equal(
      reconciled.types.find((type) => type.key === "training")?.releaseField,
      "trainingStatus"
    );
    assert.equal(
      reconciled.types.find((type) => type.key === "dress_rehearsal")?.releaseField,
      "dressRehearsal"
    );
  });

  it("rewrites leftover default labels without merging Test and UAT", () => {
    const stored = createDefaultSignoffLifecycleConfig();
    const test = stored.types.find((type) => type.key === "test");
    const uat = stored.types.find((type) => type.key === "uat");
    const custom = stored.types.find((type) => type.key === "dev");
    assert.ok(test && uat && custom);
    test.label = "Test";
    uat.label = "UAT";
    custom.label = "Engineering Review";

    const reconciled = reconcileSignoffLifecycleSpec(stored);
    assert.equal(
      reconciled.types.find((type) => type.key === "test")?.label,
      "QA Sign-Off — Test Phase"
    );
    assert.equal(
      reconciled.types.find((type) => type.key === "uat")?.label,
      "QA Sign-Off — UAT Phase"
    );
    assert.equal(
      reconciled.types.find((type) => type.key === "dev")?.label,
      "Engineering Review"
    );
    assert.equal(reconciled.types.filter((type) => type.key === "test").length, 1);
    assert.equal(reconciled.types.filter((type) => type.key === "uat").length, 1);
  });

  it("makes Business completeness read businessSignoff, not trainingStatus", () => {
    const drifted = createDefaultSignoffLifecycleConfig();
    const business = drifted.types.find((type) => type.key === "business");
    const training = drifted.types.find((type) => type.key === "training");
    assert.ok(business && training);
    business.releaseField = "trainingStatus";
    training.releaseField = "businessSignoff";

    const facts = {
      releaseSize: "Medium",
      devSignoff: "Approved",
      testSignoff: "Approved",
      uatSignoff: "Approved",
      securityClearance: "Approved",
      businessSignoff: "Approved",
      trainingStatus: "",
    };
    assert.equal(mandatorySignoffsComplete(drifted, facts), false);

    const reconciled = reconcileSignoffLifecycleSpec(drifted);
    assert.equal(mandatorySignoffsComplete(reconciled, facts), true);

    const formRows = signoffDecisionTypesForForm(reconciled);
    const businessRow = formRows.find((row) => row.field === "businessSignoff");
    assert.equal(businessRow?.label, "Business Review");
  });
});

describe("Edit Release Business field write path", () => {
  it("binds the Business Review control to form.businessSignoff and saves that column", () => {
    const src = readFileSync(
      join(__dirname, "..", "components", "releases", "ReleaseFormModal.tsx"),
      "utf8"
    );
    assert.match(src, /value=\{form\[type\.field\]\}/);
    assert.match(src, /onChange=\{\(next\) => set\(type\.field, next\)\}/);
    assert.match(src, /businessSignoff: form\.businessSignoff\.trim\(\) \|\| null/);
    assert.doesNotMatch(
      src,
      /businessSignoff: form\.trainingStatus/
    );
  });
});

describe("Statuses tab meaning vs availability copy", () => {
  it("explains role flags separately from the availability toggle", () => {
    const meaning = readFileSync(
      join(
        __dirname,
        "..",
        "components",
        "settings",
        "lifecycle",
        "StatusMeaningEditor.tsx"
      ),
      "utf8"
    );
    assert.match(meaning, /What this status means/);
    assert.match(
      meaning,
      /separate from whether it&apos;s turned on above/
    );
    assert.match(
      meaning,
      /Only one status can hold this role — turning this on will turn it off elsewhere/
    );

    const availability = readFileSync(
      join(
        __dirname,
        "..",
        "components",
        "settings",
        "lifecycle",
        "StatusAvailabilityToggle.tsx"
      ),
      "utf8"
    );
    assert.match(availability, /In the workflow/);
    assert.match(availability, /Separate from the meaning flags below/);
  });
});
