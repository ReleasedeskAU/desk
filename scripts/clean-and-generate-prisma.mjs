/**
 * Wipe and regenerate the vendored Prisma client before Next.js typecheck/build.
 * Vercel build cache can otherwise leave an outdated generated client (missing
 * models like Service / UserRiskEngineConfig) that fails `next build` typecheck
 * even when prisma generate appears to succeed.
 *
 * Usage: node scripts/clean-and-generate-prisma.mjs
 */
import { existsSync, rmSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sentinelRoot = resolve(__dirname, "..");
const generatedDir = resolve(
  sentinelRoot,
  "vendor/releasedesk-database/generated"
);
const schemaPath = resolve(
  sentinelRoot,
  "vendor/releasedesk-database/prisma/schema.prisma"
);

if (!existsSync(schemaPath)) {
  console.error("clean-and-generate-prisma: missing", schemaPath);
  process.exit(1);
}

if (existsSync(generatedDir)) {
  console.log("clean-and-generate-prisma: removing", generatedDir);
  rmSync(generatedDir, { recursive: true, force: true });
}

const prismaCliCandidates = [
  resolve(sentinelRoot, "node_modules/prisma/build/index.js"),
  resolve(sentinelRoot, "../node_modules/prisma/build/index.js"),
  resolve(sentinelRoot, "vendor/releasedesk-database/node_modules/prisma/build/index.js"),
];
const prismaCli = prismaCliCandidates.find((p) => existsSync(p));
if (!prismaCli) {
  console.error("clean-and-generate-prisma: prisma CLI not found");
  process.exit(1);
}

console.log("clean-and-generate-prisma: prisma generate --schema vendor/...");
const result = spawnSync(
  process.execPath,
  [prismaCli, "generate", "--schema", schemaPath],
  {
    cwd: sentinelRoot,
    env: process.env,
    stdio: "inherit",
    encoding: "utf8",
  }
);

if ((result.status ?? 1) !== 0) {
  process.exit(result.status ?? 1);
}

const serviceMarker = resolve(generatedDir, "client/index.d.ts");
if (!existsSync(serviceMarker)) {
  console.error("clean-and-generate-prisma: generate did not produce index.d.ts");
  process.exit(1);
}

// Fail fast if the new Copilot models are missing from types (stale/wrong schema).
const { readFileSync } = await import("node:fs");
const dts = readFileSync(serviceMarker, "utf8");
for (const needle of ["get service()", "get userRiskEngineConfig()", "get deploymentBlocker()"]) {
  if (!dts.includes(needle)) {
    console.error(
      `clean-and-generate-prisma: generated types missing "${needle}" — schema/client mismatch`
    );
    process.exit(1);
  }
}

console.log("clean-and-generate-prisma: OK (Service + UserRiskEngineConfig present)");
