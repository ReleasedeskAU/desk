/**
 * Human-friendly spoken query normalization for voice search.
 * People remember names, versions, and “first/second” — not route ids.
 */
import {
  ENTITY_VOICE_LABEL,
  SEARCH_ENTITY_TYPES,
  type SearchEntityType,
} from "@/lib/search-entity-types";
import { normalizeSpokenEnvBookingCode } from "@/lib/search-seed-catalog";

export type VoiceEntityKind = SearchEntityType;

export type VoiceSearchIntent =
  | { kind: "text"; query: string; entityType?: VoiceEntityKind }
  | { kind: "ordinal"; ordinal: number; entityType: VoiceEntityKind; raw: string };

const ORDINAL_WORDS: Record<string, number> = {
  first: 1,
  "1st": 1,
  second: 2,
  "2nd": 2,
  third: 3,
  "3rd": 3,
  fourth: 4,
  "4th": 4,
  fifth: 5,
  "5th": 5,
};

const ENTITY_ALIASES: Record<string, VoiceEntityKind> = {
  release: "release",
  releases: "release",
  rel: "release",
  risk: "risk",
  risks: "risk",
  blocker: "blocker",
  blockers: "blocker",
  drift: "drift",
  drifts: "drift",
  incident: "incident",
  incidents: "incident",
  approval: "approval",
  approvals: "approval",
  booking: "booking",
  bookings: "booking",
  env: "booking",
  "env booking": "booking",
  conflict: "conflict",
  conflicts: "conflict",
  dependency: "dependency",
  dependencies: "dependency",
  leave: "leave",
  leaves: "leave",
  alert: "alert",
  alerts: "alert",
  maintenance: "maintenance",
  flow: "flow",
  flows: "flow",
  department: "department",
  departments: "department",
  application: "application",
  applications: "application",
  app: "application",
  user: "user",
  users: "user",
  environment: "environment",
  environments: "environment",
  version: "version",
  versions: "version",
};

const ORDINAL_ENTITY_PATTERN =
  "release|releases|rel|risk|risks|blocker|blockers|drift|drifts|incident|incidents|approval|approvals|booking|bookings|env|conflict|conflicts|dependency|dependencies|leave|leaves|alert|alerts|maintenance|flow|flows|department|departments|application|applications|app|user|users";

/**
 * Strip command filler so "go to the checkout page" → "checkout".
 * @param raw - Spoken / tool query string.
 */
export function stripSpokenFiller(raw: string): string {
  let q = raw.trim();
  q = q.replace(
    /^(please\s+)?(can you\s+)?(go to|open|show me|show|take me to|navigate to|find|search for)\s+/i,
    ""
  );
  q = q.replace(/\s+(page|details?|detail page|screen|record)$/i, "");
  q = q.replace(/^the\s+/i, "");
  return q.trim();
}

/**
 * Soft version normalization: "v 2 14" / "version 2.14.0" → searchable tokens.
 * @param q - Query after filler strip.
 */
export function normalizeSpokenVersion(q: string): string {
  let out = q.trim();
  out = out.replace(/\b(?:version|ver)\s+(\d+(?:\.\d+){0,2})\b/gi, "v$1");
  out = out.replace(/\bv\s+(\d+)(?:\s*[.\s]\s*(\d+))?(?:\s*[.\s]\s*(\d+))?/gi, (_, a, b, c) => {
    const parts = [a, b, c].filter(Boolean);
    return `v${parts.join(".")}`;
  });
  return out.replace(/\s+/g, " ").trim();
}

/**
 * Map spoken release ids to REL-0001 form.
 * “REL-0001” / “rel-0001” / “rel 0001” → REL-0001.
 * Leaves “rel 01” / “release 1” for the ordinal parser (“first/second”).
 * @param raw - Spoken fragment after filler strip.
 */
export function normalizeSpokenReleaseCode(raw: string): string | null {
  const q = raw.trim();
  if (!q) return null;
  const m = q.match(/^rel(?:ease)?[\s-]*(\d{1,4})$/i);
  if (!m) return null;
  const digits = m[1]!;
  const compact = q.replace(/\s+/g, "");
  // Hyphenated REL-… or 3–4 digit spoken codes are business ids, not ordinals.
  if (!/^rel(ease)?-\d/i.test(compact) && digits.length < 3) {
    return null;
  }
  return `REL-${String(Number(digits)).padStart(4, "0")}`;
}

/**
 * Parse ordinal intents: "first release", "2nd risk", "release 1", "rel 01", "first booking".
 * @param raw - Original tool query (may include filler).
 * @returns Ordinal intent or plain text intent.
 */
export function parseVoiceSearchIntent(raw: string): VoiceSearchIntent {
  const stripped = stripSpokenFiller(raw);
  let normalized = normalizeSpokenVersion(stripped);

  // Spoken env booking codes → canonical ENV-0001 before keyword search.
  const envCode = normalizeSpokenEnvBookingCode(normalized);
  if (envCode) {
    return { kind: "text", query: envCode, entityType: "booking" };
  }

  // Spoken release codes → REL-0001 (so “rel 0001” / “REL 1” open that detail).
  const relCode = normalizeSpokenReleaseCode(normalized);
  if (relCode) {
    return { kind: "text", query: relCode, entityType: "release" };
  }

  const lower = normalized.toLowerCase();

  const wordOrd = lower.match(
    new RegExp(
      `^(?:the\\s+)?(first|1st|second|2nd|third|3rd|fourth|4th|fifth|5th)\\s+(${ORDINAL_ENTITY_PATTERN})\\b`
    )
  );
  if (wordOrd) {
    const ordinal = ORDINAL_WORDS[wordOrd[1]!] ?? 1;
    const entityType = ENTITY_ALIASES[wordOrd[2]!] ?? "release";
    return { kind: "ordinal", ordinal, entityType, raw: normalized };
  }

  const numOrd = lower.match(
    new RegExp(`^(${ORDINAL_ENTITY_PATTERN})\\s*#?\\s*0*(\\d{1,2})\\b`)
  );
  if (numOrd) {
    const entityType = ENTITY_ALIASES[numOrd[1]!] ?? "release";
    // "env 001" is a booking code, not ordinal #1 — already handled above.
    const ordinal = Math.max(1, parseInt(numOrd[2]!, 10));
    return { kind: "ordinal", ordinal, entityType, raw: normalized };
  }

  return { kind: "text", query: normalized };
}

/**
 * Human-readable entity label for prompts.
 * @param kind - Entity kind.
 */
export function voiceEntityLabel(kind: VoiceEntityKind): string {
  return ENTITY_VOICE_LABEL[kind] ?? kind.charAt(0).toUpperCase() + kind.slice(1);
}

/** Entity types accepted by search_entity.entityType (for audits / tests). */
export function listVoiceSearchEntityTypes(): readonly SearchEntityType[] {
  return SEARCH_ENTITY_TYPES;
}
