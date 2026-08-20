/**
 * Additive UserEntityFieldLockConfig table. Do not use `prisma db push` —
 * the vendored schema is behind the live DB and would drop organizationId / v2 tables.
 */
import "@/lib/load-db-env-for-tests";
import { prisma } from "@/lib/prisma";

async function main(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "UserEntityFieldLockConfig" (
      "id" TEXT NOT NULL,
      "clerkUserId" TEXT NOT NULL,
      "organizationId" TEXT,
      "entityType" TEXT NOT NULL,
      "fieldKey" TEXT NOT NULL,
      "category" TEXT NOT NULL,
      "lockRuleRef" TEXT,
      "isConfigurable" BOOLEAN NOT NULL DEFAULT true,
      "statusRules" JSONB NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "UserEntityFieldLockConfig_pkey" PRIMARY KEY ("id")
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "UserEntityFieldLockConfig_clerkUserId_entityType_fieldKey_key"
      ON "UserEntityFieldLockConfig"("clerkUserId", "entityType", "fieldKey")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "UserEntityFieldLockConfig_clerkUserId_entityType_idx"
      ON "UserEntityFieldLockConfig"("clerkUserId", "entityType")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "UserEntityFieldLockConfig_organizationId_idx"
      ON "UserEntityFieldLockConfig"("organizationId")
  `);
}

main()
  .catch((err) => {
    console.error("[add-entity-field-lock-table] failed", {
      message: err instanceof Error ? err.message : "unknown",
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
