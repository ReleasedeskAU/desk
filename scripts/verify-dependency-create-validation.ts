/**
 * Prove create/patch dependency schemas reject self-deps, extras, and invalid enums.
 */
import assert from "node:assert/strict";
import { createDependencySchema, patchDependencySchema } from "../lib/validation/dependency";

const base = {
  releaseId: "rel-a",
  dependsOnReleaseId: "rel-b",
  dependencyType: "Hard",
  status: "Clear",
  impactIfBlocked: "Release Delay",
};

assert.equal(createDependencySchema.safeParse(base).success, true);
assert.equal(
  createDependencySchema.safeParse({ ...base, releaseId: "rel-a", dependsOnReleaseId: "rel-a" }).success,
  false,
  "self-dependency rejected"
);
assert.equal(
  createDependencySchema.safeParse({ ...base, dependencyCode: "DEP-999" }).success,
  false,
  "client-supplied dep code rejected"
);

assert.equal(patchDependencySchema.safeParse({ status: "Blocked" }).success, true);
assert.equal(
  patchDependencySchema.safeParse({ status: "Blocked", id: "hack" }).success,
  false,
  "PATCH mass-assignment rejected"
);
assert.equal(
  patchDependencySchema.safeParse({ releaseId: "a", dependsOnReleaseId: "a" }).success,
  false,
  "PATCH self-dep rejected"
);

console.log("PASS: dependency create/patch Zod — allowlist + no self-deps");
