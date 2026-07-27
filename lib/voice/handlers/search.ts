/**
 * search_entity tool handler — reuses GlobalSearch's exact stack:
 * local `searchAll` + GET `/api/search?q=` + same merge/dedupe.
 *
 * Voice-only preprocessing (does not change ⌘K ranking):
 * - Strip command filler ("go to … page")
 * - Normalize spoken versions
 * - Resolve ordinals ("first release", "rel 01") via ordered entity lists
 *
 * Candidates expose `path` for navigate_to; `refId` is speech-only.
 */
import { searchAll } from "@/lib/search";
import type { SearchResult } from "@/lib/dummy-data";
import { ENTITY_HREF_PREFIX } from "@/lib/search-entity-types";
import { safeFetchJson, isFetchAbort } from "@/lib/safe-fetch";
import { listEntitiesForVoiceOrdinal } from "@/lib/voice/entity-list";
import {
  parseVoiceSearchIntent,
  voiceEntityLabel,
  type VoiceEntityKind,
} from "@/lib/voice/spoken-query";

export type SearchEntityArgs = {
  query?: unknown;
  entityType?: unknown;
};

export type VoiceSearchCandidate = {
  path: string;
  href: string;
  refId: string;
  label: string;
  type: string;
  sublabel?: string;
};

export type SearchToolResult = {
  ok: boolean;
  tool: "search_entity";
  query: string;
  matchCount: number;
  single?: VoiceSearchCandidate;
  candidates?: VoiceSearchCandidate[];
  instruction: string;
  actionLine: string;
  reason?: string;
};

const MAX_VOICE_CANDIDATES = 5;

const NAVIGATE_WITH_PATH =
  "When calling navigate_to, set path to the candidate's path field (full href starting with /). Never pass refId.";

const PICK_BY_NAME =
  "Read options by human name/version (not technical ids). User may answer with a name or first/second/third.";

/**
 * Same merge/dedupe as GlobalSearch (href|label key), capped for voice.
 */
function mergeResults(a: SearchResult[], b: SearchResult[]): SearchResult[] {
  const seen = new Set<string>();
  return [...a, ...b]
    .filter((r) => {
      const key = `${r.href}|${r.label}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 14);
}

function toCandidate(r: SearchResult): VoiceSearchCandidate {
  return {
    path: r.href,
    href: r.href,
    refId: r.id,
    label: r.label,
    type: r.type,
    sublabel: r.sublabel,
  };
}

function filterByEntityType(
  results: SearchResult[],
  entityType: string | undefined
): SearchResult[] {
  if (!entityType?.trim()) return results;
  const t = entityType.trim().toLowerCase();
  const prefix = ENTITY_HREF_PREFIX[t];
  if (prefix) {
    return results.filter(
      (r) => r.href === prefix || r.href.startsWith(`${prefix}/`) || r.type === t
    );
  }
  return results.filter((r) => r.type === t || r.label.toLowerCase().includes(t));
}

function finishWithResults(
  query: string,
  merged: SearchResult[],
  extras?: { ordinalNote?: string }
): SearchToolResult {
  const matchCount = merged.length;

  if (matchCount === 0) {
    return {
      ok: true,
      tool: "search_entity",
      query,
      matchCount: 0,
      instruction:
        "No matches found. Ask the user for a release/risk name, version (e.g. v2.14), team, or owner — not an id. They can also say first release / second risk.",
      actionLine: `No matches for “${query}”`,
    };
  }

  if (matchCount === 1) {
    const single = toCandidate(merged[0]!);
    const note = extras?.ordinalNote ? ` ${extras.ordinalNote}` : "";
    return {
      ok: true,
      tool: "search_entity",
      query,
      matchCount: 1,
      single,
      instruction: `One match: ${single.label}.${note} Confirm verbally, then call navigate_to with path=${single.path}. ${NAVIGATE_WITH_PATH}`,
      actionLine: extras?.ordinalNote
        ? `${extras.ordinalNote}: ${single.label}`
        : `Found 1 match: ${single.label}`,
    };
  }

  const candidates = merged.slice(0, MAX_VOICE_CANDIDATES).map(toCandidate);
  return {
    ok: true,
    tool: "search_entity",
    query,
    matchCount,
    candidates,
    instruction: `Multiple matches. ${PICK_BY_NAME} Do NOT auto-select. ${NAVIGATE_WITH_PATH}`,
    actionLine: `Found ${matchCount} matches — ask which one by name or first/second`,
  };
}

/**
 * Resolve "first release" / "rel 01" to a concrete SearchResult.
 */
async function resolveOrdinal(
  ordinal: number,
  entityType: VoiceEntityKind,
  displayQuery: string
): Promise<SearchToolResult> {
  const list = await listEntitiesForVoiceOrdinal(entityType);
  const idx = ordinal - 1;
  if (idx < 0 || idx >= list.length) {
    return {
      ok: true,
      tool: "search_entity",
      query: displayQuery,
      matchCount: 0,
      instruction: `There is no ${voiceEntityLabel(entityType).toLowerCase()} #${ordinal}. Ask the user to pick by name/version, or try first/second within 1–${Math.min(list.length, 5)}.`,
      actionLine: `No ${entityType} at position ${ordinal}`,
    };
  }
  const pick = list[idx]!;
  const single = toCandidate(pick);
  const ordinalWord =
    ordinal === 1 ? "first" : ordinal === 2 ? "second" : `${ordinal}th`;
  return {
    ok: true,
    tool: "search_entity",
    query: displayQuery,
    matchCount: 1,
    single,
    // Hard navigate cue — ordinals are unambiguous; do not wait for another turn.
    instruction: `User asked for the ${ordinalWord} ${entityType}: ${single.label}. IMMEDIATELY call navigate_to with path=${single.path} (do not ask which one). Briefly say you are opening it.`,
    actionLine: `${voiceEntityLabel(entityType)} #${ordinal}: ${single.label}`,
  };
}

/**
 * Run voice search (GlobalSearch stack + spoken ordinal/name helpers).
 * @param args - `{ query, entityType? }` from Gemini.
 */
export async function handleSearchEntity(
  args: SearchEntityArgs
): Promise<SearchToolResult> {
  const rawQuery = typeof args.query === "string" ? args.query.trim() : "";
  const entityTypeArg =
    typeof args.entityType === "string" ? args.entityType : undefined;

  if (!rawQuery) {
    return {
      ok: false,
      tool: "search_entity",
      query: "",
      matchCount: 0,
      instruction: "Ask what to open — a name, version, team, or “first release”.",
      actionLine: "Search failed — empty query",
      reason: "Missing query",
    };
  }

  const intent = parseVoiceSearchIntent(rawQuery);

  if (intent.kind === "ordinal") {
    return resolveOrdinal(intent.ordinal, intent.entityType, intent.raw);
  }

  const query = intent.query;
  // Prefer explicit tool arg; spoken "env 001" may already set booking.
  const entityType = entityTypeArg ?? intent.entityType;

  // Mirror GlobalSearch: local index + authenticated /api/search.
  const localResults = searchAll(query);
  let apiResults: SearchResult[] = [];
  const api = await safeFetchJson<{ results?: SearchResult[] }>(
    `/api/search?q=${encodeURIComponent(query)}`,
    { label: "voice-search" }
  );
  if (!isFetchAbort(api) && api.ok) {
    apiResults = api.data.results ?? [];
  }

  const merged = filterByEntityType(mergeResults(localResults, apiResults), entityType);
  return finishWithResults(query, merged);
}
