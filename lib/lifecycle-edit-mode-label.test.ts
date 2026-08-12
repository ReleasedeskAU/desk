import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { lifecycleEditModeLabel } from "@/lib/lifecycle-edit-mode-label";

describe("lifecycleEditModeLabel", () => {
  it("maps known edit modes to plain phrases", () => {
    assert.equal(
      lifecycleEditModeLabel("immutable"),
      "After this status: no further edits"
    );
    assert.equal(
      lifecycleEditModeLabel("read_only"),
      "View-only in this status"
    );
    assert.equal(
      lifecycleEditModeLabel("read-only"),
      "View-only in this status"
    );
    assert.equal(
      lifecycleEditModeLabel("limited"),
      "Limited edits in this status"
    );
    assert.equal(
      lifecycleEditModeLabel("full"),
      "Editable in this status"
    );
  });

  it("returns unknown modes unchanged", () => {
    assert.equal(lifecycleEditModeLabel("custom_mode"), "custom_mode");
  });
});
