/**
 * Run: npx tsx --test lib/incident-patch-changed-keys.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { keysWithActualIncidentPatchChanges } from "@/lib/incident-patch-changed-keys";

describe("keysWithActualIncidentPatchChanges", () => {
  const existing = {
    id: "inc_1",
    incidentCode: "INC-0001",
    status: "Closed",
    title: "Outage",
    severity: "P1",
    assignedTo: "Ada",
    timestamp: new Date("2026-06-20T10:00:00.000Z"),
  };

  it("ignores echoed fields on a Closed status-only save so identity does not mask the transition", () => {
    const keys = keysWithActualIncidentPatchChanges({
      existing,
      body: {
        status: "Active",
        title: "Outage",
        severity: "P1",
        assignedTo: "Ada",
        timestamp: "2026-06-20T10:00:00.000Z",
      },
    });
    assert.deepEqual(keys, ["status"]);
  });

  it("flags a real title edit", () => {
    const keys = keysWithActualIncidentPatchChanges({
      existing,
      body: { title: "Changed" },
    });
    assert.deepEqual(keys, ["title"]);
  });
});
