/**
 * Run: npx tsx --test lib/entity-lifecycle-create-guard.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveCreateLifecycleStatus } from "./entity-lifecycle-create-guard";
import type { EntityLifecycleConfigLike } from "./entity-lifecycle-status-ui";

const config: EntityLifecycleConfigLike = {
  statuses: [
    {
      key: "pending",
      label: "Pending",
      sortOrder: 10,
      terminal: false,
      enabled: true,
    },
    {
      key: "met",
      label: "Met",
      sortOrder: 20,
      terminal: true,
      enabled: true,
    },
    {
      key: "legacy",
      label: "Blocked",
      sortOrder: 30,
      terminal: false,
      enabled: false,
    },
  ],
};

describe("resolveCreateLifecycleStatus", () => {
  it("accepts an enabled status label", () => {
    const result = resolveCreateLifecycleStatus(config, "Met", "dependency");
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.status, "Met");
      assert.equal(result.statusKey, "met");
    }
  });

  it("defaults to the first enabled non-terminal when status is empty", () => {
    const result = resolveCreateLifecycleStatus(config, "", "dependency");
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.status, "Pending");
      assert.equal(result.statusKey, "pending");
    }
  });

  it("rejects a disabled status", async () => {
    const result = resolveCreateLifecycleStatus(config, "Blocked", "dependency");
    assert.equal(result.ok, false);
    if (!result.ok) {
      const body = (await result.response.json()) as { error?: string };
      assert.equal(result.response.status, 400);
      assert.match(String(body.error ?? ""), /not enabled/i);
    }
  });
});
