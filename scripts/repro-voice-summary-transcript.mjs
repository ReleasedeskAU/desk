/**
 * Simulated VoiceMic transcript for Phase 2 get_summary (same action lines
 * the Live client emits while tools run). Uses real Conversation Agent DB data.
 *
 * Run: npx tsx scripts/repro-voice-summary-transcript.mjs
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

const question = "What's blocking REL-0001?";
console.log("user:", question);
console.log("system: [thinking — get_summary in flight]");

const t0 = performance.now();
const result = await lookupEntitySpokenSummary("release", "REL-0001");
const ms = Math.round(performance.now() - t0);

if (result.status !== "found") {
  console.log("FAIL", result);
  process.exit(1);
}

console.log(`action: Summary: release ${result.entityId} (${ms}ms)`);
console.log("assistant (would speak):", result.summary);
console.log(
  "\nNote: Live session keeps mic UI in phase=thinking while tools await; audio WS is not torn down. Full Gemini TTS requires an interactive VoiceMic session in the browser."
);
process.exit(0);
