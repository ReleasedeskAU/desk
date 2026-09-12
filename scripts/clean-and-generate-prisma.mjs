/**
 * Wipe and regenerate the vendored Prisma client before Next.js typecheck/build.
 * Vercel build cache can otherwise leave an outdated generated client (missing
 * models) that fails `next build` typecheck or runtime (`undefined.findMany`).
 *
 * With `npm install --install-links`, `@releasedesk/database` is often a *copy*
 * under node_modules — regenerating only vendor/ leaves that copy stale. After
 * generate we sync vendor/generated → node_modules/@releasedesk/database/generated.
 *
 * Usage: node scripts/clean-and-generate-prisma.mjs
 */
import { existsSync, rmSync, readFileSync, cpSync, realpathSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sentinelRoot = resolve(__dirname, "..");
const vendorPackageDir = resolve(sentinelRoot, "vendor/releasedesk-database");
const generatedDir = resolve(vendorPackageDir, "generated");
const schemaPath = resolve(vendorPackageDir, "prisma/schema.prisma");
const nmPackageDir = resolve(
  sentinelRoot,
  "node_modules/@releasedesk/database"
);
const nmGeneratedDir = resolve(nmPackageDir, "generated");

/**
 * True when node_modules package is the same folder as vendor (junction/symlink).
 * In that case syncing would rm the source we just generated.
 */
function isLinkedToVendorPackage() {
  if (!existsSync(nmPackageDir) || !existsSync(vendorPackageDir)) return false;
  try {
    return realpathSync(nmPackageDir) === realpathSync(vendorPackageDir);
  } catch {
    return false;
  }
}

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

// Fail fast if required models are missing from types (stale/wrong schema).
const dts = readFileSync(serviceMarker, "utf8");
for (const needle of [
  "get service()",
  "get userRiskEngineConfig()",
  "get userReleaseLifecycleStatus()",
  "get userReleaseLifecycleTransition()",
  "get userReleaseLifecycleGate()",
  "get userReleaseFieldLockConfig()",
  "get deploymentBlocker()",
  "get voiceUserPolicy()",
]) {
  if (!dts.includes(needle)) {
    console.error(
      `clean-and-generate-prisma: generated types missing "${needle}" — schema/client mismatch`
    );
    process.exit(1);
  }
}

// Keep runtime resolution in sync when npm used --install-links (real copy).
// Skip when node_modules is a junction/symlink to vendor — deleting nmGenerated
// would wipe the vendor client we just generated (local Windows installs).
if (!existsSync(nmPackageDir)) {
  console.warn(
    "clean-and-generate-prisma: node_modules/@releasedesk/database missing — skip sync"
  );
} else if (isLinkedToVendorPackage()) {
  console.log(
    "clean-and-generate-prisma: node_modules links to vendor — skip sync"
  );
} else {
  console.log(
    "clean-and-generate-prisma: syncing generated client → node_modules/@releasedesk/database"
  );
  if (existsSync(nmGeneratedDir)) {
    rmSync(nmGeneratedDir, { recursive: true, force: true });
  }
  cpSync(generatedDir, nmGeneratedDir, { recursive: true });
}

console.log(
  "clean-and-generate-prisma: OK (Service + risk/lifecycle + VoiceUserPolicy present)"
);
