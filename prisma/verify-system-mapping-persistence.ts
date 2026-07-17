/**
 * Verifies live System Mapping persistence with temporary records and restores all changes.
 * Run: npx tsx prisma/verify-system-mapping-persistence.ts
 */
import { PrismaClient } from "@releasedesk/database";
import { rebuildCanonicalMappingEdges } from "../lib/system-mapping-canonical";

const prisma = new PrismaClient();
const suffix = Date.now().toString(36);
const systemName = `VERIFY-SYSTEM-${suffix}`;
const environmentCode = `VERIFY-ENV-${suffix}`;
const pathCode = `VERIFY-PATH-${suffix}`;

async function nextOrders() {
  const [system, environment, path] = await Promise.all([
    prisma.systemCoreRecord.aggregate({ _max: { sourceOrder: true } }),
    prisma.systemSharedEnvironment.aggregate({ _max: { sourceOrder: true } }),
    prisma.systemCriticalPath.aggregate({ _max: { sourceOrder: true } }),
  ]);
  return {
    system: (system._max.sourceOrder ?? 0) + 1,
    environment: (environment._max.sourceOrder ?? 0) + 1,
    path: (path._max.sourceOrder ?? 0) + 1,
  };
}

async function main() {
  const counts = await Promise.all([
    prisma.systemCoreRecord.count(),
    prisma.systemMatrixRow.count(),
    prisma.systemSharedEnvironment.count(),
    prisma.systemCriticalPath.count(),
    prisma.systemReleaseManagerNote.count(),
  ]);
  if (counts.join(",") !== "4,8,12,8,6") {
    throw new Error(`Unexpected seeded counts: ${counts.join(",")}`);
  }

  const orders = await nextOrders();
  const financeRow = await prisma.systemMatrixRow.findFirstOrThrow({
    where: { fromDepartment: "Finance" },
  });
  const hrRow = await prisma.systemMatrixRow.findFirstOrThrow({
    where: { fromDepartment: "HR" },
  });
  const originalFinanceToHr = financeRow.hr;
  const originalHrToFinance = hrRow.finance;
  const verificationValue = originalFinanceToHr === "○" ? "●" : "○";

  try {
    await prisma.systemCoreRecord.create({
      data: {
        system: systemName,
        department: "IT",
        type: "Verification",
        integratesWith: "None",
        dataFlow: "Unidirectional",
        keyDataExchanged: "Verification only",
        sourceOrder: orders.system,
      },
    });
    await prisma.systemCoreRecord.updateMany({
      where: { system: systemName },
      data: { type: "Verification edited" },
    });

    await prisma.systemSharedEnvironment.create({
      data: {
        environmentCode,
        environmentType: "Test",
        sharedBy: "IT",
        capacity: "Verification",
        bookingRequirement: "None",
        conflictRisk: "LOW",
        sourceOrder: orders.environment,
      },
    });
    await prisma.systemSharedEnvironment.update({
      where: { environmentCode },
      data: { capacity: "Verification edited" },
    });

    await prisma.systemCriticalPath.create({
      data: {
        pathCode,
        name: "Verification path",
        upstreamSystems: "A",
        downstreamSystems: "B",
        coordinationRequirement: "Verification",
        blackoutWindows: "None",
        releaseManagerNotes: "Temporary verification record",
        sourceOrder: orders.path,
      },
    });
    await prisma.systemCriticalPath.update({
      where: { pathCode },
      data: { name: "Verification path edited" },
    });

    await prisma.$transaction(
      async (transaction) => {
        await transaction.systemMatrixRow.update({
          where: { id: financeRow.id },
          data: { hr: verificationValue },
        });
        await transaction.systemMatrixRow.update({
          where: { id: hrRow.id },
          data: { finance: verificationValue },
        });
        await rebuildCanonicalMappingEdges(transaction);
      },
      { maxWait: 10_000, timeout: 60_000 }
    );

    await prisma.$disconnect();
    const reloaded = new PrismaClient();
    const [system, environment, path, matrix, edgeCount] = await Promise.all([
      reloaded.systemCoreRecord.findFirst({ where: { system: systemName } }),
      reloaded.systemSharedEnvironment.findUnique({ where: { environmentCode } }),
      reloaded.systemCriticalPath.findUnique({ where: { pathCode } }),
      reloaded.systemMatrixRow.findFirst({ where: { fromDepartment: "Finance" } }),
      reloaded.systemMappingEdge.count({
        where: { group: { name: "Enterprise Default Setup" } },
      }),
    ]);
    await reloaded.$disconnect();

    if (
      system?.type !== "Verification edited" ||
      environment?.capacity !== "Verification edited" ||
      path?.name !== "Verification path edited" ||
      matrix?.hr !== verificationValue ||
      edgeCount !== 56
    ) {
      throw new Error("A System Mapping persistence assertion failed");
    }
  } finally {
    const cleanup = new PrismaClient();
    await cleanup.systemCoreRecord.deleteMany({ where: { system: systemName } });
    await cleanup.systemSharedEnvironment.deleteMany({ where: { environmentCode } });
    await cleanup.systemCriticalPath.deleteMany({ where: { pathCode } });
    await cleanup.$transaction(
      async (transaction) => {
        await transaction.systemMatrixRow.update({
          where: { id: financeRow.id },
          data: { hr: originalFinanceToHr },
        });
        await transaction.systemMatrixRow.update({
          where: { id: hrRow.id },
          data: { finance: originalHrToFinance },
        });
        await rebuildCanonicalMappingEdges(transaction);
      },
      { maxWait: 10_000, timeout: 60_000 }
    );
    await cleanup.$disconnect();
  }

  console.info("System Mapping persistence verification passed and temporary data was removed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
