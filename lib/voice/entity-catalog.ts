/**
 * Entity-type catalog for voice — compact brief for Live systemInstruction
 * (same role as sidebar-catalog for tabs). Resolves “first conflict”, “release 0001”
 * via search_entity ordinals — never invent REL-/CNF- codes.
 */
import {
  ENTITY_HREF_PREFIX,
  ENTITY_VOICE_LABEL,
  SEARCH_ENTITY_TYPES,
  type SearchEntityType,
} from "@/lib/search-entity-types";

/** Business-code prefixes the model should expect (speech may omit the prefix). */
export const ENTITY_CODE_PREFIX: Partial<Record<SearchEntityType, string>> = {
  release: "REL-",
  risk: "RSK-",
  blocker: "BLK-",
  drift: "DRF-",
  approval: "APR-",
  incident: "INC-",
  booking: "ENV-",
  conflict: "CNF-",
  dependency: "DEP-",
  leave: "LVE-",
  alert: "ALT-",
  maintenance: "MNT-",
  flow: "FLW-",
};

/** Short spoken aliases for the brief (full parsing lives in spoken-query). */
const BRIEF_ALIASES: Partial<Record<SearchEntityType, string>> = {
  release: "release/rel",
  risk: "risk",
  blocker: "blocker",
  conflict: "conflict",
  booking: "booking/env",
  incident: "incident",
  approval: "approval",
  drift: "drift",
  alert: "alert",
  dependency: "dependency/deps",
};

/** High-traffic types to keep the Live brief short. */
const BRIEF_ENTITY_TYPES: readonly SearchEntityType[] = [
  "release",
  "conflict",
  "risk",
  "blocker",
  "booking",
  "incident",
  "approval",
  "alert",
  "drift",
  "dependency",
];

export type VoiceEntityCatalogEntry = {
  entityType: SearchEntityType;
  label: string;
  listPath: string;
  codePrefix: string | null;
  aliases: string;
};

/**
 * Structured catalog entries for tests and tooling.
 */
export function voiceEntityCatalogEntries(): VoiceEntityCatalogEntry[] {
  return BRIEF_ENTITY_TYPES.map((entityType) => ({
    entityType,
    label: ENTITY_VOICE_LABEL[entityType] ?? entityType,
    listPath: ENTITY_HREF_PREFIX[entityType] ?? `/${entityType}`,
    codePrefix: ENTITY_CODE_PREFIX[entityType] ?? null,
    aliases: BRIEF_ALIASES[entityType] ?? entityType,
  }));
}

/**
 * Compact brief for Live systemInstruction — keep short for latency.
 * Full ordinal/code resolution still runs in search_entity + entity-list.
 */
export function voiceEntityCatalogBrief(): string {
  const lines = voiceEntityCatalogEntries().map((e) => {
    const prefix = e.codePrefix ? ` codes=${e.codePrefix}` : "";
    return `${e.label}(${e.aliases})${prefix}→${e.listPath}`;
  });
  return [
    "Entities:",
    lines.join("; ") + ".",
    "Detail URLs come only from search_entity.path / get_summary.path — never invent hrefs.",
    "Ordinals: first/1st/second X → search_entity (never invent codes).",
    "On a list page, prefer [APP_CONTEXT] visible[] order for first/second.",
    `All kinds: ${SEARCH_ENTITY_TYPES.join(",")}.`,
  ].join(" ");
}
