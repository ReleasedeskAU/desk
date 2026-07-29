/**
 * Plan voice retrieval queries: shorthand codes, pronouns, multi-term variants.
 * Expands human speech into searchable strings — does not load the database.
 */

import {
  parseVoiceSearchIntent,
  padSpokenDigitsToCode,
  type VoiceEntityKind,
} from "@/lib/voice/spoken-query";
import { getVoiceAppContext } from "@/lib/voice/app-context";
import type { VoiceQueryPlan } from "@/lib/voice/context-agent/types";

const STOP = new Set([
  "a",
  "an",
  "the",
  "that",
  "this",
  "these",
  "those",
  "same",
  "one",
  "it",
  "its",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "to",
  "of",
  "for",
  "on",
  "in",
  "at",
  "by",
  "with",
  "from",
  "and",
  "or",
  "but",
  "about",
  "please",
  "me",
  "my",
  "show",
  "find",
  "search",
  "open",
  "go",
  "get",
  "tell",
  "whats",
  "what's",
  "what",
  "which",
  "who",
  "whose",
  "looking",
  "look",
  "need",
  "want",
  "can",
  "you",
  "your",
  "page",
  "details",
  "detail",
  "record",
  "thing",
  "stuff",
]);

const ENTITY_WORDS: Record<string, VoiceEntityKind> = {
  release: "release",
  releases: "release",
  rel: "release",
  blocker: "blocker",
  blockers: "blocker",
  risk: "risk",
  risks: "risk",
  conflict: "conflict",
  conflicts: "conflict",
  drift: "drift",
  drifts: "drift",
  incident: "incident",
  incidents: "incident",
  approval: "approval",
  approvals: "approval",
  booking: "booking",
  bookings: "booking",
  dependency: "dependency",
  dependencies: "dependency",
  leave: "leave",
  leaves: "leave",
  alert: "alert",
  alerts: "alert",
  maintenance: "maintenance",
  flow: "flow",
  flows: "flow",
};

const PRONOUN_RE =
  /^(?:that|this|the\s+same|it)(?:\s+(?:one|release|blocker|risk|conflict|drift|incident|approval|booking|alert))?$/i;

/**
 * True when the query is a pronoun referring to session memory.
 * @param raw - Normalized query fragment.
 */
export function isVoicePronounQuery(raw: string): boolean {
  return PRONOUN_RE.test(raw.trim());
}

/**
 * Infer entity kind from spoken words when the tool omitted entityType.
 * @param raw - Query text.
 */
export function inferEntityTypeFromQuery(raw: string): VoiceEntityKind | undefined {
  const lower = raw.toLowerCase();
  for (const [word, kind] of Object.entries(ENTITY_WORDS)) {
    if (new RegExp(`\\b${word}\\b`, "i").test(lower)) return kind;
  }
  return undefined;
}

/**
 * Extract ranking terms (drop stop words + pure entity-type words).
 * @param raw - Query text.
 */
export function extractVoiceSearchTerms(raw: string): string[] {
  const tokens = raw
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s.-]/gu, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const t of tokens) {
    if (STOP.has(t)) continue;
    if (ENTITY_WORDS[t]) continue;
    if (t.length < 2) continue;
    if (!out.includes(t)) out.push(t);
  }
  return out;
}

/**
 * Build a retrieval plan from a spoken/tool query (no I/O).
 * @param rawQuery - User or model query string.
 * @param entityTypeArg - Optional tool entityType.
 */
export function planVoiceContextQuery(
  rawQuery: string,
  entityTypeArg?: string
): VoiceQueryPlan {
  const displayQuery = rawQuery.trim();
  const intent = parseVoiceSearchIntent(displayQuery);

  if (intent.kind === "ordinal") {
    return {
      displayQuery,
      primaryQuery: intent.raw,
      variants: [],
      entityType: intent.entityType,
      terms: [],
      pronounRef: false,
    };
  }

  const primaryQuery = intent.query.trim();
  const entityType =
    (entityTypeArg?.trim() as VoiceEntityKind | undefined) ||
    intent.entityType ||
    inferEntityTypeFromQuery(displayQuery) ||
    getVoiceAppContext()?.entityType ||
    undefined;

  // LLM often passes bare "5" — pad using entityType / current list page.
  if (/^\d{1,4}$/.test(primaryQuery) && entityType) {
    const padded = padSpokenDigitsToCode(primaryQuery, entityType);
    if (padded) {
      return {
        displayQuery,
        primaryQuery: padded,
        variants: [],
        entityType,
        terms: [padded.toLowerCase()],
        pronounRef: false,
      };
    }
  }

  if (isVoicePronounQuery(primaryQuery) || isVoicePronounQuery(displayQuery)) {
    return {
      displayQuery,
      primaryQuery,
      variants: [],
      entityType,
      terms: [],
      pronounRef: true,
    };
  }

  const terms = extractVoiceSearchTerms(primaryQuery);
  const variants: string[] = [];

  // Multi-term: try full significant phrase, then each strong term alone.
  if (terms.length >= 2) {
    const joined = terms.join(" ");
    if (joined !== primaryQuery.toLowerCase()) variants.push(joined);
    for (const t of terms) {
      if (t.length >= 3) variants.push(t);
    }
  } else if (terms.length === 1 && terms[0] !== primaryQuery.toLowerCase()) {
    variants.push(terms[0]!);
  }

  // Dedupe vs primary
  const seen = new Set([primaryQuery.toLowerCase()]);
  const uniqueVariants = variants.filter((v) => {
    const k = v.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return {
    displayQuery,
    primaryQuery,
    variants: uniqueVariants.slice(0, 6),
    entityType,
    terms,
    pronounRef: false,
  };
}
