/**
 * Prove org PATCH schemas reject mass-assignment / unknown fields and only allowlisted keys.
 */
import assert from "node:assert/strict";
import {
  patchApplicationSchema,
  patchDepartmentSchema,
  patchEnvironmentSchema,
} from "../lib/validation/org-patch";

// Department — allow name/head only
assert.equal(patchDepartmentSchema.safeParse({ name: "Finance" }).success, true);
assert.equal(patchDepartmentSchema.safeParse({ head: "Alex" }).success, true);
assert.equal(
  patchDepartmentSchema.safeParse({ name: "Finance", id: "hacked", createdAt: "x" }).success,
  false,
  "department rejects id/createdAt mass-assignment"
);

// Environment — reject arbitrary keys
assert.equal(patchEnvironmentSchema.safeParse({ status: "Available" }).success, true);
assert.equal(
  patchEnvironmentSchema.safeParse({ status: "Available", organizationId: "x", __proto__: {} }).success,
  false,
  "environment rejects unexpected fields"
);

// Application — reject privilege / FK smuggling beyond allowlist
assert.equal(patchApplicationSchema.safeParse({ criticality: "High" }).success, true);
assert.equal(
  patchApplicationSchema.safeParse({
    name: "App",
    accessLevel: "Admin",
    role: "admin",
    password: "x",
  }).success,
  false,
  "application rejects non-allowlisted privilege fields"
);

const env = patchEnvironmentSchema.parse({
  name: "UAT",
  lastDbRefresh: null,
});
assert.equal(env.name, "UAT");
assert.equal(env.lastDbRefresh, null);
assert.equal("applicationId" in env && env.applicationId === undefined, false);

console.log("PASS: org PATCH Zod — allowlists block mass-assignment");
