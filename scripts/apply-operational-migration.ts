/**
 * Applies the V0.6 operational-data migration through the pooled app connection.
 * This is used when the configured DIRECT_URL is unavailable to Prisma Migrate.
 */
import fs from "fs";
import path from "path";
import { prisma } from "../lib/prisma";

async function main() {
  const migrationPath = path.join(
    process.cwd(),
    "prisma",
    "migrations",
    "operational_excel_v06_fidelity",
    "migration.sql"
  );
  const sql = fs.readFileSync(migrationPath, "utf8");
  const statements = sql
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }
  console.log("Applied operational_excel_v06_fidelity");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
