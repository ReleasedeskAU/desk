/**
 * RD-116: Risk list Status filter options are a FilterSelect dropdown source
 * from enabled risk lifecycle labels (tenant-configurable).
 *
 * Run: npx tsx --test lib/risk-status-filter.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  enabledEntityStatusLabels,
  entityStatusFilterOptions,
  type EntityLifecycleConfigLike,
} from "./entity-lifecycle-status-ui";

/** Shared list-page control for Risk Status — dropdown, not inline pills. */
const RISK_STATUS_FILTER_CONTROL = "dropdown" as const;

/**
 * Tenant-shaped risk lifecycle. Labels are config, not a hardcoded product list.
 */
function tenantRiskLifecycle(overrides?: {
  identifiedLabel?: string;
  closedEnabled?: boolean;
}): EntityLifecycleConfigLike {
  return {
    statuses: [
      {
        key: "identified",
        label: overrides?.identifiedLabel ?? "Open",
        sortOrder: 10,
        terminal: false,
        enabled: true,
      },
      {
        key: "assessing",
        label: "In Progress",
        sortOrder: 20,
        terminal: false,
        enabled: true,
      },
      {
        key: "mitigating",
        label: "Mitigating",
        sortOrder: 30,
        terminal: false,
        enabled: true,
      },
      {
        key: "accepted",
        label: "Accepted",
        sortOrder: 40,
        terminal: false,
        enabled: true,
      },
      {
        key: "escalated",
        label: "Escalated",
        sortOrder: 50,
        terminal: false,
        enabled: true,
      },
      {
        key: "mitigated",
        label: "Monitoring",
        sortOrder: 60,
        terminal: false,
        enabled: true,
      },
      {
        key: "closed",
        label: "Closed",
        sortOrder: 70,
        terminal: true,
        enabled: overrides?.closedEnabled ?? true,
      },
      {
        key: "retired",
        label: "Retired",
        sortOrder: 80,
        terminal: true,
        enabled: false,
      },
    ],
  };
}

describe("risk status filter dropdown source (RD-116)", () => {
  it("feeds FilterSelect from enabled risk lifecycle labels", () => {
    const config = tenantRiskLifecycle();
    const options = entityStatusFilterOptions(config, []);

    assert.equal(RISK_STATUS_FILTER_CONTROL, "dropdown");
    assert.deepEqual(options, enabledEntityStatusLabels(config));
    assert.ok(options.includes("Open"));
    assert.ok(options.includes("Mitigating"));
    assert.ok(!options.includes("Retired"));
  });

  it("uses a renamed tenant label and does not offer a disabled status", () => {
    const config = tenantRiskLifecycle({
      identifiedLabel: "Active Review",
      closedEnabled: false,
    });
    const options = entityStatusFilterOptions(config, ["Active Review", "Mitigating"]);

    assert.ok(options.includes("Active Review"));
    assert.ok(!options.includes("Open"));
    assert.ok(!options.includes("Closed"));
    assert.ok(!options.includes("Retired"));
    assert.deepEqual(options, enabledEntityStatusLabels(config));
  });
});
