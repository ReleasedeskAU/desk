import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const { error } = await requireRole("readonly");
  if (error) return error;

  const [core, matrix, flows] = await Promise.all([
    prisma.systemCoreRecord.findMany({ orderBy: { sourceOrder: "asc" } }),
    prisma.systemMatrixRow.findMany({ orderBy: { sourceOrder: "asc" } }),
    prisma.integrationFlow.findMany({ orderBy: { sourceOrder: "asc" } }),
  ]);

  return NextResponse.json({
    core: core.map((row) => ({
      System: row.system,
      Department: row.department,
      Type: row.type,
      "Integrates With": row.integratesWith,
      "Data Flow": row.dataFlow,
      "Key Data Exchanged": row.keyDataExchanged,
    })),
    matrix: matrix.map((row) => ({
      "From \\ To": row.fromDepartment,
      Finance: row.finance,
      HR: row.hr,
      IT: row.it,
      CRM: row.crm,
      Manufacturing: row.manufacturing,
      Logistics: row.logistics,
      Legal: row.legal,
      Security: row.security,
    })),
    flows: flows.map((row) => ({
      "Flow ID": row.flowCode,
      "Source System": row.sourceSystem,
      "Target System": row.targetSystem,
      "Integration Type": row.integrationType,
      Frequency: row.frequency,
      "Data Elements": row.dataElements,
      "Business Purpose": row.businessPurpose,
    })),
  });
}
