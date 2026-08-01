/**
 * Frozen voice tool manifest — release-manager assistant tools.
 * Includes list UX, page context, manager reads (bundle/attention/calendar/compare),
 * open/copy/undo helpers, and propose→confirm writes.
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
      "REQUIRED to filter/narrow/clear/sort any list page. Call this tool — never say you cannot apply filters or sort. Omit page to filter the current list; or pass page=\"blockers\". Prefer top-level fields (status, severity, priority, dept, app, type, sort, dir, …). You may also pass filters={...}. clear=true clears all filters (keeps sort unless you change it). replace=true replaces instead of merging. Use the user's spoken values (Open, Critical, department name). Never invent ids.",
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
        sort: {
          type: "string",
          description:
            "Sort column key (e.g. conflictCode, status, priority, severity, blockerCode). Use configure_table_view action=list to see presets.",
        },
        dir: {
          type: "string",
          description: "Sort direction: asc or desc.",
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
      "Librarian into this company's records (all entity types). Use for shorthand (release 75→REL-0075), names, apps (Kyriba), status words, ordinals, and pronouns (that/the same). When listing ids for an app/type, set entityType (e.g. conflict) and speak ONLY the codes/count from the tool response — never invent CNF/REL codes. Call before get_summary / propose_action / navigate_to when you lack a real path/code. Prefer apply_list_filters when the user wants to narrow a whole list rather than open one record.",
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
    name: "configure_table_view",
    description:
      "Manage Columns and Manage Filters — show/hide which column and filter controls are visible on the current list (same as the UI pickers). Actions: list, show_columns, hide_columns, show_all_columns, show_filters, hide_filters, show_all_filters. Pass keys as labels (Notes, Assigned To) or keys (notes, assignedTo). Does NOT set filter values — use apply_list_filters for that. Does NOT sort — use apply_list_filters with sort+dir.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description:
            "list | show_columns | hide_columns | show_all_columns | show_filters | hide_filters | show_all_filters",
        },
        page: {
          type: "string",
          description: "Optional list page (conflicts, blockers). Defaults to current page.",
        },
        keys: {
          type: "string",
          description:
            "Comma-separated column/filter names or keys to show/hide (e.g. \"Notes, Assigned To\").",
        },
        columns: {
          type: "string",
          description: "Alias for keys when enabling/hiding columns.",
        },
        filters: {
          type: "string",
          description: "Alias for keys when enabling/hiding filter controls.",
        },
      },
      required: ["action"],
    },
  },
  {
    name: "scroll_page",
    description:
      "Scroll the current page (up / down / top / bottom). Works on every page — dashboards, detail pages, settings, and long tables — no screen share required. Use during walkthroughs or when reading a long page. To open a detail row after scrolling, call navigate_to with search_entity.path.",
    parameters: {
      type: "object",
      properties: {
        direction: {
          type: "string",
          description: "up | down | top | bottom (default down)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_page_context",
    description:
      "REQUIRED to read what the current page/table is showing — filtered/on-screen row codes and names (ground truth). Use when the user asks what is filtered, list the releases/ids/names, how many rows, or what am I looking at on this list. Call after apply_list_filters before listing rows. No screen share. Do NOT use search_entity for the filtered table (that searches the whole DB).",
    parameters: {
      type: "object",
      properties: {
        includeFilters: {
          type: "boolean",
          description: "Optional; ignored — URL filters are always included when present.",
        },
      },
      required: [],
    },
  },
  {
    name: "get_release_bundle",
    description:
      "One-call release package: readiness verdict + open blockers + open conflicts + pending approvals for a REL code. Prefer over chaining get_summary + multiple searches when the user asks why a release is blocked/ready or wants the full picture.",
    parameters: {
      type: "object",
      properties: {
        releaseCode: {
          type: "string",
          description: "Release business code (e.g. REL-0001).",
        },
      },
      required: ["releaseCode"],
    },
  },
  {
    name: "get_attention_brief",
    description:
      "Morning Inbox style brief: Blocked/At Risk releases, critical blockers, escalated/P1 conflicts, pending approvals. Use for what needs me now / morning check / attention queue.",
    parameters: {
      type: "object",
      properties: {
        period: {
          type: "string",
          description: "month | quarter | year (default month)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_calendar_window",
    description:
      "Releases shipping (or CAB) inside a date window. Use for what ships this week / before CAB. Pass from+to as YYYY-MM-DD, or days=7 for the next N days.",
    parameters: {
      type: "object",
      properties: {
        from: { type: "string", description: "Start date YYYY-MM-DD" },
        to: { type: "string", description: "End date YYYY-MM-DD" },
        days: { type: "number", description: "Alternative: next N days from today (max 62)" },
        field: {
          type: "string",
          description: "releaseDate (default) or cabDate",
        },
      },
      required: [],
    },
  },
  {
    name: "compare_releases",
    description:
      "Side-by-side readiness for 2–3 releases (verdict + blocker/conflict/approval counts). Pass codes array or comma-separated string.",
    parameters: {
      type: "object",
      properties: {
        codes: {
          type: "string",
          description: "Comma-separated codes or JSON array of 2–3 REL codes",
        },
      },
      required: ["codes"],
    },
  },
  {
    name: "open_entity",
    description:
      "Resolve a spoken code/name and open its detail page in one step (search + navigate). Prefer over separate search_entity + navigate_to when the user says open REL-0001 / open that blocker.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Code or name to open (REL-0001, Kyriba conflict, …)",
        },
        entityType: {
          type: "string",
          description: `Optional type filter: ${ENTITY_TYPE_ENUM}`,
        },
        path: {
          type: "string",
          description: "Optional direct path if already known from a prior tool",
        },
      },
      required: [],
    },
  },
  {
    name: "copy_visible_codes",
    description:
      "Copy the current on-screen/filtered business codes to the clipboard (for Slack/email). Uses get_page_context ground truth.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "undo_filters",
    description:
      "Restore the previous list filter/sort URL after apply_list_filters. Use when the user says undo filters / go back to previous view.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "propose_action",
    description:
      "Stage a write for user confirmation — does NOT execute. actionTypes: set_approval_decision, acknowledge_alert, update_blocker (status/escalation/notes), update_conflict (status/priority/notes — escalate with status=Escalated). Always propose first; never write without a later confirm_action in a SEPARATE turn after yes. If request+yes in one breath, ONLY propose this turn.",
    parameters: {
      type: "object",
      properties: {
        actionType: {
          type: "string",
          description:
            "set_approval_decision | acknowledge_alert | update_blocker | update_conflict",
        },
        params: {
          type: "object",
          description:
            "Must include id (code). Approval: decision + decisionDate. Alert: status Acknowledged. Blocker: status and/or escalationLevel and/or resolutionNotes. Conflict: status and/or priority and/or notes. Validated by the same Zod schemas as the UI.",
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
