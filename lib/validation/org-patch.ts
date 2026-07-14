import { z } from "zod";

/** PATCH /api/departments/[id] — allowlisted fields only. */
export const patchDepartmentSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    head: z.string().trim().max(200).optional(),
  })
  .strict();

/** PATCH /api/environments/[id] — allowlisted fields only. */
export const patchEnvironmentSchema = z
  .object({
    applicationId: z.string().trim().min(1).max(64).optional(),
    name: z.string().trim().min(1).max(120).optional(),
    type: z.string().trim().max(64).optional(),
    owner: z.string().trim().max(200).optional(),
    lastDbRefresh: z.union([z.string().trim().min(1).max(40), z.null()]).optional(),
    status: z.string().trim().max(64).optional(),
  })
  .strict();

/** PATCH /api/applications/[id] — allowlisted fields only. */
export const patchApplicationSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    departmentId: z.string().trim().min(1).max(64).optional(),
    type: z.string().trim().max(120).optional(),
    productOwner: z.string().trim().max(200).optional(),
    techLead: z.string().trim().max(200).optional(),
    support: z.string().trim().max(200).optional(),
    criticality: z.string().trim().max(64).optional(),
  })
  .strict();
