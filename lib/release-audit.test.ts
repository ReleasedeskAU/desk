import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  auditActorName,
  summarizeIdListChange,
  summarizeReleaseFieldEdits,
} from "./release-audit";

describe("summarizeReleaseFieldEdits", () => {
  it("lists every changed field with before → after", () => {
    const detail = summarizeReleaseFieldEdits(
      { status: "Blocked", readinessPercent: 50, notes: null },
      { status: "In Progress", readinessPercent: 75, notes: "CAB approved" }
    );
    assert.ok(detail);
    assert.match(detail!, /Status: Blocked → In Progress/);
    assert.match(detail!, /Readiness Percent: 50 → 75/);
    assert.match(detail!, /Notes: \(empty\) → CAB approved/);
  });

  it("returns null when nothing changed", () => {
    assert.equal(
      summarizeReleaseFieldEdits({ status: "Blocked" }, { status: "Blocked" }),
      null
    );
  });
});

describe("summarizeIdListChange", () => {
  it("detects added and removed ids", () => {
    assert.equal(
      summarizeIdListChange("Applications", ["a", "b"], ["b", "c"]),
      "Applications: a,b → b,c"
    );
  });

  it("returns null for equivalent lists", () => {
    assert.equal(summarizeIdListChange("Stakeholders", ["x", "y"], ["y", "x"]), null);
  });
});

describe("auditActorName", () => {
  it("prefers name, then email, then userId", () => {
    assert.equal(auditActorName({ name: "Priya", email: "p@x.com", userId: "U1" }), "Priya");
    assert.equal(auditActorName({ name: "", email: "p@x.com", userId: "U1" }), "p@x.com");
    assert.equal(auditActorName({ name: null, email: null, userId: "U1" }), "U1");
  });
});
