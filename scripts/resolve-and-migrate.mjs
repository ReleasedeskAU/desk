/**
 * Recover Prisma migrate history for a DB that was built with db push.
 * Marks all historical migrations as already applied, then deploys only pending ones
 * (expected: 20260721120000_copilot_p1_s1_foundation).
 *
 * Usage (from Sentinel/): node scripts/resolve-and-migrate.mjs
 *
 * Security: forces DATABASE_URL / DIRECT_URL from Sentinel/.env over ambient
 * process.env so a stale shell DIRECT_URL cannot point migrate at the wrong host.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sentinelRoot = resolve(__dirname, "..");
const schemaPath = resolve(sentinelRoot, "../packages/database/prisma/schema.prisma");
const migrationsDir = resolve(sentinelRoot, "../packages/database/prisma/migrations");
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

/**
 * Build child env with Sentinel/.env winning for DB URLs.
 * @returns {NodeJS.ProcessEnv}
 */
function envForPrisma() {
  if (!existsSync(envPath)) {
    console.error("resolve-and-migrate: missing Sentinel/.env");
    process.exit(1);
  }
  const fromFile = parseDotEnv(readFileSync(envPath, "utf8"));
  const env = { ...process.env };
  // Prefer file values so ambient Cursor/shell env cannot override DIRECT_URL.
  for (const key of ["DATABASE_URL", "DIRECT_URL"]) {
    if (fromFile[key]) env[key] = fromFile[key];
  }
  return env;
}

const prismaCliCandidates = [
  resolve(sentinelRoot, "../node_modules/prisma/build/index.js"),
  resolve(sentinelRoot, "node_modules/prisma/build/index.js"),
];
const prismaCli = prismaCliCandidates.find((p) => existsSync(p));
if (!prismaCli) {
  console.error("prisma CLI not found");
  process.exit(1);
}

const childEnv = envForPrisma();

/**
 * Run prisma CLI with shared schema and forced .env DB URLs.
 * @param {string[]} args
 * @returns {number}
 */
function run(args) {
  console.log("\n>", "prisma", args.join(" "));
  const result = spawnSync(process.execPath, [prismaCli, ...args], {
    cwd: sentinelRoot,
    env: childEnv,
    encoding: "utf8",
    stdio: "inherit",
  });
  return result.status ?? 1;
}

const migrations = readdirSync(migrationsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name !== "migration_lock.toml")
  .map((d) => d.name)
  .sort();

// Newest migration is the only one we want to actually apply if missing.
const NEWEST = "20260721120000_copilot_p1_s1_foundation";
const historical = migrations.filter((m) => m !== NEWEST);

console.log("Marking historical migrations as already applied (%d)...", historical.length);
for (const name of historical) {
  // Failed apply left 0_baseline in a failed state — clear it before marking applied.
  if (name === "0_baseline") {
    run(["migrate", "resolve", "--rolled-back", name, "--schema", schemaPath]);
  }
  const code = run(["migrate", "resolve", "--applied", name, "--schema", schemaPath]);
  // 0 = ok; non-zero may mean already recorded — continue.
  if (code !== 0) {
    console.warn("resolve --applied returned", code, "for", name, "(may already be recorded)");
  }
}

console.log("\nDeploying remaining migrations...");
const deployCode = run(["migrate", "deploy", "--schema", schemaPath]);
process.exit(deployCode);
