/**
 * Additive Dependency Kind column. Do not use `prisma db push` — the
 * vendored schema is behind the live DB and would drop organizationId / v2 tables.
 */
import "@/lib/load-db-env-for-tests";
import { prisma } from "@/lib/prisma";

const STATEMENTS = [
  `ALTER TABLE "ReleaseDependency" ADD COLUMN IF NOT EXISTS "dependencyKind" TEXT`,
] as const;

async function main(): Promise<void> {
  for (const sql of STATEMENTS) {
    await prisma.$executeRawUnsafe(sql);
  }
}

main()
  .catch((err) => {
    console.error("[add-dependency-kind-column] failed", {
      message: err instanceof Error ? err.message : "unknown",
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
