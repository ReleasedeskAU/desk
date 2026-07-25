/**
 * Phase 2 proof: get_summary for multiple entity types + timing.
 * Uses Conversation Agent DB layer (lookupReleaseByCode + prisma).
 *
 * Run: npx tsx scripts/repro-voice-get-summary.mjs
 */
import { readFileSync } from "fs";
import { resolve } from "path";

function parseEnv(t) {
  const o = {};
  for (const r of t.split(/\r?\n/)) {
    const l = r.trim();
    if (!l || l.startsWith("#")) continue;
    const i = l.indexOf("=");
    if (i < 0) continue;
    let k = l.slice(0, i).trim();
    let v = l.slice(i + 1).trim();
    if ((v[0] === '"' && v.endsWith('"')) || (v[0] === "'" && v.endsWith("'"))) v = v.slice(1, -1);
    o[k] = v;
  }
  return o;
}

const env = parseEnv(readFileSync(resolve(".env"), "utf8"));
for (const k of ["DATABASE_URL", "DIRECT_URL"]) if (env[k]) process.env[k] = env[k];

const { lookupEntitySpokenSummary } = await import("../lib/conversation-entity-summary.ts");
const { lookupReleaseByCode } = await import("../lib/conversation-context.ts");

const cases = [
  ["release", "REL-0001"],
  ["booking", "ENV-0001"],
  ["blocker", "BLK-0001"],
  ["risk", "RSK-001"],
];

console.log("=== Conversation Agent reuse check ===");
const releaseTool = await lookupReleaseByCode("REL-0001");
console.log(
  "lookupReleaseByCode(REL-0001):",
  releaseTool
    ? `found ${releaseTool.releaseCode} status=${releaseTool.status} risks=${releaseTool.risks.length}`
    : "null (DB empty or not seeded)"
);

console.log("\n=== get_summary samples ===");
const timings = [];
for (const [entityType, entityId] of cases) {
  const t0 = performance.now();
  const result = await lookupEntitySpokenSummary(entityType, entityId);
  const ms = Math.round(performance.now() - t0);
  timings.push({ entityType, entityId, ms, status: result.status });
  console.log(`\n--- ${entityType} ${entityId} (${ms}ms) ---`);
  console.log(JSON.stringify(result, null, 2));
}

// Slower case: application summary (extra count queries) + environment desk
console.log("\n=== slower-ish cases ===");
for (const [entityType, entityId] of [
  ["application", "Kyriba"],
  ["environment", "desk"],
]) {
  const t0 = performance.now();
  const result = await lookupEntitySpokenSummary(entityType, entityId);
  const ms = Math.round(performance.now() - t0);
  timings.push({ entityType, entityId, ms, status: result.status });
  console.log(`\n--- ${entityType} ${entityId} (${ms}ms) ---`);
  if (result.status === "found") console.log(result.summary);
  else console.log(JSON.stringify(result));
}

const slowest = [...timings].sort((a, b) => b.ms - a.ms)[0];
console.log("\n=== timing summary ===");
console.log(JSON.stringify({ timings, slowest }, null, 2));

const found = timings.filter((t) => t.status === "found").length;
console.log(
  found >= 3
    ? `\nPASS: ${found} summaries produced; slowest ${slowest.entityType}/${slowest.entityId} ${slowest.ms}ms`
    : `\nFAIL: only ${found} found summaries (is the DB seeded?)`
);
process.exit(found >= 3 ? 0 : 1);
