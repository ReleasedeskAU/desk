import { z } from "zod";

/** Governed event types used by the Release Calendar workbook/UI. */
export const CALENDAR_EVENT_TYPES = [
  "CAB MEETING",
  "RELEASE",
  "CHANGE FREEZE",
  "REGULATORY",
  "VENDOR MAINT",
] as const;

const optionalNullableString = (max: number) =>
  z.union([z.string().trim().max(max), z.null()]).optional();

/**
 * POST /api/calendar — create a calendar entry.
 * Identity is the server cuid; no business code is generated for this sheet.
 */
export const createCalendarEventSchema = z
  .object({
    date: z.string().date(),
    eventType: z.string().trim().min(1).max(120),
    title: z.string().trim().min(1).max(500),
    releaseId: z.union([z.string().trim().min(1).max(64), z.null()]).optional(),
    applicationName: optionalNullableString(200),
    departmentName: optionalNullableString(200),
    sizeImpact: optionalNullableString(120),
    notes: optionalNullableString(2000),
  })
  .strict();

export type CreateCalendarEventInput = z.infer<typeof createCalendarEventSchema>;
