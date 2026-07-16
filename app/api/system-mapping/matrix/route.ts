import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import {
  parseSystemMappingBody,
  systemMappingErrorResponse,
} from "@/lib/system-mapping-api";
import { rebuildCanonicalMappingEdges } from "@/lib/system-mapping-canonical";
import {
  patchSystemMatrixSchema,
  SYSTEM_MAPPING_DEPARTMENTS,
} from "@/lib/validation/system-mapping";

function matrixCellUpdate(
  toDepartment: (typeof SYSTEM_MAPPING_DEPARTMENTS)[number],
  value: "●" | "○" | "-"
): Prisma.SystemMatrixRowUpdateInput {
  switch (toDepartment) {
    case "Finance":
      return { finance: value };
    case "HR":
      return { hr: value };
    case "IT":
      return { it: value };
    case "CRM":
      return { crm: value };
    case "Manufacturing":
      return { manufacturing: value };
    case "Logistics":
      return { logistics: value };
    case "Legal":
      return { legal: value };
    case "Security":
      return { security: value };
    default:
      throw new Error("Unsupported matrix department");
  }
}

async function updateCell(
  transaction: Prisma.TransactionClient,
  fromDepartment: (typeof SYSTEM_MAPPING_DEPARTMENTS)[number],
  toDepartment: (typeof SYSTEM_MAPPING_DEPARTMENTS)[number],
  value: "●" | "○" | "-"
) {
  const row = await transaction.systemMatrixRow.findFirst({ where: { fromDepartment } });
  if (!row) throw new Error("System matrix row is missing");
  await transaction.systemMatrixRow.update({
    where: { id: row.id },
    data: matrixCellUpdate(toDepartment, value),
  });
}

/** Returns the fixed department order and persisted matrix rows. */
export async function GET() {
  const { error } = await requireRole("readonly");
  if (error) return error;

  try {
    const rows = await prisma.systemMatrixRow.findMany({
      orderBy: [{ sourceOrder: "asc" }, { id: "asc" }],
    });
    return NextResponse.json({ departments: SYSTEM_MAPPING_DEPARTMENTS, rows });
  } catch (routeError) {
    return systemMappingErrorResponse(routeError, "system-mapping matrix GET failed");
  }
}

/**
 * Updates a non-diagonal matrix cell and atomically rebuilds canonical edges.
 * Mirroring defaults to true so the reverse department pair remains consistent.
 */
export async function PATCH(request: Request) {
  const { error } = await requireRole("editor");
  if (error) return error;

  const parsed = await parseSystemMappingBody(request, patchSystemMatrixSchema);
  if (parsed.error) return parsed.error;
  const { fromDepartment, toDepartment, value, mirror } = parsed.data;

  try {
    const result = await prisma.$transaction(
      async (transaction) => {
        await updateCell(transaction, fromDepartment, toDepartment, value);
        if (mirror) {
          await updateCell(transaction, toDepartment, fromDepartment, value);
        }
        const edgeCount = await rebuildCanonicalMappingEdges(transaction);
        const rows = await transaction.systemMatrixRow.findMany({
          orderBy: [{ sourceOrder: "asc" }, { id: "asc" }],
        });
        return { rows, edgeCount };
      },
      { maxWait: 10_000, timeout: 30_000 }
    );
    return NextResponse.json(result);
  } catch (routeError) {
    return systemMappingErrorResponse(routeError, "system-mapping matrix PATCH failed");
  }
}
