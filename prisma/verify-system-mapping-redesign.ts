/**
 * Non-database verification for strict validation and canonical edge projection.
 * Run: npx tsx prisma/verify-system-mapping-redesign.ts
 */
import assert from "node:assert/strict";
import { buildCanonicalEdges } from "../lib/system-mapping-canonical";
import {
  createSharedEnvironmentSchema,
  patchSystemMatrixSchema,
} from "../lib/validation/system-mapping";

assert.equal(
  createSharedEnvironmentSchema.safeParse({
    environmentCode: "TEST-01",
    environmentType: "Test",
    sharedBy: "Finance",
    capacity: "Standard",
    bookingRequirement: "Recommended",
    conflictRisk: "Low",
    unexpected: true,
  }).success,
  false,
  "strict create validation must reject extra fields"
);

assert.equal(
  patchSystemMatrixSchema.safeParse({
    fromDepartment: "Finance",
    toDepartment: "Finance",
    value: "●",
  }).success,
  false,
  "matrix validation must reject diagonal edits"
);

assert.equal(
  patchSystemMatrixSchema.safeParse({
    fromDepartment: "Finance",
    toDepartment: "HR",
    value: "invalid",
  }).success,
  false,
  "matrix validation must reject unsupported values"
);

const validMatrixPatch = patchSystemMatrixSchema.parse({
  fromDepartment: "Finance",
  toDepartment: "HR",
  value: "●",
});
assert.equal(validMatrixPatch.mirror, true, "matrix mirroring must default to true");

const matrixRows = [
  {
    fromDepartment: "Finance",
    finance: "-",
    hr: "●",
    it: "-",
    crm: "-",
    manufacturing: "-",
    logistics: "-",
    legal: "-",
    security: "-",
  },
];
const edges = buildCanonicalEdges(
  matrixRows,
  [
    {
      id: "finance-app",
      department: { name: "Finance" },
      environments: [
        { id: "finance-prod", name: "Prod" },
        { id: "finance-test", name: "Test" },
      ],
    },
    {
      id: "hr-app",
      department: { name: "HR" },
      environments: [{ id: "hr-uat", name: "UAT" }],
    },
  ],
  { id: "canonical-group", organizationId: "organization-1" }
);
assert.equal(edges.length, 1);
assert.equal(edges[0].sourceEnvId, "finance-test", "Test must be the preferred environment");
assert.equal(edges[0].targetEnvId, "hr-uat");
assert.equal(edges[0].organizationId, "organization-1");
assert.equal(edges[0].groupId, "canonical-group");

console.info("System Mapping redesign verification passed");
