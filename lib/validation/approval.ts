import { z } from "zod";

const optionalNullableString = z.union([z.string().trim().max(4000), z.null()]).optional();
const optionalNullableDate = z.union([z.string().trim().min(1).max(40), z.null()]).optional();

/**
 * PATCH /api/approvals/[id] — allowlisted fields only.
 * approvalCode is immutable (schema.strict rejects it).
 */
export const patchApprovalSchema = z
  .object({
    releaseId: z.string().trim().min(1).max(64).optional(),
    applicationName: optionalNullableString,
    departmentName: optionalNullableString,
    approvalType: z.string().trim().min(1).max(120).optional(),
    approverId: z.string().trim().min(1).max(64).optional(),
    submittedDate: z.string().trim().min(1).max(40).optional(),
    decisionDate: optionalNullableDate,
    decision: z.string().trim().min(1).max(80).optional(),
    comments: optionalNullableString,
    cabMeetingId: optionalNullableString,
  })
  .strict();

export type PatchApprovalInput = z.infer<typeof patchApprovalSchema>;
