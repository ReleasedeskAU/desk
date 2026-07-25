/**
 * Coverage proof: spoken "env 001" → search_entity → navigate_to /booking/ENV-0001.
 * Same style as Bug 2 REL-001 repro.
 *
 * Run: npx tsx scripts/repro-voice-env-001.mjs
 */
import { searchAll } from "../lib/search.ts";
import { handleNavigateTo } from "../lib/voice/handlers/navigate.ts";
import { handleSearchEntity } from "../lib/voice/handlers/search.ts";
import { isAllowedVoicePath, normalizeVoicePath } from "../lib/voice/route-allowlist.ts";
import { parseVoiceSearchIntent } from "../lib/voice/spoken-query.ts";

async function checkNavigate(path, label) {
  const pushed = [];
  const result = await handleNavigateTo(
    { path, label },
    {
      push: (h) => pushed.push(h),
      // Offline repro: seed localExists for ENV-* (no live API).
      fetch: async () => new Response(null, { status: 404 }),
    }
  );
  return {
    inputPath: path,
    normalized: normalizeVoicePath(String(path)),
    allowedShape: isAllowedVoicePath(String(path)),
    ok: result.ok,
    reason: result.reason ?? null,
    actionLine: result.actionLine,
    pushed,
  };
}

console.log("=== spoken intent('env 001') ===");
console.log(JSON.stringify(parseVoiceSearchIntent("go to env 001 page"), null, 2));

console.log("\n=== LOCAL searchAll('env 001') ===");
const local = searchAll("env 001");
console.log(JSON.stringify(local.slice(0, 5), null, 2));

console.log("\n=== LOCAL searchAll('ENV-0001') ===");
console.log(JSON.stringify(searchAll("ENV-0001").slice(0, 3), null, 2));

console.log("\n=== search_entity('env 001') ===");
const searchResult = await handleSearchEntity({ query: "env 001" });
console.log(
  JSON.stringify(
    {
      ok: searchResult.ok,
      matchCount: searchResult.matchCount,
      actionLine: searchResult.actionLine,
      single: searchResult.single
        ? {
            path: searchResult.single.path,
            href: searchResult.single.href,
            refId: searchResult.single.refId,
            label: searchResult.single.label,
            type: searchResult.single.type,
          }
        : null,
      candidates: (searchResult.candidates ?? []).slice(0, 3).map((c) => ({
        path: c.path,
        refId: c.refId,
        label: c.label,
        type: c.type,
      })),
      instruction: searchResult.instruction,
    },
    null,
    2
  )
);

const path =
  searchResult.single?.path ?? searchResult.candidates?.[0]?.path ?? null;
const label =
  searchResult.single?.label ?? searchResult.candidates?.[0]?.label;

console.log("\n=== navigate_to critical cases ===");
const cases = [
  ["ENV-0001", undefined],
  ["/booking/ENV-0001", "ENV-0001 booking"],
  [path, label],
];
for (const [p, l] of cases) {
  if (p == null) continue;
  console.log(JSON.stringify(await checkNavigate(p, l)));
}

const ok =
  local.some((r) => r.href === "/booking/ENV-0001") &&
  path === "/booking/ENV-0001" &&
  (await checkNavigate(path, label)).ok === true;

console.log(ok ? "\nPASS: env 001 → /booking/ENV-0001 navigates" : "\nFAIL");
process.exit(ok ? 0 : 1);
