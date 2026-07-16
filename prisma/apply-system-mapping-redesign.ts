/**
 * Applies only the additive System Mapping redesign migration.
 * Run: npx tsx prisma/apply-system-mapping-redesign.ts
 */
import fs from "fs";
import path from "path";
import { prisma } from "../lib/prisma";

async function main() {
  const migrationPath = path.join(
    process.cwd(),
    "prisma",
    "migrations",
    "20260716121500_add_system_mapping_redesign",
    "migration.sql"
  );
  const statements = fs
    .readFileSync(migrationPath, "utf8")
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }
  console.info("Applied additive System Mapping redesign migration");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
