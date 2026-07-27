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
