/**
 * Run: npx tsx --test lib/lifecycle-transitions-ui.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  groupTransitionsByFrom,
  transitionMatchesQuery,
} from "@/lib/lifecycle-transitions-ui";

const statuses = [
  { key: "open", label: "Open", sortOrder: 10 },
  { key: "in_progress", label: "In Progress", sortOrder: 20 },
  { key: "closed", label: "Closed", sortOrder: 30 },
];

const transitions = [
  { fromKey: "in_progress", toKey: "closed", sortOrder: 20 },
  { fromKey: "open", toKey: "closed", sortOrder: 20 },
  { fromKey: "open", toKey: "in_progress", sortOrder: 10 },
];

describe("transitionMatchesQuery", () => {
  it("matches from, to, or the combined move", () => {
    assert.equal(transitionMatchesQuery("Open", "Closed", ""), true);
    assert.equal(transitionMatchesQuery("Open", "Closed", "open"), true);
    assert.equal(transitionMatchesQuery("Open", "Closed", "closed"), true);
    assert.equal(transitionMatchesQuery("Open", "Closed", "open → closed"), true);
    assert.equal(transitionMatchesQuery("Open", "Closed", "progress"), false);
  });
});

describe("groupTransitionsByFrom", () => {
  it("groups by starting status and sorts by status then edge order", () => {
    const groups = groupTransitionsByFrom(transitions, statuses);
    assert.deepEqual(
      groups.map((g) => g.fromLabel),
      ["Open", "In Progress"]
    );
    assert.deepEqual(
      groups[0]?.transitions.map((t) => t.toKey),
      ["in_progress", "closed"]
    );
  });

  it("filters groups by search", () => {
    const groups = groupTransitionsByFrom(transitions, statuses, "closed");
    assert.equal(groups.length, 2);
    assert.ok(groups.every((g) => g.transitions.every((t) => t.toKey === "closed")));
  });
});

describe("entity Transitions tabs use the shared list", () => {
  it("wires EntityTransitionsList into every entity settings page", () => {
    const files = [
      "AlertLifecycleSettings.tsx",
      "ApprovalLifecycleSettings.tsx",
      "BlockerLifecycleSettings.tsx",
      "ConflictLifecycleSettings.tsx",
      "DependencyLifecycleSettings.tsx",
      "DriftLifecycleSettings.tsx",
      "IncidentLifecycleSettings.tsx",
      "RiskLifecycleSettings.tsx",
      "SignoffLifecycleSettings.tsx",
    ];
    for (const file of files) {
      const src = readFileSync(
        join(__dirname, "..", "components", "settings", file),
        "utf8"
      );
      assert.match(src, /EntityTransitionsList/, `${file} should use EntityTransitionsList`);
    }
  });
});
