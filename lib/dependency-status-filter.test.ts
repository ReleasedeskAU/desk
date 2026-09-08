/**
 * RD-117: Dependencies list Status filter options come from enabled
 * lifecycle labels and are rendered with the shared FilterSelect.
 *
 * Run: npx tsx --test lib/dependency-status-filter.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createDefaultDependencyLifecycleConfig } from "./dependency-lifecycle-config";
import {
  enabledEntityStatusLabels,
  entityStatusFilterOptions,
} from "./entity-lifecycle-status-ui";

const LIST_SRC = join(
  __dirname,
  "..",
  "app/(main)/dependencies/DependencyListContent.tsx"
);

describe("RD-117 dependency list status filter", () => {
  it("offers enabled dependency lifecycle labels as the FilterSelect source", () => {
    const config = createDefaultDependencyLifecycleConfig();
    const options = entityStatusFilterOptions(config, []);
    const enabled = enabledEntityStatusLabels(config);

    assert.deepEqual(options, enabled);
    assert.ok(enabled.length > 0);
    assert.equal(
      enabled.length,
      config.statuses.filter((s) => s.enabled).length
    );

    const src = readFileSync(LIST_SRC, "utf8");
    assert.match(src, /lifecycle\.filterOptions\(deps\.map\(\(d\) => d\.status\)\)/);
    const statusBlock = src.slice(
      src.indexOf('isFilterVisible("status")'),
      src.indexOf('isFilterVisible("dependencyType")')
    );
    assert.match(statusBlock, /<FilterSelect/);
    assert.doesNotMatch(statusBlock, /<FilterPills/);
    assert.doesNotMatch(src, /FilterPills/);
  });

  it("uses a renamed tenant label and omits statuses that are not enabled unless already in use", () => {
    const config = createDefaultDependencyLifecycleConfig();
    const identified = config.statuses.find((s) => s.key === "identified");
    const removed = config.statuses.find((s) => s.key === "removed");
    assert.ok(identified);
    assert.ok(removed);
    identified.label = "Spotted";
    removed.enabled = false;

    const withoutInUse = entityStatusFilterOptions(config, ["Spotted", "Blocked"]);
    assert.ok(withoutInUse.includes("Spotted"));
    assert.ok(!withoutInUse.includes("Identified"));
    assert.ok(!withoutInUse.includes("Removed"));

    const withInUse = entityStatusFilterOptions(config, [
      "Spotted",
      "Removed",
      "Unknown-Off",
    ]);
    assert.ok(withInUse.includes("Spotted"));
    assert.ok(withInUse.includes("Removed"));
    assert.ok(withInUse.includes("Unknown-Off"));
  });
});
