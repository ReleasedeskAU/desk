/**
 * Run: npx tsx --test lib/entity-lifecycle-status-ui.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  defaultEntityStatusLabel,
  enabledEntityStatusLabels,
  entityStatusFilterOptions,
  isEnabledEntityStatusLabel,
  openEntityStatusLabels,
  resolveEntityStatusDisplay,
  type EntityLifecycleConfigLike,
} from "./entity-lifecycle-status-ui";

const sample: EntityLifecycleConfigLike = {
  statuses: [
    {
      key: "open",
      label: "Open",
      sortOrder: 10,
      terminal: false,
      enabled: true,
    },
    {
      key: "escalated",
      label: "Escalated",
      sortOrder: 20,
      terminal: false,
      enabled: true,
    },
    {
      key: "closed",
      label: "Closed",
      sortOrder: 30,
      terminal: true,
      enabled: true,
    },
    {
      key: "legacy",
      label: "Legacy Off",
      sortOrder: 40,
      terminal: false,
      enabled: false,
    },
  ],
};

describe("entity lifecycle status SSOT helpers", () => {
  it("lists enabled labels and default prefers non-terminal", () => {
    assert.deepEqual(enabledEntityStatusLabels(sample), [
      "Open",
      "Escalated",
      "Closed",
    ]);
    assert.equal(defaultEntityStatusLabel(sample), "Open");
  });

  it("keeps Off-in-use in filter options", () => {
    const options = entityStatusFilterOptions(sample, ["Open", "Legacy Off"]);
    assert.ok(options.includes("Open"));
    assert.ok(options.includes("Legacy Off"));
    assert.ok(!entityStatusFilterOptions(sample, ["Open"]).includes("Legacy Off"));
  });

  it("validates enabled and resolves display", () => {
    assert.equal(isEnabledEntityStatusLabel(sample, "Escalated"), true);
    assert.equal(isEnabledEntityStatusLabel(sample, "Legacy Off"), false);
    const display = resolveEntityStatusDisplay(sample, "Closed");
    assert.equal(display.tone, "good");
    assert.equal(display.terminal, true);
  });

  it("open labels are enabled non-terminal by default", () => {
    assert.deepEqual(openEntityStatusLabels(sample), ["Open", "Escalated"]);
  });
});
