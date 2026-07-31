/**
 * Text fallback → same voice tool dispatch (no separate chat agent).
 * Parses short commands into functionCalls for dispatchVoiceToolCalls.
 */
import type { VoiceFunctionCall } from "@/lib/voice/handlers/dispatch";

export type TextFallbackParseResult =
  | { ok: true; calls: VoiceFunctionCall[]; note?: string }
  | { ok: false; reason: string };

/**
 * Map a typed line into one or more voice tool calls.
 * Write confirms ("yes"/"no") require a pending actionId from a prior propose.
 *
 * @param raw - User text.
 * @param pendingActionId - Staged propose actionId (client-held), if any.
 */
export function parseVoiceTextCommand(
  raw: string,
  pendingActionId?: string | null
): TextFallbackParseResult {
  const text = raw.trim();
  if (!text) return { ok: false, reason: "Empty command" };
  const lower = text.toLowerCase();

  // Compressed "yes approve …" / "approve X" — propose only (must be before bare "yes").
  const compressedApprove = text.match(
    /^(?:yes[, ]+)?(?:please\s+)?(?:approve|set approval(?: decision)?(?: for| on)?)\s+(\S+)(?:\s+to\s+(\S+))?/i
  );
  if (compressedApprove) {
    const id = compressedApprove[1]!;
    const decision = compressedApprove[2] ?? "Approved";
    const decisionDate = new Date().toISOString().slice(0, 10);
    return {
      ok: true,
      note: "Propose only — type yes in a later message to confirm",
      calls: [
        {
          id: "text-propose-approval",
          name: "propose_action",
          args: {
            actionType: "set_approval_decision",
            params: { id, decision, decisionDate },
          },
        },
      ],
    };
  }

  const ack = text.match(
    /^(?:acknowledge|ack)(?:\s+alert)?\s+(\S+)/i
  );
  if (ack) {
    return {
      ok: true,
      note: "Propose only — type yes in a later message to confirm",
      calls: [
        {
          id: "text-propose-alert",
          name: "propose_action",
          args: {
            actionType: "acknowledge_alert",
            params: { id: ack[1], status: "Acknowledged" },
          },
        },
      ],
    };
  }

  // Confirm / cancel staged write (separate turn from propose).
  if (/^(yes|y|confirm|ok|okay|approve it|do it)\b/i.test(lower)) {
    if (!pendingActionId) {
      return {
        ok: false,
        reason: "No pending proposal to confirm — propose an action first",
      };
    }
    return {
      ok: true,
      calls: [
        {
          id: "text-confirm",
          name: "confirm_action",
          args: { actionId: pendingActionId, accept: true },
        },
      ],
    };
  }
  if (/^(no|n|cancel|discard|never ?mind)\b/i.test(lower)) {
    if (!pendingActionId) {
      return { ok: false, reason: "No pending proposal to cancel" };
    }
    return {
      ok: true,
      calls: [
        {
          id: "text-discard",
          name: "confirm_action",
          args: { actionId: pendingActionId, accept: false },
        },
      ],
    };
  }

  const go = text.match(
    /^(?:go to|open|navigate(?: to)?)\s+(.+)$/i
  );
  if (go) {
    // Pass the full phrase through — navigate_to resolves via sidebar-catalog
    // ("env booking page", "calendar tab", "/bookings", etc.).
    return {
      ok: true,
      calls: [
        {
          id: "text-nav",
          name: "navigate_to",
          args: { path: go[1]!.trim() },
        },
      ],
    };
  }

  // Clear all list filters on the current page.
  if (/^(?:clear|reset)\s+(?:all\s+)?filters?\b/i.test(lower)) {
    return {
      ok: true,
      calls: [
        {
          id: "text-clear-filters",
          name: "apply_list_filters",
          args: { clear: true },
        },
      ],
    };
  }

  // Scroll main content
  if (/^(?:scroll(?:\s+(?:the\s+)?page)?(?:\s+(up|down|to\s+top|top))?|page\s+(?:up|down))\b/i.test(lower)) {
    let direction = "down";
    if (/\bup\b/i.test(lower) && !/\bdown\b/i.test(lower)) direction = "up";
    if (/\btop\b/i.test(lower)) direction = "top";
    return {
      ok: true,
      calls: [
        {
          id: "text-scroll",
          name: "scroll_page",
          args: { direction },
        },
      ],
    };
  }

  // Sort list: "sort by conflict id" / "sort conflicts by priority desc"
  const sortCmd = text.match(
    /^(?:sort(?:\s+(?:the\s+)?(?:list|table|page))?(?:\s+(?:by|on))?\s+)(.+?)(?:\s+(asc|desc|ascending|descending|a\s*->\s*z|z\s*->\s*a))?$/i
  );
  if (sortCmd && !/^(?:filter|show|narrow|search|find)\b/i.test(lower)) {
    const colRaw = sortCmd[1]!.trim().replace(/\s+/g, "");
    const dirRaw = (sortCmd[2] ?? "asc").toLowerCase();
    const dir =
      /desc|z\s*->\s*a|za/.test(dirRaw) || /highest|newest|latest/i.test(sortCmd[1]!)
        ? "desc"
        : "asc";
    // Map common spoken labels → keys lightly; handler accepts schema keys.
    const sortKey = colRaw
      .replace(/conflictid|conflictcode/i, "conflictCode")
      .replace(/blockerid|blockercode/i, "blockerCode")
      .replace(/releaseid|releasecode/i, "releaseCode")
      .replace(/^priority$/i, "priority")
      .replace(/^status$/i, "status")
      .replace(/^severity$/i, "severity");
    return {
      ok: true,
      calls: [
        {
          id: "text-sort",
          name: "apply_list_filters",
          args: { sort: sortKey, dir },
        },
      ],
    };
  }

  // Manage columns / filters visibility
  if (
    /^(?:show|enable|unhide)\s+all\s+columns?\b/i.test(lower) ||
    /^(?:manage\s+columns?|show\s+all\s+columns?)\b/i.test(lower)
  ) {
    return {
      ok: true,
      calls: [
        {
          id: "text-show-all-cols",
          name: "configure_table_view",
          args: { action: "show_all_columns" },
        },
      ],
    };
  }
  if (
    /^(?:show|enable|unhide)\s+all\s+filters?\b/i.test(lower) ||
    /^(?:manage\s+filters?|show\s+all\s+filters?)\b/i.test(lower)
  ) {
    return {
      ok: true,
      calls: [
        {
          id: "text-show-all-filters",
          name: "configure_table_view",
          args: { action: "show_all_filters" },
        },
      ],
    };
  }
  const showCols = text.match(
    /^(?:show|enable|unhide)\s+(?:column|columns)\s+(.+)$/i
  );
  if (showCols) {
    return {
      ok: true,
      calls: [
        {
          id: "text-show-cols",
          name: "configure_table_view",
          args: { action: "show_columns", keys: showCols[1]!.trim() },
        },
      ],
    };
  }
  const showFilters = text.match(
    /^(?:show|enable|unhide)\s+(?:filter|filters)\s+(.+)$/i
  );
  if (showFilters) {
    return {
      ok: true,
      calls: [
        {
          id: "text-show-filters",
          name: "configure_table_view",
          args: { action: "show_filters", keys: showFilters[1]!.trim() },
        },
      ],
    };
  }

  // Walkthrough / tour
  const tour = text.match(
    /^(?:walk\s*me\s*through|walkthrough|tour|show me how(?: to)?|morning check|daily briefing)\s*(.*)$/i
  );
  if (tour || /^(?:morning check|daily briefing)$/i.test(lower)) {
    const hint =
      tour?.[1]?.trim() ||
      ( /morning|daily/i.test(lower) ? "morning_check" : "release_readiness");
    return {
      ok: true,
      calls: [
        {
          id: "text-walkthrough",
          name: "run_walkthrough",
          args: { tour: hint || "release_readiness" },
        },
      ],
    };
  }

  // Current page / filtered list data
  if (
    /^(?:what(?:'s| is|s)?\s+(?:on\s+)?(?:this|the)\s+(?:page|list|table|screen)|list(?:\s+the)?\s+filtered|show(?:\s+me)?\s+(?:the\s+)?(?:filtered\s+)?(?:releases?|rows?|ids?)|page\s+context|what(?:'s| is)\s+filtered)\b/i.test(
      lower
    ) ||
    /\b(filtered|on[- ]?screen|visible)\b.*\b(names?|ids?|codes?|releases?)\b/i.test(lower) ||
    /\b(names?|ids?|codes?)\b.*\b(filtered|showing)\b/i.test(lower)
  ) {
    return {
      ok: true,
      calls: [
        {
          id: "text-page-context",
          name: "get_page_context",
          args: {},
        },
      ],
    };
  }

  // Explain page (product help — not row dump)
  if (
    /^(?:explain(?: this)?(?: page|screen)?|what(?:'s| is) this page|what can i do here)\b/i.test(
      lower
    )
  ) {
    return {
      ok: true,
      calls: [
        {
          id: "text-explain",
          name: "explain_page",
          args: {},
        },
      ],
    };
  }

  // filter [page] by key value  |  show only critical blockers
  const filterCmd = text.match(
    /^(?:filter|show only|narrow)\s+(?:(?:the\s+)?(\w[\w-]*)\s+)?(?:by\s+)?(\w+)\s+(.+)$/i
  );
  if (filterCmd) {
    const page = filterCmd[1]?.trim();
    const key = filterCmd[2]!.trim();
    const value = filterCmd[3]!.trim();
    const args: Record<string, unknown> = {
      filters: { [key]: value },
    };
    if (page && !/^(by|with|to)$/i.test(page)) {
      args.page = page;
    }
    return {
      ok: true,
      calls: [
        {
          id: "text-filters",
          name: "apply_list_filters",
          args,
        },
      ],
    };
  }

  const summary = text.match(
    /^(?:summarize|summary|what's|whats|tell me about)\s+(?:the\s+)?(\w[\w-]*)\s+(\S+)/i
  );
  if (summary) {
    return {
      ok: true,
      calls: [
        {
          id: "text-summary",
          name: "get_summary",
          args: { entityType: summary[1]!.toLowerCase(), entityId: summary[2] },
        },
      ],
    };
  }

  const search = text.match(/^(?:search|find)\s+(.+)$/i);
  if (search) {
    return {
      ok: true,
      calls: [
        {
          id: "text-search",
          name: "search_entity",
          args: { query: search[1]!.trim() },
        },
      ],
    };
  }

  // Default: treat as search_entity query (names / codes).
  return {
    ok: true,
    calls: [
      {
        id: "text-search-default",
        name: "search_entity",
        args: { query: text },
      },
    ],
  };
}
