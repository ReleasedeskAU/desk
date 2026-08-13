/**
 * Additive Wave 4 columns. Do not use `prisma db push` — the vendored schema
 * is behind the live DB and would drop organizationId / v2 tables.
 */
import "@/lib/load-db-env-for-tests";
import { prisma } from "@/lib/prisma";

const STATEMENTS = [
  `ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "statusKey" TEXT`,
  `ALTER TABLE "ReleaseDependency" ADD COLUMN IF NOT EXISTS "statusKey" TEXT`,
  `ALTER TABLE "EnvironmentConflict" ADD COLUMN IF NOT EXISTS "statusKey" TEXT`,
  `ALTER TABLE "Blocker" ADD COLUMN IF NOT EXISTS "statusKey" TEXT`,
  `ALTER TABLE "Risk" ADD COLUMN IF NOT EXISTS "statusKey" TEXT`,
  `ALTER TABLE "Drift" ADD COLUMN IF NOT EXISTS "statusKey" TEXT`,
  `ALTER TABLE "MonitoringAlert" ADD COLUMN IF NOT EXISTS "statusKey" TEXT`,
  `ALTER TABLE "Incident" ADD COLUMN IF NOT EXISTS "statusKey" TEXT`,
  `ALTER TABLE "Approval" ADD COLUMN IF NOT EXISTS "decisionKey" TEXT`,
] as const;

async function main(): Promise<void> {
  for (const sql of STATEMENTS) {
    await prisma.$executeRawUnsafe(sql);
  }
}

main()
  .catch((err) => {
    console.error("[add-status-key-columns] failed", {
      message: err instanceof Error ? err.message : "unknown",
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
