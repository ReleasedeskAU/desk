/**
 * Human-friendly spoken query normalization for voice search.
 * People remember names, versions, and “first/10th” — not route ids.
 */
import {
  ENTITY_VOICE_LABEL,
  SEARCH_ENTITY_TYPES,
  type SearchEntityType,
} from "@/lib/search-entity-types";
import { normalizeSpokenEnvBookingCode } from "@/lib/search-seed-catalog";
import { ENTITY_CODE_PREFIX } from "@/lib/voice/entity-catalog";

export type VoiceEntityKind = SearchEntityType;

export type VoiceSearchIntent =
  | { kind: "text"; query: string; entityType?: VoiceEntityKind }
  | { kind: "ordinal"; ordinal: number; entityType: VoiceEntityKind; raw: string };

/** Word / suffix ordinals through 20 (covers “10th blocker” and friends). */
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
  sixth: 6,
  "6th": 6,
  seventh: 7,
  "7th": 7,
  eighth: 8,
  "8th": 8,
  ninth: 9,
  "9th": 9,
  tenth: 10,
  "10th": 10,
  eleventh: 11,
  "11th": 11,
  twelfth: 12,
  "12th": 12,
  thirteenth: 13,
  "13th": 13,
  fourteenth: 14,
  "14th": 14,
  fifteenth: 15,
  "15th": 15,
  sixteenth: 16,
  "16th": 16,
  seventeenth: 17,
  "17th": 17,
  eighteenth: 18,
  "18th": 18,
  nineteenth: 19,
  "19th": 19,
  twentieth: 20,
  "20th": 20,
};

const ORDINAL_WORD_ALT = Object.keys(ORDINAL_WORDS).join("|");

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

/** Spoken business-code patterns → canonical PREFIX-#### (parallel to REL-/ENV-). */
const SPOKEN_CODE_PATTERNS: Array<{
  entityType: VoiceEntityKind;
  prefix: string;
  re: RegExp;
}> = [
  // Allow “blocker no 5” / “blocker number 5” / “blocker #5” / “blocker 5”
  { entityType: "blocker", prefix: "BLK", re: /^(?:blk|blocker)\s*(?:(?:no\.?|number|#)\s*)?(\d{1,4})$/i },
  { entityType: "risk", prefix: "RSK", re: /^(?:rsk|risk)\s*(?:(?:no\.?|number|#)\s*)?(\d{1,4})$/i },
  { entityType: "conflict", prefix: "CNF", re: /^(?:cnf|conflict)\s*(?:(?:no\.?|number|#)\s*)?(\d{1,4})$/i },
  { entityType: "drift", prefix: "DRF", re: /^(?:drf|drift)\s*(?:(?:no\.?|number|#)\s*)?(\d{1,4})$/i },
  { entityType: "approval", prefix: "APR", re: /^(?:apr|approval)\s*(?:(?:no\.?|number|#)\s*)?(\d{1,4})$/i },
  { entityType: "incident", prefix: "INC", re: /^(?:inc|incident)\s*(?:(?:no\.?|number|#)\s*)?(\d{1,4})$/i },
  { entityType: "dependency", prefix: "DEP", re: /^(?:dep|dependency)\s*(?:(?:no\.?|number|#)\s*)?(\d{1,4})$/i },
  { entityType: "leave", prefix: "LVE", re: /^(?:lve|leave)\s*(?:(?:no\.?|number|#)\s*)?(\d{1,4})$/i },
  { entityType: "alert", prefix: "ALT", re: /^(?:alt|alert)\s*(?:(?:no\.?|number|#)\s*)?(\d{1,4})$/i },
  {
    entityType: "maintenance",
    prefix: "MNT",
    re: /^(?:mnt|maintenance)\s*(?:(?:no\.?|number|#)\s*)?(\d{1,4})$/i,
  },
  { entityType: "flow", prefix: "FLW", re: /^(?:flw|flow)\s*(?:(?:no\.?|number|#)\s*)?(\d{1,4})$/i },
];

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
 * Map spoken release ids to REL-#### form (DB business codes, not hardcoded rows).
 * “REL-0001” / “rel 75” / “release no 5” → REL-0001 / REL-0075 / REL-0005.
 * @param raw - Spoken fragment after filler strip.
 */
export function normalizeSpokenReleaseCode(raw: string): string | null {
  const q = raw.trim();
  if (!q) return null;
  const m = q.match(/^rel(?:ease)?\s*(?:(?:no\.?|number|#)\s*)?(\d{1,4})$/i);
  if (!m) return null;
  return `REL-${String(Number(m[1]!)).padStart(4, "0")}`;
}

/**
 * Pad a bare number to PREFIX-#### when entity type is known (tool arg or page context).
 * Bridges LLM mistakes like search_entity({ query: "5", entityType: "blocker" }).
 * @param digits - 1–4 digit string.
 * @param entityType - Known entity kind.
 */
export function padSpokenDigitsToCode(
  digits: string,
  entityType: VoiceEntityKind
): string | null {
  if (!/^\d{1,4}$/.test(digits.trim())) return null;
  const prefix =
    entityType === "release"
      ? "REL"
      : ENTITY_CODE_PREFIX[entityType]?.replace(/-$/, "") ?? null;
  if (!prefix) return null;
  return `${prefix}-${String(Number(digits.trim())).padStart(4, "0")}`;
}

/**
 * Map spoken business codes (BLK-10, blocker 75, rsk 3) to PREFIX-####.
 * Bridges human shorthand to tenant DB codes; “first/10th …” remain ordinals.
 * @param raw - Spoken fragment after filler strip.
 */
export function normalizeSpokenEntityCode(
  raw: string
): { code: string; entityType: VoiceEntityKind } | null {
  const q = raw.trim();
  if (!q) return null;

  // Explicit PREFIX-#### / PREFIX #### (any catalog prefix).
  for (const [entityType, prefix] of Object.entries(ENTITY_CODE_PREFIX) as Array<
    [SearchEntityType, string]
  >) {
    if (!prefix) continue;
    const p = prefix.replace(/-$/, "");
    const m = q.match(new RegExp(`^${p}[\\s-]*(\\d{1,4})$`, "i"));
    if (!m) continue;
    return {
      code: `${p}-${String(Number(m[1]!)).padStart(4, "0")}`,
      entityType: entityType as VoiceEntityKind,
    };
  }

  for (const row of SPOKEN_CODE_PATTERNS) {
    const m = q.match(row.re);
    if (!m?.[1]) continue;
    return {
      code: `${row.prefix}-${String(Number(m[1])).padStart(4, "0")}`,
      entityType: row.entityType,
    };
  }
  return null;
}

/**
 * Parse a bare ordinal word/number ("10th", "first one") when list context supplies entityType.
 * @param lower - Lowercased query.
 */
export function parseBareOrdinal(lower: string): number | null {
  const word = lower.match(
    new RegExp(`^(?:the\\s+)?(${ORDINAL_WORD_ALT})(?:\\s+one)?$`)
  );
  if (word) return ORDINAL_WORDS[word[1]!] ?? null;
  const num = lower.match(/^(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?(?:\s+one)?$/);
  if (num) return Math.max(1, parseInt(num[1]!, 10));
  return null;
}

/**
 * Parse search intents: shorthand codes (“release 75” → REL-0075) and
 * explicit ordinals (“first release”, “10th blocker”).
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

  // Shorthand → business code (tenant DB SoT): "release 75" → REL-0075.
  const relCode = normalizeSpokenReleaseCode(normalized);
  if (relCode) {
    return { kind: "text", query: relCode, entityType: "release" };
  }

  const entityCode = normalizeSpokenEntityCode(normalized);
  if (entityCode) {
    return {
      kind: "text",
      query: entityCode.code,
      entityType: entityCode.entityType,
    };
  }

  const lower = normalized.toLowerCase();

  // "10th blocker" / "the tenth risk" / "10th from blockers"
  const wordOrd = lower.match(
    new RegExp(
      `^(?:the\\s+)?(${ORDINAL_WORD_ALT})\\s+(?:from\\s+)?(?:the\\s+)?(${ORDINAL_ENTITY_PATTERN})\\b`
    )
  );
  if (wordOrd) {
    const ordinal = ORDINAL_WORDS[wordOrd[1]!] ?? 1;
    const entityType = ENTITY_ALIASES[wordOrd[2]!] ?? "release";
    return { kind: "ordinal", ordinal, entityType, raw: normalized };
  }

  // "10th blocker" via digits+suffix (covers 21st+ beyond word map)
  const nthOrd = lower.match(
    new RegExp(
      `^(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)\\s+(?:from\\s+)?(?:the\\s+)?(${ORDINAL_ENTITY_PATTERN})\\b`
    )
  );
  if (nthOrd) {
    const ordinal = Math.max(1, parseInt(nthOrd[1]!, 10));
    const entityType = ENTITY_ALIASES[nthOrd[2]!] ?? "release";
    return { kind: "ordinal", ordinal, entityType, raw: normalized };
  }

  // "blocker number 10" / "blocker no 5" / "blocker #10"
  const numCode = lower.match(
    new RegExp(
      `^(${ORDINAL_ENTITY_PATTERN})\\s+(?:(?:no\\.?|number|#)\\s*)(\\d{1,4})\\b`
    )
  );
  if (numCode) {
    const entityType = ENTITY_ALIASES[numCode[1]!] ?? "release";
    const digits = numCode[2]!;
    const code = padSpokenDigitsToCode(digits, entityType);
    if (code) {
      return { kind: "text", query: code, entityType };
    }
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
