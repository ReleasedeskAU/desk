/**
 * Voice context agent — retrieval layer for the Live “experienced assistant”.
 *
 * Practice: DB is SoT; we retrieve ranked slices (search + on-screen + session
 * memory), never dump the whole database into the model prompt.
 */

export type {
  VoiceQueryPlan,
  VoiceRememberedEntity,
  VoiceRetrieveOptions,
  VoiceRetrieveResult,
} from "@/lib/voice/context-agent/types";

export {
  clearVoiceSessionMemory,
  formatVoiceSessionMemoryHint,
  getVoiceSessionMemory,
  rememberVoiceEntity,
  resolveVoicePronoun,
} from "@/lib/voice/context-agent/session-memory";

export {
  extractVoiceSearchTerms,
  inferEntityTypeFromQuery,
  isVoicePronounQuery,
  planVoiceContextQuery,
} from "@/lib/voice/context-agent/query-plan";

export {
  clearVoiceSearchCache,
  getVoiceSearchCache,
  setVoiceSearchCache,
} from "@/lib/voice/context-agent/cache";

export {
  retrieveVoiceContext,
  scoreVoiceSearchHit,
} from "@/lib/voice/context-agent/retrieve";
