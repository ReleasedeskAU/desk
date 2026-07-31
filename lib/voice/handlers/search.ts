/**
 * search_entity tool handler — GlobalSearch stack + voice context agent.
 *
 * Voice preprocessing:
 * - Shorthand codes ("release 75" → REL-0075)
 * - Ordinals ("first release", "10th blocker") via ordered lists / APP_CONTEXT
 * - Fuzzy multi-term retrieve + session memory ("that release")
 * - Short TTL cache (optimize repeats; DB remains SoT)
 *
 * Candidates expose `path` for navigate_to; `refId` is speech-only.
 */
import type { SearchResult } from "@/lib/dummy-data";
import { safeFetchJson, isFetchAbort } from "@/lib/safe-fetch";
import { listEntitiesForVoiceOrdinal } from "@/lib/voice/entity-list";
import {
  getVoiceAppContext,
  resolveVisibleOrdinal,
} from "@/lib/voice/app-context";
import {
  planVoiceContextQuery,
  rememberVoiceEntity,
  retrieveVoiceContext,
} from "@/lib/voice/context-agent";
import {
  parseBareOrdinal,
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

const MAX_VOICE_CANDIDATES = 8;

const NAVIGATE_WITH_PATH =
  "When calling navigate_to, set path to the candidate's path field (full href starting with /). Never pass refId.";

/** Never invent business codes — ground speech in tool candidates only. */
const SPEAK_EXACT_CODES =
  "Speak ONLY codes/labels that appear in candidates (or single). Never invent REL-/BLK-/CNF-/RSK- ids or change the count.";

const PICK_BY_NAME =
  "Offer options using the exact label from each candidate (includes the business code). User may answer with a code, name, or first/second/third.";

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

function rememberFromResults(results: SearchResult[]): void {
  for (const r of results.slice(0, 3)) {
    rememberVoiceEntity({
      path: r.href,
      label: r.label,
      type: r.type,
      code: r.href.split("/").filter(Boolean).pop(),
    });
  }
}

/**
 * Compact list of exact codes for the model to speak (anti-hallucination).
 * @param results - Ranked search hits.
 */
function exactCodeList(results: SearchResult[]): string {
  return results
    .slice(0, MAX_VOICE_CANDIDATES)
    .map((r) => {
      const code = r.href.split("/").filter(Boolean).pop() ?? r.label;
      return code;
    })
    .join(", ");
}

function finishWithResults(
  query: string,
  merged: SearchResult[],
  extras?: { ordinalNote?: string; fromMemory?: boolean }
): SearchToolResult {
  const matchCount = merged.length;

  if (matchCount === 0) {
    return {
      ok: true,
      tool: "search_entity",
      query,
      matchCount: 0,
      instruction:
        "No matches found. Ask the user for a release/risk name, version (e.g. v2.14), team, status word (blocked), or “first release” — not an invented id.",
      actionLine: `No matches for “${query}”`,
    };
  }

  rememberFromResults(merged);

  if (matchCount === 1) {
    const single = toCandidate(merged[0]!);
    const note = extras?.ordinalNote ? ` ${extras.ordinalNote}` : "";
    const mem = extras?.fromMemory ? " (from recent session context)." : "";
    return {
      ok: true,
      tool: "search_entity",
      query,
      matchCount: 1,
      single,
      instruction: `One match: ${single.label}.${note}${mem} Speak this exact label/code. ${SPEAK_EXACT_CODES} Confirm verbally, then call navigate_to with path=${single.path}. ${NAVIGATE_WITH_PATH}`,
      actionLine: extras?.ordinalNote
        ? `${extras.ordinalNote}: ${single.label}`
        : extras?.fromMemory
          ? `Using recent: ${single.label}`
          : `Found 1 match: ${single.label}`,
    };
  }

  const candidates = merged.slice(0, MAX_VOICE_CANDIDATES).map(toCandidate);
  const codes = exactCodeList(merged);
  return {
    ok: true,
    tool: "search_entity",
    query,
    matchCount,
    candidates,
    instruction: `Found exactly ${matchCount} match(es). Speak this exact count and these exact codes in order: ${codes}. Candidate labels: ${candidates.map((c) => c.label).join(" | ")}. ${SPEAK_EXACT_CODES} ${PICK_BY_NAME} Do NOT invent extra rows. ${NAVIGATE_WITH_PATH}`,
    actionLine: `Found ${matchCount} matches: ${codes}`,
  };
}

/**
 * Resolve ordinals against APP_CONTEXT then ordered entity lists.
 */
async function resolveOrdinal(
  ordinal: number,
  entityType: VoiceEntityKind,
  displayQuery: string
): Promise<SearchToolResult> {
  const ordinalWord =
    ordinal === 1 ? "first" : ordinal === 2 ? "second" : `${ordinal}th`;

  const visible = resolveVisibleOrdinal(ordinal, entityType);
  if (visible) {
    const single: VoiceSearchCandidate = {
      path: visible.path,
      href: visible.path,
      refId: visible.code,
      label: visible.label,
      type: entityType,
      sublabel: "visible table",
    };
    rememberVoiceEntity({
      path: visible.path,
      label: visible.label,
      type: entityType,
      code: visible.code,
    });
    return {
      ok: true,
      tool: "search_entity",
      query: displayQuery,
      matchCount: 1,
      single,
      instruction: `User asked for the ${ordinalWord} ${entityType} on the current table: ${single.label}. IMMEDIATELY call navigate_to with path=${single.path}. Briefly say you are opening it.`,
      actionLine: `${voiceEntityLabel(entityType)} #${ordinal} (visible): ${single.label}`,
    };
  }

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
  rememberVoiceEntity({
    path: single.path,
    label: single.label,
    type: single.type,
    code: single.path.split("/").filter(Boolean).pop(),
  });
  return {
    ok: true,
    tool: "search_entity",
    query: displayQuery,
    matchCount: 1,
    single,
    instruction: `User asked for the ${ordinalWord} ${entityType}: ${single.label}. IMMEDIATELY call navigate_to with path=${single.path} (do not ask which one). Briefly say you are opening it.`,
    actionLine: `${voiceEntityLabel(entityType)} #${ordinal}: ${single.label}`,
  };
}

/**
 * Run voice search via context agent (retrieve-don't-dump) + GlobalSearch API.
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

  // "first one" / "the 10th" while on a list page — use visible context entity type.
  if (intent.kind === "text") {
    const bare = intent.query.trim().toLowerCase();
    const bareN = parseBareOrdinal(bare);
    if (bareN != null) {
      const ctx = getVoiceAppContext();
      if (ctx?.entityType && ctx.visible.length > 0) {
        return resolveOrdinal(bareN, ctx.entityType, rawQuery);
      }
    }
  }

  if (intent.kind === "ordinal") {
    return resolveOrdinal(intent.ordinal, intent.entityType, intent.raw);
  }

  const plan = planVoiceContextQuery(rawQuery, entityTypeArg);

  // Fetch API once for the primary (normalized) query — context agent merges variants locally.
  let apiResults: SearchResult[] = [];
  const api = await safeFetchJson<{ results?: SearchResult[] }>(
    `/api/search?q=${encodeURIComponent(plan.primaryQuery)}`,
    { label: "voice-search" }
  );
  if (!isFetchAbort(api) && api.ok) {
    apiResults = api.data.results ?? [];
  }

  const retrieved = retrieveVoiceContext(plan, {
    entityType: entityTypeArg ?? plan.entityType,
    apiResults,
  });

  if (plan.pronounRef && retrieved.results.length === 0) {
    return {
      ok: true,
      tool: "search_entity",
      query: rawQuery,
      matchCount: 0,
      instruction:
        "No recent entity in session memory for that pronoun. Ask the user to name the release/blocker or say first/10th on the current list.",
      actionLine: "No recent item to refer to",
    };
  }

  return finishWithResults(plan.primaryQuery || rawQuery, retrieved.results, {
    fromMemory: retrieved.fromMemory,
  });
}
