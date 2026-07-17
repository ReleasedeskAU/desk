/**
 * Additive-only: create IntegrationFlow table if missing.
 * Does NOT run prisma db push (avoids schema-drift data-loss prompts).
 * Run: npx tsx prisma/apply-integration-flows-migration.ts
 */
import { config } from "dotenv";
config({ override: true });
import { PrismaClient } from "@releasedesk/database";

const prisma = new PrismaClient();

async function wake() {
  for (let i = 0; i < 5; i++) {
    try {
      await prisma.$queryRawUnsafe("SELECT 1");
      return;
    } catch (err) {
      const delay = 800 * 2 ** i;
      console.warn(`wake retry ${i + 1}/5 in ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error("Could not reach database after wake retries");
}

async function main() {
  await wake();
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "IntegrationFlow" (
      "id" TEXT NOT NULL,
      "flowCode" TEXT NOT NULL,
      "sourceSystem" TEXT NOT NULL,
      "targetSystem" TEXT NOT NULL,
      "integrationType" TEXT NOT NULL,
      "frequency" TEXT NOT NULL,
      "dataElements" TEXT NOT NULL,
      "businessPurpose" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "IntegrationFlow_pkey" PRIMARY KEY ("id")
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "IntegrationFlow_flowCode_key"
    ON "IntegrationFlow"("flowCode")
  `);

  const rows = await prisma.$queryRawUnsafe<Array<{ exists: string | null }>>(
    `SELECT to_regclass('public."IntegrationFlow"')::text AS exists`
  );
  console.log("IntegrationFlow table:", rows[0]?.exists ?? "missing");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
