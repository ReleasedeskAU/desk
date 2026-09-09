/**
 * RD-124: Related Release is required on incident create only.
 * Run: npx tsx --test lib/validation/incident.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createIncidentSchema, patchIncidentSchema } from "./incident";

const validCreate = {
  timestamp: "2026-09-08T10:00",
  applicationId: "app_1",
  severity: "P2 - High",
  title: "API timeout on checkout",
  status: "Active",
  impact: "Degraded",
  environmentName: "Prod",
  relatedReleaseCode: "REL-104",
};

describe("createIncidentSchema relatedReleaseCode (RD-124)", () => {
  it("accepts a create payload with a related release code", () => {
    const parsed = createIncidentSchema.safeParse(validCreate);
    assert.equal(parsed.success, true);
    if (!parsed.success) return;
    assert.equal(parsed.data.relatedReleaseCode, "REL-104");
  });

  it("rejects create when relatedReleaseCode is missing", () => {
    const { relatedReleaseCode: _omit, ...without } = validCreate;
    const parsed = createIncidentSchema.safeParse(without);
    assert.equal(parsed.success, false);
    if (parsed.success) return;
    const issue = parsed.error.issues.find((i) => i.path.join(".") === "relatedReleaseCode");
    assert.ok(issue);
    assert.equal(issue.message, "Related Release is required");
  });

  it("rejects create when relatedReleaseCode is null, blank, or whitespace", () => {
    for (const value of [null, "", "   "]) {
      const parsed = createIncidentSchema.safeParse({
        ...validCreate,
        relatedReleaseCode: value,
      });
      assert.equal(parsed.success, false, `expected reject for ${JSON.stringify(value)}`);
      if (parsed.success) continue;
      const issue = parsed.error.issues.find((i) => i.path.join(".") === "relatedReleaseCode");
      assert.ok(issue);
      assert.equal(issue.message, "Related Release is required");
    }
  });
});

describe("patchIncidentSchema relatedReleaseCode (RD-124 create-only)", () => {
  it("still allows omitting relatedReleaseCode on edit", () => {
    const parsed = patchIncidentSchema.safeParse({ title: "Updated title" });
    assert.equal(parsed.success, true);
  });

  it("still allows clearing relatedReleaseCode on edit", () => {
    const parsed = patchIncidentSchema.safeParse({ relatedReleaseCode: null });
    assert.equal(parsed.success, true);
    if (!parsed.success) return;
    assert.equal(parsed.data.relatedReleaseCode, null);
  });
});
