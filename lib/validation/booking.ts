import { z } from "zod";

/** Optional ISO / date-only string → null clears the field. */
const optionalDate = z
  .union([z.string().trim().min(1).max(40), z.null()])
  .optional();

const optionalString = z.union([z.string().trim().max(500), z.null()]).optional();

/**
 * PATCH /api/bookings/[id] — allowlisted fields only (no mass-assignment).
 * bookingCode is immutable; days fields are server-computed from date ranges.
 */
export const patchBookingSchema = z
  .object({
    releaseId: z.string().trim().min(1).max(64).nullable().optional(),
    purpose: optionalString,
    dependencies: optionalString,
    releaseSize: optionalString,
    prodReleaseDate: optionalDate,
    cabDate: optionalDate,
    testEnvCode: optionalString,
    testStart: optionalDate,
    testEnd: optionalDate,
    uatEnvCode: optionalString,
    uatStart: optionalDate,
    uatEnd: optionalDate,
    preProdEnvCode: optionalString,
    preProdStart: optionalDate,
    preProdEnd: optionalDate,
    conflictFlag: z.boolean().optional(),
    environmentConflictId: optionalString,
  })
  .strict();

export type PatchBookingInput = z.infer<typeof patchBookingSchema>;
