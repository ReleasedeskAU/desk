import { z } from "zod";

const optionalNullableString = z.union([z.string().trim().max(2000), z.null()]).optional();
const optionalNullableDate = z.union([z.string().trim().min(1).max(40), z.null()]).optional();
const optionalNullableInt = z.union([z.number().int().min(0).max(3650), z.null()]).optional();

/**
 * PATCH /api/leaves/[id] — allowlisted fields only.
 * leaveCode (Leave ID) and employee userId are immutable from this endpoint.
 */
export const patchLeaveSchema = z
  .object({
    leaveType: z.string().trim().min(1).max(120).optional(),
    leaveStart: optionalNullableDate,
    leaveEnd: optionalNullableDate,
    days: optionalNullableInt,
    riskImpact: optionalNullableString,
    riskScore: z.union([z.number().int().min(0).max(10), z.null()]).optional(),
  })
  .strict();

export type PatchLeaveInput = z.infer<typeof patchLeaveSchema>;
