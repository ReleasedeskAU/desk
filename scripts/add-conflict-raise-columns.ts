/**
 * Additive Conflict raise/period columns. Do not use `prisma db push` — the
 * vendored schema is behind the live DB and would drop organizationId / v2 tables.
 */
import "@/lib/load-db-env-for-tests";
import { prisma } from "@/lib/prisma";

const STATEMENTS = [
  `ALTER TABLE "EnvironmentConflict" ADD COLUMN IF NOT EXISTS "conflictPeriod" TEXT`,
  `ALTER TABLE "EnvironmentConflict" ADD COLUMN IF NOT EXISTS "raisedBy" TEXT`,
  `ALTER TABLE "EnvironmentConflict" ADD COLUMN IF NOT EXISTS "raisedDate" TIMESTAMP(3)`,
] as const;

async function main(): Promise<void> {
  for (const sql of STATEMENTS) {
    await prisma.$executeRawUnsafe(sql);
  }
}

main()
  .catch((err) => {
    console.error("[add-conflict-raise-columns] failed", {
      message: err instanceof Error ? err.message : "unknown",
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
