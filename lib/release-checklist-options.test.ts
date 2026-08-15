import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  RELEASE_PLAN_PROGRESS_OPTIONS,
  selectOptionsWithCurrent,
} from "./release-checklist-options";

describe("selectOptionsWithCurrent", () => {
  it("keeps an off-list stored value so Edit does not wipe it", () => {
    const opts = selectOptionsWithCurrent(RELEASE_PLAN_PROGRESS_OPTIONS, "In Review");
    assert.equal(opts[0], "In Review");
    assert.ok(opts.includes("Ready"));
  });

  it("does not duplicate a known value", () => {
    const opts = selectOptionsWithCurrent(RELEASE_PLAN_PROGRESS_OPTIONS, "Ready");
    assert.equal(opts.filter((v) => v === "Ready").length, 1);
  });
});
