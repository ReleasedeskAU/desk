/**
 * Session open / resume prompts and pre-tool wait copy for voice UX.
 * Kept pure for unit tests — Live client sends these as clientContent or transcripts.
 */

export type VoiceSessionPromptKind = "greet" | "network_resume";

/**
 * Client turn text that triggers a short spoken reply after setupComplete.
 * @param kind - Fresh mic start vs network reconnect (same Live session).
 */
export function voiceSessionPromptText(kind: VoiceSessionPromptKind): string {
  if (kind === "greet") {
    return [
      "[SESSION]",
      "New voice session just started.",
      "Greet the user in one short friendly sentence as Release Desk voice,",
      "and ask how you can help (navigate, search, or summarize).",
      "Do not call any tools yet.",
    ].join(" ");
  }
  return [
    "[SESSION]",
    "The Live connection dropped due to a network issue and is restored.",
    "Briefly apologize that you got disconnected because of the network,",
    "say you are back, and continue the same conversation.",
    "Do not restart from scratch or re-greet as a brand-new session.",
    "Do not call any tools yet.",
  ].join(" ");
}

/**
 * UI / transcript line shown immediately before a tool runs.
 * @param toolName - Gemini function name.
 * @returns Wait copy, or null when no notice is needed.
 */
export function voiceToolWaitNotice(toolName: string | undefined): string | null {
  switch (toolName) {
    case "search_entity":
      return "Searching… please wait";
    case "navigate_to":
      return "Navigating… please wait";
    case "get_summary":
      return "Looking that up… please wait";
    case "propose_action":
      return "Preparing that change… please wait";
    case "confirm_action":
      return "Confirming… please wait";
    default:
      return null;
  }
}

/**
 * Deduped wait notices for a tool-call batch (stable order).
 * @param names - Tool names from the Live toolCall.
 */
export function voiceToolWaitNoticesForCalls(
  names: Array<string | undefined>
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of names) {
    const line = voiceToolWaitNotice(name);
    if (!line || seen.has(line)) continue;
    seen.add(line);
    out.push(line);
  }
  return out;
}
