/**
 * Additive Drift notes / baseline / owner columns. Do not use
 * `prisma db push` — the vendored schema is behind the live DB and would
 * drop organizationId / v2 tables.
 */
import "@/lib/load-db-env-for-tests";
import { prisma } from "@/lib/prisma";

const STATEMENTS = [
  `ALTER TABLE "Drift" ADD COLUMN IF NOT EXISTS "notes" TEXT`,
  `ALTER TABLE "Drift" ADD COLUMN IF NOT EXISTS "baselineNotes" TEXT`,
  `ALTER TABLE "Drift" ADD COLUMN IF NOT EXISTS "assignedTo" TEXT`,
] as const;

async function main(): Promise<void> {
  for (const sql of STATEMENTS) {
    await prisma.$executeRawUnsafe(sql);
  }
  await prisma.referenceData.upsert({
    where: { category_value: { category: "drift_type", value: "Code" } },
    update: { sortOrder: 6, active: true },
    create: { category: "drift_type", value: "Code", sortOrder: 6, active: true },
  });
}

main()
  .catch((err) => {
    console.error("[add-drift-lifecycle-columns] failed", {
      message: err instanceof Error ? err.message : "unknown",
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
