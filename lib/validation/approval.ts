import { z } from "zod";

const optionalNullableString = z.union([z.string().trim().max(4000), z.null()]).optional();
const optionalNullableDate = z.union([z.string().trim().min(1).max(40), z.null()]).optional();

/** Sheet approval types shown in create / edit UI. */
export const APPROVAL_TYPES = [
  "CAB Final",
  "Change Manager",
  "Executive Approval",
  "Emergency Approval",
] as const;

/** Older five values still stored on existing rows — accepted so PATCH/GET do not fail. */
export const LEGACY_APPROVAL_TYPES = [
  "Business Sign-off",
  "CAB Approval",
  "Compliance",
  "Security Review",
  "Tech Review",
] as const;

/** Canonical sheet types plus legacy labels still on older rows. */
export const APPROVAL_TYPE_VALUES = [
  ...APPROVAL_TYPES,
  ...LEGACY_APPROVAL_TYPES,
] as const;

const approvalTypeSet = new Set<string>(APPROVAL_TYPE_VALUES);

/**
 * True when a type is one of the sheet four or a known legacy label.
 */
export function isKnownApprovalType(value: string): boolean {
  return approvalTypeSet.has(value.trim());
}

/**
 * True when the stored type is a leftover from the previous five-value list.
 */
export function isLegacyApprovalType(value: string): boolean {
  return (LEGACY_APPROVAL_TYPES as readonly string[]).includes(value.trim());
}

/**
 * Select options for create/edit: sheet four, plus the current stored value when it is leftover.
 */
export function approvalTypeSelectOptions(
  current?: string | null
): Array<{ value: string; label: string }> {
  const opts: Array<{ value: string; label: string }> = APPROVAL_TYPES.map(
    (t) => ({ value: t, label: t })
  );
  const cur = current?.trim();
  if (cur && !opts.some((o) => o.value === cur)) {
    opts.unshift({
      value: cur,
      label: isLegacyApprovalType(cur) ? `${cur} (previous type)` : cur,
    });
  }
  return opts;
}

/** Fallback decision labels for UI before lifecycle config loads; create/PATCH use lifecycle. */
export const APPROVAL_DECISIONS = [
  "Pending",
  "Approved",
  "Approved with Conditions",
  "Rejected",
  "Deferred",
  "Expired",
  "Withdrawn",
] as const;

const approvalTypeSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .refine(isKnownApprovalType, {
    message:
      "Approval type must be CAB Final, Change Manager, Executive Approval, or Emergency Approval",
  });

/** POST /api/approvals — create fields only; IDs and derived release metadata are rejected. */
export const createApprovalSchema = z
  .object({
    releaseId: z.string().trim().min(1).max(64),
    approvalType: approvalTypeSchema,
    approverId: z.string().trim().min(1).max(64),
    submittedDate: z.string().date(),
    decisionDate: z.union([z.string().date(), z.null()]).optional(),
    /** Validated against the caller's approval lifecycle config on create. */
    decision: z.string().trim().min(1).max(80).optional(),
    comments: optionalNullableString,
    cabMeetingId: z.union([z.string().trim().max(120), z.null()]).optional(),
    conditions: optionalNullableString,
  })
  .strict();

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
    approvalType: approvalTypeSchema.optional(),
    approverId: z.string().trim().min(1).max(64).optional(),
    submittedDate: z.string().trim().min(1).max(40).optional(),
    decisionDate: optionalNullableDate,
    decision: z.string().trim().min(1).max(80).optional(),
    comments: optionalNullableString,
    cabMeetingId: optionalNullableString,
    conditions: optionalNullableString,
    /** Optional override note for Flexible lifecycle edges off the expected path. */
    overrideReason: z.string().trim().min(1).max(2000).optional(),
  })
  .strict();

export type PatchApprovalInput = z.infer<typeof patchApprovalSchema>;
