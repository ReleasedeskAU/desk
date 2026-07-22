/**
 * Run prisma migrate deploy for the shared @releasedesk/database schema,
 * using Sentinel/.env the same way the Next.js app does.
 *
 * Why the old approach failed: Prisma was started with cwd=packages/database,
 * so it never auto-loaded Sentinel/.env. Manual env injection into the child
 * process was unreliable on Windows (Prisma then reported user "(not available)").
 *
 * Fix: keep cwd at Sentinel (where .env lives) and point --schema at the
 * shared package. Force DATABASE_URL / DIRECT_URL from Sentinel/.env over
 * ambient process.env (stale shell DIRECT_URL otherwise wins and breaks Neon).
 *
 * Usage (from Sentinel/): node scripts/run-db-migrate.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sentinelRoot = resolve(__dirname, "..");
const schemaPath = resolve(sentinelRoot, "../packages/database/prisma/schema.prisma");
const envPath = resolve(sentinelRoot, ".env");

/**
 * Parse KEY=VALUE lines from a .env file (no expansion).
 * @param {string} text
 * @returns {Record<string, string>}
 */
function parseDotEnv(text) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

if (!existsSync(envPath)) {
  console.error("run-db-migrate: missing Sentinel/.env");
  process.exit(1);
}
if (!existsSync(schemaPath)) {
  console.error("run-db-migrate: missing shared schema at", schemaPath);
  process.exit(1);
}

const fromFile = parseDotEnv(readFileSync(envPath, "utf8"));
const childEnv = { ...process.env };
for (const key of ["DATABASE_URL", "DIRECT_URL"]) {
  if (fromFile[key]) childEnv[key] = fromFile[key];
}

const prismaCliCandidates = [
  resolve(sentinelRoot, "../node_modules/prisma/build/index.js"),
  resolve(sentinelRoot, "node_modules/prisma/build/index.js"),
  resolve(sentinelRoot, "../packages/database/node_modules/prisma/build/index.js"),
];
const prismaCli = prismaCliCandidates.find((p) => existsSync(p));
if (!prismaCli) {
  console.error("run-db-migrate: prisma CLI not found");
  process.exit(1);
}

console.log("run-db-migrate: cwd=Sentinel (loads .env), schema=packages/database");

const result = spawnSync(
  process.execPath,
  [prismaCli, "migrate", "deploy", "--schema", schemaPath],
  {
    cwd: sentinelRoot,
    env: childEnv,
    encoding: "utf8",
    stdio: "inherit",
  }
);

process.exit(result.status ?? 1);
