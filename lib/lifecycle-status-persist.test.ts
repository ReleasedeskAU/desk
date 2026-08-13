/**
 * Run: npx tsx --test lib/lifecycle-status-persist.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { persistResolvedStatus } from "./lifecycle-status-persist";

describe("persistResolvedStatus", () => {
  it("stores the display label in status and the graph key in statusKey", () => {
    const persisted = persistResolvedStatus({
      key: "identified",
      label: "Identified",
    });
    assert.deepEqual(persisted, { status: "Identified", statusKey: "identified" });
  });

  it("keeps a renamed label paired with the same key", () => {
    const persisted = persistResolvedStatus({
      key: "open",
      label: "Raised",
    });
    assert.equal(persisted.statusKey, "open");
    assert.equal(persisted.status, "Raised");
  });
});
