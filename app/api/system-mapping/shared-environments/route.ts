import { NextResponse } from "next/server";
import type { Prisma } from "@releasedesk/database";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import { zodErrorResponse } from "@/lib/api-errors";
import {
  parseSystemMappingBody,
  systemMappingErrorResponse,
} from "@/lib/system-mapping-api";
import {
  createSharedEnvironmentSchema,
  sharedEnvironmentQuerySchema,
} from "@/lib/validation/system-mapping";

/** Returns filtered and sorted shared environments with a matching total. */
export async function GET(request: Request) {
  const { error } = await requireRole("readonly");
  if (error) return error;

  const query = Object.fromEntries(new URL(request.url).searchParams.entries());
  const parsed = sharedEnvironmentQuerySchema.safeParse(query);
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const filters = parsed.data;

  const where: Prisma.SystemSharedEnvironmentWhereInput = {
    ...(filters.environmentCodeQ
      ? { environmentCode: { contains: filters.environmentCodeQ, mode: "insensitive" } }
      : {}),
    ...(filters.environmentType
      ? { environmentType: { equals: filters.environmentType, mode: "insensitive" } }
      : {}),
    ...(filters.sharedByQ
      ? { sharedBy: { contains: filters.sharedByQ, mode: "insensitive" } }
      : {}),
    ...(filters.capacityQ
      ? { capacity: { contains: filters.capacityQ, mode: "insensitive" } }
      : {}),
    ...(filters.bookingRequirementQ
      ? {
          bookingRequirement: {
            contains: filters.bookingRequirementQ,
            mode: "insensitive",
          },
        }
      : {}),
    ...(filters.conflictRisk
      ? { conflictRisk: { equals: filters.conflictRisk, mode: "insensitive" } }
      : {}),
  };
  const orderBy = {
    [filters.sort]: filters.dir,
  } as Prisma.SystemSharedEnvironmentOrderByWithRelationInput;

  try {
    const [items, total] = await prisma.$transaction([
      prisma.systemSharedEnvironment.findMany({ where, orderBy }),
      prisma.systemSharedEnvironment.count({ where }),
    ]);
    return NextResponse.json({ items, total });
  } catch (routeError) {
    return systemMappingErrorResponse(
      routeError,
      "system-mapping shared-environments GET failed"
    );
  }
}

/** Creates a strictly validated shared-environment record. */
export async function POST(request: Request) {
  const { error } = await requireRole("editor");
  if (error) return error;

  const parsed = await parseSystemMappingBody(request, createSharedEnvironmentSchema);
  if (parsed.error) return parsed.error;

  try {
    const item = await prisma.$transaction(async (transaction) => {
      const latest = await transaction.systemSharedEnvironment.aggregate({
        _max: { sourceOrder: true },
      });
      return transaction.systemSharedEnvironment.create({
        data: {
          ...parsed.data,
          sourceOrder: parsed.data.sourceOrder ?? (latest._max.sourceOrder ?? 0) + 1,
        },
      });
    });
    return NextResponse.json(item, { status: 201 });
  } catch (routeError) {
    return systemMappingErrorResponse(
      routeError,
      "system-mapping shared-environments POST failed"
    );
  }
}
