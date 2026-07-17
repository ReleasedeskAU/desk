/**
 * Copies monorepo packages/database schema into vendor/ for Vercel deploys.
 * Run from Sentinal-old before committing Sentinel when the shared schema changes.
 */
import { cpSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sentinelRoot = resolve(__dirname, "..");
const srcRoot = resolve(sentinelRoot, "../packages/database");
const destRoot = resolve(sentinelRoot, "vendor/releasedesk-database");

if (!existsSync(resolve(srcRoot, "prisma/schema.prisma"))) {
  console.error("sync-vendor-database: missing packages/database/prisma/schema.prisma");
  process.exit(1);
}

mkdirSync(resolve(destRoot, "prisma"), { recursive: true });
cpSync(resolve(srcRoot, "prisma/schema.prisma"), resolve(destRoot, "prisma/schema.prisma"));
const migrationsSrc = resolve(srcRoot, "prisma/migrations");
const migrationsDest = resolve(destRoot, "prisma/migrations");
if (existsSync(migrationsSrc)) {
  rmSync(migrationsDest, { recursive: true, force: true });
  cpSync(migrationsSrc, migrationsDest, { recursive: true });
}
console.log("sync-vendor-database: OK → vendor/releasedesk-database");
