/**
 * Frozen voice tool manifest (Phase 3).
 * Tools: navigate_to, search_entity, get_summary, propose_action, confirm_action.
 */

import { SEARCH_ENTITY_TYPES } from "@/lib/search-entity-types";

export const VOICE_LIVE_MODEL = "gemini-3.1-flash-live-preview" as const;

export type VoiceToolDeclaration = {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
};

const ENTITY_TYPE_ENUM = SEARCH_ENTITY_TYPES.join(" | ");

/**
 * Hardcoded tool list returned to clients and locked into ephemeral-token constraints.
 */
export const VOICE_TOOL_MANIFEST: readonly VoiceToolDeclaration[] = [
  {
    name: "navigate_to",
    description:
      "Navigate the Release Desk UI. path may be a real href (/booking, /calendar) OR a spoken sidebar name (env booking, calendar tab, calendar page) — tab/page/section mean the same. Never invent entity ids; for details use search_entity.path. Prefer get_summary for questions. Never use for writes.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "Full path (/booking) or sidebar name (env booking page, calendar tab). Env Booking is /booking not /bookings. Prefer catalog paths over guesses.",
        },
        label: {
          type: "string",
          description: "Optional short label for the destination.",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "search_entity",
    description:
      "Find records by human words. Use before get_summary / propose_action / navigate_to when you lack a real id/code.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Name, version, code, or ordinal after stripping filler.",
        },
        entityType: {
          type: "string",
          description: `Optional entity filter: ${ENTITY_TYPE_ENUM}`,
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_summary",
    description:
      "Spoken summary of a record (read-only). Prefer over navigate for questions. When entityType is release, speak a brief acknowledgment before calling.",
    parameters: {
      type: "object",
      properties: {
        entityType: {
          type: "string",
          description: `Entity kind: ${ENTITY_TYPE_ENUM}`,
        },
        entityId: {
          type: "string",
          description: "Real id/code from search_entity (path segment or business code).",
        },
      },
      required: ["entityType", "entityId"],
    },
  },
  {
    name: "propose_action",
    description:
      "Stage a write for user confirmation — does NOT execute. Only actionTypes: set_approval_decision (PATCH approval decision) or acknowledge_alert (PATCH alert status). Always propose first; never write without a later confirm_action in a SEPARATE turn after the user says yes. If the user says request+yes in one breath, still ONLY propose in this turn — wait for a later yes.",
    parameters: {
      type: "object",
      properties: {
        actionType: {
          type: "string",
          description: "set_approval_decision | acknowledge_alert",
        },
        params: {
          type: "object",
          description:
            "Must include id (approvalCode or alertCode). For set_approval_decision: decision and decisionDate (YYYY-MM-DD). For acknowledge_alert: status (usually Acknowledged). Validated by the same Zod schemas as the UI.",
        },
      },
      required: ["actionType", "params"],
    },
  },
  {
    name: "confirm_action",
    description:
      "Execute a previously proposed write (accept=true) or discard it (accept=false). Requires actionId from propose_action. ONLY call after an explicit yes/no in a turn AFTER propose — never in the same tool batch as propose_action. On no/cancel: accept=false.",
    parameters: {
      type: "object",
      properties: {
        actionId: {
          type: "string",
          description: "Exact actionId from propose_action — never invent.",
        },
        accept: {
          type: "boolean",
          description: "true (default) executes the write; false discards with no mutation.",
        },
      },
      required: ["actionId"],
    },
  },
] as const;

/** SDK shape for Live connect tool constraints (functionDeclarations only). */
export function voiceToolDeclarationsForLive() {
  return VOICE_TOOL_MANIFEST.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));
}
