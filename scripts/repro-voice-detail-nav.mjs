/**
 * Bug 2 repro: search → navigate_to for detail pages.
 * Run: npx tsx scripts/repro-voice-detail-nav.mjs
 */
import { searchAll } from "../lib/search.ts";
import { handleNavigateTo } from "../lib/voice/handlers/navigate.ts";
import { handleSearchEntity } from "../lib/voice/handlers/search.ts";
import { isAllowedVoicePath, normalizeVoicePath } from "../lib/voice/route-allowlist.ts";

async function checkNavigate(path, label) {
  const pushed = [];
  const result = await handleNavigateTo(
    { path, label },
    {
      push: (h) => pushed.push(h),
      // Offline repro: only local catalog + hallucination rules (no live API).
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

console.log("=== LOCAL searchAll('REL-001') ===");
console.log(JSON.stringify(searchAll("REL-001").slice(0, 8), null, 2));

console.log("\n=== search_entity('REL') candidate shape (path vs refId) ===");
const searchResult = await handleSearchEntity({ query: "REL" });
const sample = (searchResult.candidates ?? []).slice(0, 3);
console.log(
  JSON.stringify(
    sample.map((c) => ({ path: c.path, href: c.href, refId: c.refId, label: c.label })),
    null,
    2
  )
);
console.log("instruction:", searchResult.instruction);

console.log("\n=== navigate_to critical cases ===");
const first = sample[0];
const cases = [
  ["REL-001", undefined],
  ["/releases/REL-001", undefined],
  [first?.refId, first?.label],
  [first?.path, first?.label],
];
for (const [path, label] of cases) {
  if (path == null) continue;
  console.log(JSON.stringify(await checkNavigate(path, label)));
}
