/**
 * Batch 2 create-schema checks; validates happy paths and rejected identity/edge inputs without writing data.
 * Run: npx tsx scripts/verify-batch2-create-schemas.ts
 */
import { createApprovalSchema } from "../lib/validation/approval";
import { createLeaveSchema } from "../lib/validation/leave";
import { createEnvironmentVersionSchema } from "../lib/validation/environment-version";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const approval = {
  releaseId: "release-id",
  approvalType: "Tech Review",
  approverId: "user-id",
  submittedDate: "2026-07-16",
  decision: "Pending" as const,
};
assert(createApprovalSchema.safeParse(approval).success, "valid approval must pass");
assert(!createApprovalSchema.safeParse({ ...approval, approvalCode: "APR-HACK" }).success, "approval ID must be rejected");
assert(
  !createApprovalSchema.safeParse({ ...approval, decision: "Approved", decisionDate: null }).success,
  "completed approval requires decision date"
);

const leave = {
  userId: "user-id",
  leaveStart: "2026-07-16",
  leaveEnd: "2026-07-18",
  leaveType: "Annual",
  days: 3,
  riskScore: 2,
};
assert(createLeaveSchema.safeParse(leave).success, "valid leave must pass");
assert(!createLeaveSchema.safeParse({ ...leave, leaveCode: "LV-HACK" }).success, "leave ID must be rejected");
assert(!createLeaveSchema.safeParse({ ...leave, leaveEnd: "2026-07-15" }).success, "reversed leave dates must fail");

const version = {
  applicationId: "application-id",
  environmentId: "environment-id",
  version: "2.4.1",
  status: "Current" as const,
};
assert(createEnvironmentVersionSchema.safeParse(version).success, "valid environment version must pass");
assert(!createEnvironmentVersionSchema.safeParse({ ...version, id: "cuid-hack" }).success, "version ID must be rejected");
assert(!createEnvironmentVersionSchema.safeParse({ ...version, updatedBy: "spoofed" }).success, "updatedBy must be server-owned");

console.log("Batch 2 create schemas passed.");
