import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { lifecycleStatusOptionHint } from "@/lib/lifecycle-status-option-hint";

describe("lifecycleStatusOptionHint", () => {
  it("explains a single hard gate failure for blocked steps", () => {
    const hint = lifecycleStatusOptionHint({
      outcome: "blocked",
      gates: [
        {
          label: "Post-deployment validation",
          reason: "Post-deployment validation is not complete (checklist must be 100%)",
          passed: false,
          hard: true,
        },
        {
          label: "PIR",
          reason: "Post-Implementation Review must be completed before Close",
          passed: true,
          hard: true,
        },
      ],
    });
    assert.match(hint ?? "", /checklist must be 100%/);
    assert.match(hint ?? "", /exception reason is not allowed/i);
  });

  it("lists multiple unmet hard checks", () => {
    const hint = lifecycleStatusOptionHint({
      outcome: "blocked",
      gates: [
        {
          label: "Validation",
          reason: "Checklist must be 100%",
          passed: false,
          hard: true,
        },
        {
          label: "PIR",
          reason: "PIR must be completed",
          passed: false,
          hard: true,
        },
      ],
    });
    assert.match(hint ?? "", /Checklist must be 100%/);
    assert.match(hint ?? "", /PIR must be completed/);
  });

  it("explains soft unmet checks for needs_override", () => {
    const hint = lifecycleStatusOptionHint({
      outcome: "needs_override",
      gates: [
        {
          label: "Owner",
          reason: "Release owner is required",
          passed: false,
          soft: true,
        },
      ],
    });
    assert.match(hint ?? "", /exception reason/i);
    assert.match(hint ?? "", /Release owner is required/);
  });

  it("returns undefined for allowed / current", () => {
    assert.equal(
      lifecycleStatusOptionHint({ outcome: "allowed", gates: [] }),
      undefined
    );
    assert.equal(lifecycleStatusOptionHint({ outcome: "current" }), undefined);
  });
});
