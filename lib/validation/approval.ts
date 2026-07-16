import { z } from "zod";

const optionalNullableString = z.union([z.string().trim().max(4000), z.null()]).optional();
const optionalNullableDate = z.union([z.string().trim().min(1).max(40), z.null()]).optional();

export const APPROVAL_TYPES = ["Business Sign-off", "CAB Approval", "Compliance", "Security Review", "Tech Review"] as const;
export const APPROVAL_DECISIONS = ["Pending", "Approved", "Approved with Conditions", "Rejected"] as const;

/** POST /api/approvals — create fields only; IDs and derived release metadata are rejected. */
export const createApprovalSchema = z
  .object({
    releaseId: z.string().trim().min(1).max(64),
    approvalType: z.string().trim().min(1).max(120),
    approverId: z.string().trim().min(1).max(64),
    submittedDate: z.string().date(),
    decisionDate: z.union([z.string().date(), z.null()]).optional(),
    decision: z.enum(APPROVAL_DECISIONS).optional(),
    comments: optionalNullableString,
    cabMeetingId: z.union([z.string().trim().max(120), z.null()]).optional(),
  })
  .strict()
  .refine((value) => value.decision === "Pending" || Boolean(value.decisionDate), {
    path: ["decisionDate"],
    message: "Decision date is required when a decision has been made",
  });

export type CreateApprovalInput = z.infer<typeof createApprovalSchema>;

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
