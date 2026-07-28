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
  { entityType: "blocker", prefix: "BLK", re: /^(?:blk|blocker)[\s-]*(\d{1,4})$/i },
  { entityType: "risk", prefix: "RSK", re: /^(?:rsk|risk)[\s-]*(\d{1,4})$/i },
  { entityType: "conflict", prefix: "CNF", re: /^(?:cnf|conflict)[\s-]*(\d{1,4})$/i },
  { entityType: "drift", prefix: "DRF", re: /^(?:drf|drift)[\s-]*(\d{1,4})$/i },
  { entityType: "approval", prefix: "APR", re: /^(?:apr|approval)[\s-]*(\d{1,4})$/i },
  { entityType: "incident", prefix: "INC", re: /^(?:inc|incident)[\s-]*(\d{1,4})$/i },
  { entityType: "dependency", prefix: "DEP", re: /^(?:dep|dependency)[\s-]*(\d{1,4})$/i },
  { entityType: "leave", prefix: "LVE", re: /^(?:lve|leave)[\s-]*(\d{1,4})$/i },
  { entityType: "alert", prefix: "ALT", re: /^(?:alt|alert)[\s-]*(\d{1,4})$/i },
  {
    entityType: "maintenance",
    prefix: "MNT",
    re: /^(?:mnt|maintenance)[\s-]*(\d{1,4})$/i,
  },
  { entityType: "flow", prefix: "FLW", re: /^(?:flw|flow)[\s-]*(\d{1,4})$/i },
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
 * Map spoken business codes (BLK-0010, blocker 0010, rsk 3) to PREFIX-####.
 * Short 1–2 digit forms without a hyphen stay ordinals (e.g. "blocker 10").
 * @param raw - Spoken fragment after filler strip.
 */
export function normalizeSpokenEntityCode(
  raw: string
): { code: string; entityType: VoiceEntityKind } | null {
  const q = raw.trim();
  if (!q) return null;

  // Explicit PREFIX-#### / PREFIX #### (any catalog prefix).
  // 1–2 digit forms without a hyphen stay ordinals (e.g. "rel 01", "blk 10").
  for (const [entityType, prefix] of Object.entries(ENTITY_CODE_PREFIX) as Array<
    [SearchEntityType, string]
  >) {
    if (!prefix) continue;
    const p = prefix.replace(/-$/, "");
    const m = q.match(new RegExp(`^${p}[\\s-]*(\\d{1,4})$`, "i"));
    if (!m) continue;
    const digits = m[1]!;
    const compact = q.replace(/\s+/g, "");
    const hasHyphenCode = new RegExp(`^${p}-\\d`, "i").test(compact);
    if (!hasHyphenCode && digits.length < 3) continue;
    return {
      code: `${p}-${String(Number(digits)).padStart(4, "0")}`,
      entityType: entityType as VoiceEntityKind,
    };
  }

  for (const row of SPOKEN_CODE_PATTERNS) {
    const m = q.match(row.re);
    if (!m) continue;
    const digits = m[1];
    if (!digits) continue;
    // 1–2 digits without hyphenated prefix read as ordinals ("blocker 10").
    const compact = q.replace(/\s+/g, "");
    const hasHyphenCode = new RegExp(`^${row.prefix}-\\d`, "i").test(compact);
    if (!hasHyphenCode && digits.length < 3) continue;
    return {
      code: `${row.prefix}-${String(Number(digits)).padStart(4, "0")}`,
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
 * Parse ordinal intents: "first release", "10th blocker", "release 1", "rel 01".
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

  // "blocker 10" / "blocker #10" / "blocker number 10"
  // (1–2 digits = ordinal; 3–4 digit hyphenated codes handled above)
  const numOrd = lower.match(
    new RegExp(
      `^(${ORDINAL_ENTITY_PATTERN})\\s+(?:number\\s+|#\\s*)?0*(\\d{1,2})\\b`
    )
  );
  if (numOrd) {
    const entityType = ENTITY_ALIASES[numOrd[1]!] ?? "release";
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
