/**
 * Proves drift create validation accepts the intended payload and rejects unsafe IDs/invalid enums.
 */
import assert from "node:assert/strict";
import { createDriftSchema } from "../lib/validation/drift";

const valid = {
  releaseId: "rel1",
  applicationId: "app1",
  environmentName: "UAT",
  driftType: "Configuration",
  detectedDate: "2026-07-16",
  severity: "High",
  description: "Configuration differs from the approved release baseline",
  status: "Open",
};

assert.equal(createDriftSchema.safeParse(valid).success, true, "valid create payload accepted");
assert.equal(createDriftSchema.safeParse({ ...valid, driftCode: "DFT-HACK" }).success, false, "client ID rejected");
assert.equal(createDriftSchema.safeParse({ ...valid, severity: "Extreme" }).success, false, "invalid severity rejected");
assert.equal(createDriftSchema.safeParse({ ...valid, status: "Unknown" }).success, false, "invalid status rejected");
assert.equal(createDriftSchema.safeParse({ ...valid, detectedDate: "" }).success, false, "missing date rejected");
assert.equal(createDriftSchema.safeParse({ ...valid, description: "" }).success, false, "empty description rejected");

console.log("PASS: drifts POST Zod validation");
