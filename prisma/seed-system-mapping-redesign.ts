/**
 * Idempotently seeds curated System Mapping redesign data without deleting unrelated rows.
 * Run: npx tsx prisma/seed-system-mapping-redesign.ts
 */
import { prisma } from "../lib/prisma";
import sharedEnvironments from "./seed-data/system-shared-environments.json";
import criticalPaths from "./seed-data/system-critical-paths.json";
import releaseManagerNotes from "./seed-data/system-release-manager-notes.json";

const EXPECTED_COUNTS = {
  sharedEnvironments: 12,
  criticalPaths: 8,
  releaseManagerNotes: 6,
} as const;

function assertCuratedCounts() {
  if (
    sharedEnvironments.length !== EXPECTED_COUNTS.sharedEnvironments ||
    criticalPaths.length !== EXPECTED_COUNTS.criticalPaths ||
    releaseManagerNotes.length !== EXPECTED_COUNTS.releaseManagerNotes
  ) {
    throw new Error("System Mapping curated seed counts do not match the raw workbook extraction");
  }
}

async function main() {
  assertCuratedCounts();

  for (const row of sharedEnvironments) {
    await prisma.systemSharedEnvironment.upsert({
      where: { environmentCode: row.environmentCode },
      create: row,
      update: {
        environmentType: row.environmentType,
        sharedBy: row.sharedBy,
        capacity: row.capacity,
        bookingRequirement: row.bookingRequirement,
        conflictRisk: row.conflictRisk,
        sourceOrder: row.sourceOrder,
      },
    });
  }

  for (const row of criticalPaths) {
    await prisma.systemCriticalPath.upsert({
      where: { pathCode: row.pathCode },
      create: row,
      update: {
        name: row.name,
        upstreamSystems: row.upstreamSystems,
        downstreamSystems: row.downstreamSystems,
        coordinationRequirement: row.coordinationRequirement,
        blackoutWindows: row.blackoutWindows,
        releaseManagerNotes: row.releaseManagerNotes,
        sourceOrder: row.sourceOrder,
      },
    });
  }

  for (const row of releaseManagerNotes) {
    await prisma.systemReleaseManagerNote.upsert({
      where: { sourceOrder: row.sourceOrder },
      create: row,
      update: { content: row.content },
    });
  }

  console.info(
    `Seeded System Mapping redesign: ${sharedEnvironments.length} shared environments, ` +
      `${criticalPaths.length} critical paths, ${releaseManagerNotes.length} notes`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
