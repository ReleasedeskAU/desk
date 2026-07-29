/**
 * Voice context agent — types for retrieve-don't-dump resolution.
 * DB stays source of truth; this layer plans queries and ranks hits for the LLM.
 */

import type { SearchResult } from "@/lib/dummy-data";
import type { VoiceEntityKind } from "@/lib/voice/spoken-query";

/** One remembered entity from a prior successful resolve in this mic session. */
export type VoiceRememberedEntity = {
  path: string;
  code: string;
  label: string;
  type: string;
  at: number;
};

/** Planned retrieval steps derived from a spoken / tool query. */
export type VoiceQueryPlan = {
  /** Original user/tool string (for action lines). */
  displayQuery: string;
  /** Primary search string (often a normalized business code). */
  primaryQuery: string;
  /** Extra search variants (token subsets) for fuzzy coverage. */
  variants: string[];
  /** Optional entity filter from speech or tool arg. */
  entityType?: VoiceEntityKind;
  /** Significant terms used for ranking (not dumped to the model). */
  terms: string[];
  /** True when the utterance is a pronoun / “that one” referring to memory. */
  pronounRef: boolean;
};

export type VoiceRetrieveOptions = {
  entityType?: string;
  /** Injected search fn for tests (defaults to searchAll). */
  searchFn?: (q: string) => SearchResult[];
  /** Optional API hits already fetched by the handler. */
  apiResults?: SearchResult[];
};

export type VoiceRetrieveResult = {
  plan: VoiceQueryPlan;
  results: SearchResult[];
  /** Hit from session memory without a new DB/search round-trip. */
  fromMemory: boolean;
  cacheHit: boolean;
};
