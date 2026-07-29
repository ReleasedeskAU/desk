/**
 * Frozen voice tool manifest — release-manager assistant tools.
 * Tools: navigate_to, apply_list_filters, explain_page, run_walkthrough,
 * search_entity, get_summary, propose_action, confirm_action.
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
      "REQUIRED to change pages. Navigate the Release Desk UI. path may be a real href (/blockers, /booking, /calendar) OR a spoken sidebar name (blockers, env booking, calendar tab). Always call this tool to open a tab — never only say you navigated. Never invent entity ids; for details use search_entity.path. Prefer get_summary for questions. Never use for writes. For filtering a list, use apply_list_filters instead of stuffing query strings into path.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "Full path from search_entity/get_summary path fields, or a sidebar name (env booking, calendar tab). Never invent detail URLs — use candidate.path.",
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
    name: "apply_list_filters",
    description:
      "REQUIRED to filter/narrow/clear any list page. Call this tool — never say you cannot apply filters. Omit page to filter the current list; or pass page=\"blockers\". Prefer top-level fields (status, severity, priority, dept, app, type, …). You may also pass filters={...}. clear=true clears all filters. replace=true replaces instead of merging. Use the user's spoken values (Open, Critical, department name). Never invent ids.",
    parameters: {
      type: "object",
      properties: {
        page: {
          type: "string",
          description:
            "Optional list page path or sidebar name (blockers, /risks, releases). Defaults to the current page.",
        },
        status: {
          type: "string",
          description: "Status filter value as spoken (e.g. Open, In Progress).",
        },
        severity: {
          type: "string",
          description: "Severity filter (e.g. Critical, High).",
        },
        priority: {
          type: "string",
          description: "Priority filter (e.g. High, Medium).",
        },
        impact: {
          type: "string",
          description: "Impact filter value.",
        },
        dept: {
          type: "string",
          description: "Department name or id (spoken name is OK).",
        },
        app: {
          type: "string",
          description: "Application name or id (spoken name is OK).",
        },
        env: {
          type: "string",
          description: "Environment name or id.",
        },
        type: {
          type: "string",
          description: "Type filter (blocker type, leave type, etc.).",
        },
        decision: {
          type: "string",
          description: "Approval decision filter.",
        },
        release: {
          type: "string",
          description: "Release code / name text filter.",
        },
        assignedTo: {
          type: "string",
          description: "Assignee name text filter.",
        },
        category: {
          type: "string",
          description: "Category filter (risks, etc.).",
        },
        band: {
          type: "string",
          description: "Risk band filter.",
        },
        conflict: {
          type: "string",
          description: "Conflict flag (1/0) where supported.",
        },
        hasBlockers: {
          type: "string",
          description: "Has blockers flag (1/0) on releases.",
        },
        q: {
          type: "string",
          description: "Generic search/q filter on admin list pages.",
        },
        filters: {
          type: "object",
          description:
            "Optional bag of extra filter key→value pairs (same keys as URL params). Prefer top-level fields when listed above.",
        },
        clear: {
          type: "boolean",
          description:
            "When true, clear all list filters on the page (optionally then apply filters).",
        },
        replace: {
          type: "boolean",
          description:
            "When true, replace all existing filters with the new set (instead of merging).",
        },
      },
      required: [],
    },
  },
  {
    name: "search_entity",
    description:
      "Librarian into this company's records (all entity types). Use for shorthand (release 75→REL-0075), names, status words, ordinals, and pronouns (that/the same). Call before get_summary / propose_action / navigate_to when you lack a real path/code. Never invent ids. Prefer apply_list_filters when the user wants to narrow a whole list rather than open one record.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Natural words, code, shorthand number, ordinal, or pronoun after stripping filler.",
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
      "Spoken summary of a record (read-only). For releases, returns a readiness verdict: READY / BLOCKED / AT RISK / IN PROGRESS with explicit why (blockers, conflicts, approvals, sign-offs, readiness %). Prefer over navigate for questions like why is it blocked, is it ready, tell me about REL-0075. When entityType is release, speak a brief acknowledgment before calling.",
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
    name: "explain_page",
    description:
      "Explain the current or named page like a professional release manager — purpose, what voice can do, filters, next steps. Use when the user asks what is this page, explain the screen, what can I do here, or how does X work in the product. No screen share required. Omit page to explain the current page.",
    parameters: {
      type: "object",
      properties: {
        page: {
          type: "string",
          description:
            "Optional sidebar name or path (releases, blockers, /approvals). Defaults to current page.",
        },
      },
      required: [],
    },
  },
  {
    name: "run_walkthrough",
    description:
      "Run a multi-step guided tour (navigates + applies filters + returns a spoken script). Use for walkthrough, show me how, morning check, tour of blockers/approvals/conflicts/readiness. Tours: critical_blockers, release_readiness, pending_approvals, env_conflicts, morning_check.",
    parameters: {
      type: "object",
      properties: {
        tour: {
          type: "string",
          description:
            "Tour id or spoken alias (critical_blockers, release readiness, morning check, pending approvals, env conflicts).",
        },
      },
      required: ["tour"],
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
