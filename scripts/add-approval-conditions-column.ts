/**
 * Additive Approval.conditions column. Do not use `prisma db push` — the
 * vendored schema is behind the live DB and would drop organizationId / v2 tables.
 */
import "@/lib/load-db-env-for-tests";
import { prisma } from "@/lib/prisma";

async function main(): Promise<void> {
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Approval" ADD COLUMN IF NOT EXISTS "conditions" TEXT`
  );
}

main()
  .catch((err) => {
    console.error("[add-approval-conditions-column] failed", {
      message: err instanceof Error ? err.message : "unknown",
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
