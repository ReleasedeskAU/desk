import { z } from "zod";

const requiredText = (label: string) =>
  z.string().trim().min(1, `${label} is required`).max(500, `${label} is too long`);
const sourceOrder = z.number().int().positive();
const conflictRisk = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]));

/** Validates Prisma CUID path identifiers for redesign records. */
export const systemMappingIdSchema = z.string().cuid();

/** Strict create schema for core system records. */
export const createSystemCoreRecordSchema = z
  .object({
    system: requiredText("System"),
    department: requiredText("Department"),
    type: requiredText("Type"),
    integratesWith: requiredText("Integrates with"),
    dataFlow: requiredText("Data flow"),
    keyDataExchanged: requiredText("Key data exchanged"),
    sourceOrder: sourceOrder.optional(),
  })
  .strict();

/** Strict allowlist for core system record updates. */
export const patchSystemCoreRecordSchema = createSystemCoreRecordSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, "No updatable fields provided");

export const SYSTEM_MAPPING_DEPARTMENTS = [
  "Finance",
  "HR",
  "IT",
  "CRM",
  "Manufacturing",
  "Logistics",
  "Legal",
  "Security",
] as const;

/** Strict matrix-cell mutation schema. */
export const patchSystemMatrixSchema = z
  .object({
    fromDepartment: z.enum(SYSTEM_MAPPING_DEPARTMENTS),
    toDepartment: z.enum(SYSTEM_MAPPING_DEPARTMENTS),
    value: z.enum(["●", "○", "-"]),
    mirror: z.boolean().optional().default(true),
  })
  .strict()
  .refine((value) => value.fromDepartment !== value.toDepartment, {
    message: "Diagonal matrix cells cannot be edited",
    path: ["toDepartment"],
  });

/** Strict create schema for shared environments. */
export const createSharedEnvironmentSchema = z
  .object({
    environmentCode: requiredText("Environment code"),
    environmentType: requiredText("Environment type"),
    sharedBy: requiredText("Shared by"),
    capacity: requiredText("Capacity"),
    bookingRequirement: requiredText("Booking requirement"),
    conflictRisk,
    sourceOrder: sourceOrder.optional(),
  })
  .strict();

/** Strict allowlist for shared-environment updates. */
export const patchSharedEnvironmentSchema = createSharedEnvironmentSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, "No updatable fields provided");

export const SHARED_ENVIRONMENT_SORT_FIELDS = [
  "environmentCode",
  "environmentType",
  "sharedBy",
  "capacity",
  "bookingRequirement",
  "conflictRisk",
  "sourceOrder",
  "createdAt",
  "updatedAt",
] as const;

/** Strict query schema for shared-environment filtering and sorting. */
export const sharedEnvironmentQuerySchema = z
  .object({
    environmentCodeQ: z.string().trim().max(200).optional(),
    environmentType: z.string().trim().max(200).optional(),
    sharedByQ: z.string().trim().max(200).optional(),
    capacityQ: z.string().trim().max(200).optional(),
    bookingRequirementQ: z.string().trim().max(200).optional(),
    conflictRisk: z.string().trim().max(200).optional(),
    sort: z.enum(SHARED_ENVIRONMENT_SORT_FIELDS).optional().default("sourceOrder"),
    dir: z.enum(["asc", "desc"]).optional().default("asc"),
  })
  .strict();

/** Strict create schema for critical integration paths. */
export const createCriticalPathSchema = z
  .object({
    pathCode: requiredText("Path code"),
    name: requiredText("Name"),
    upstreamSystems: requiredText("Upstream systems"),
    downstreamSystems: requiredText("Downstream systems"),
    coordinationRequirement: requiredText("Coordination requirement"),
    blackoutWindows: requiredText("Blackout windows"),
    releaseManagerNotes: requiredText("Release manager notes"),
    sourceOrder: sourceOrder.optional(),
  })
  .strict();

/** Strict allowlist for critical-path updates. */
export const patchCriticalPathSchema = createCriticalPathSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, "No updatable fields provided");
