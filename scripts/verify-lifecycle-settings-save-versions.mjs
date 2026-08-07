/**
 * Read-only-ish integration check: settings-UI-style save path must append a
 * new UserReleaseLifecycleConfigVersion on every save (not overwrite in place).
 *
 * Uses a dedicated synthetic clerkUserId so it does not touch a real user's graph.
 * Cleans up that synthetic user's rows at the end.
 *
 * Usage (from Sentinel-lifecycle-settings/):
 *   node scripts/verify-lifecycle-settings-save-versions.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const envPath = resolve(root, ".env");
const TEST_USER = "settings-ui-version-verify-bot";

function parseDotEnv(text) {
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

if (existsSync(envPath)) {
  const fromFile = parseDotEnv(readFileSync(envPath, "utf8"));
  for (const key of ["DATABASE_URL", "DIRECT_URL"]) {
    if (fromFile[key]) process.env[key] = fromFile[key];
  }
}

const require = createRequire(import.meta.url);
// Prefer vendored generated client (same as app).
let PrismaClient;
try {
  ({ PrismaClient } = require("../vendor/releasedesk-database/generated/client/index.js"));
} catch {
  ({ PrismaClient } = require("@prisma/client"));
}

const {
  createDefaultReleaseLifecycleConfig,
} = await import("../lib/release-lifecycle-config.ts");
const {
  addLifecycleStatus,
  toggleLifecycleTransition,
  toggleLifecycleGate,
  setLifecycleTransitionEnforcement,
} = await import("../lib/release-lifecycle-settings-ui.ts");
const {
  loadReleaseLifecycleConfig,
  saveReleaseLifecycleConfig,
} = await import("../lib/release-lifecycle-config-db.ts");

const prisma = new PrismaClient();

async function cleanup() {
  await prisma.userReleaseLifecycleGate.deleteMany({ where: { clerkUserId: TEST_USER } });
  await prisma.userReleaseLifecycleTransition.deleteMany({
    where: { clerkUserId: TEST_USER },
  });
  await prisma.userReleaseLifecycleStatus.deleteMany({ where: { clerkUserId: TEST_USER } });
  await prisma.userReleaseLifecycleConfigVersion.deleteMany({
    where: { clerkUserId: TEST_USER },
  });
}

async function listVersions() {
  return prisma.userReleaseLifecycleConfigVersion.findMany({
    where: { clerkUserId: TEST_USER },
    orderBy: { version: "asc" },
    select: { id: true, version: true, snapshot: true, createdAt: true },
  });
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

try {
  await cleanup();

  // Seed (first access) — expect version 1
  const loaded = await loadReleaseLifecycleConfig(TEST_USER);
  let versions = await listVersions();
  assert(versions.length === 1, `expected 1 version after seed, got ${versions.length}`);
  assert(versions[0].version === 1, `expected version=1, got ${versions[0].version}`);
  assert(loaded.latestVersion === 1, `load latestVersion should be 1, got ${loaded.latestVersion}`);
  console.log("OK seed created version 1", { id: versions[0].id });

  // Simulate Statuses panel: add custom status then Save (PUT path)
  let draft = createDefaultReleaseLifecycleConfig();
  const added = addLifecycleStatus(draft, "Peer Review", false);
  assert("config" in added, added.error ?? "add status failed");
  draft = added.config;
  const saved1 = await saveReleaseLifecycleConfig(TEST_USER, draft);
  versions = await listVersions();
  assert(versions.length === 2, `expected 2 versions after status save, got ${versions.length}`);
  assert(versions[1].version === 2, `expected version=2, got ${versions[1].version}`);
  assert(versions[0].id !== versions[1].id, "version ids must be distinct (append, not overwrite)");
  const snap2 = versions[1].snapshot;
  assert(
    Array.isArray(snap2?.statuses) &&
      snap2.statuses.some((s) => s.label === "Peer Review"),
    "version 2 snapshot must include Peer Review status"
  );
  assert(
    saved1.statuses.some((s) => s.label === "Peer Review"),
    "head graph after save must include Peer Review"
  );
  console.log("OK Statuses-panel save appended version 2", { id: versions[1].id });

  // Simulate Transitions panel: disable draft→planning + set Required with warning path
  const toggled = toggleLifecycleTransition(draft, "draft", "cancelled", false);
  assert("config" in toggled, toggled.error ?? "toggle failed");
  draft = toggled.config;
  const enf = setLifecycleTransitionEnforcement(draft, "planning", "testing", "required");
  assert("config" in enf, enf.error ?? "enforcement failed");
  draft = enf.config;
  await saveReleaseLifecycleConfig(TEST_USER, draft);
  versions = await listVersions();
  assert(versions.length === 3, `expected 3 versions after transition save, got ${versions.length}`);
  assert(versions[2].version === 3, `expected version=3, got ${versions[2].version}`);
  const snap3 = versions[2].snapshot;
  const draftCancelled = snap3.transitions.find(
    (t) => t.fromKey === "draft" && t.toKey === "cancelled"
  );
  assert(draftCancelled && draftCancelled.enabled === false, "snapshot must record disabled edge");
  console.log("OK Transitions-panel save appended version 3", { id: versions[2].id });

  // Simulate Gates panel: attach owner_set on draft→planning
  const gated = toggleLifecycleGate(draft, "draft", "planning", "owner_set", true);
  assert("config" in gated, gated.error ?? "gate toggle failed");
  draft = gated.config;
  await saveReleaseLifecycleConfig(TEST_USER, draft);
  versions = await listVersions();
  assert(versions.length === 4, `expected 4 versions after gates save, got ${versions.length}`);
  assert(versions[3].version === 4, `expected version=4, got ${versions[3].version}`);
  const snap4 = versions[3].snapshot;
  const edge = snap4.transitions.find((t) => t.fromKey === "draft" && t.toKey === "planning");
  assert(
    edge?.gates?.some((g) => g.gateType === "owner_set" && g.enabled),
    "version 4 snapshot must include owner_set gate"
  );
  // Prior snapshots must remain unchanged (immutability)
  assert(
    !versions[1].snapshot.transitions
      ?.find((t) => t.fromKey === "draft" && t.toKey === "planning")
      ?.gates?.some((g) => g.gateType === "owner_set"),
    "version 2 snapshot must stay unchanged (no in-place mutation)"
  );
  console.log("OK Gates-panel save appended version 4; prior snapshots immutable", {
    id: versions[3].id,
  });

  console.log("\nPASS: settings UI save path creates a new version snapshot each time.");
  console.log(
    JSON.stringify(
      {
        versions: versions.map((v) => ({ id: v.id, version: v.version })),
        headStatusCount: (await loadReleaseLifecycleConfig(TEST_USER)).config.statuses.length,
      },
      null,
      2
    )
  );
} catch (err) {
  console.error("FAIL:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  try {
    await cleanup();
  } catch (cleanupErr) {
    console.error("cleanup warning:", cleanupErr instanceof Error ? cleanupErr.message : cleanupErr);
  }
  await prisma.$disconnect();
}
