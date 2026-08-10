/**
 * Session open / resume prompts and pre-tool wait copy for voice UX.
 * Kept pure for unit tests — Live client sends these as clientContent or transcripts.
 */

export type VoiceSessionPromptKind =
  | "greet"
  | "resume_continue"
  | "context_bridge"
  /** @deprecated Use resume_continue — kept for older call sites / tests. */
  | "network_resume";

export type VoiceDigestTurn = {
  role: "user" | "model";
  text: string;
};

/** Max turns kept for a local continuity digest when Gemini resume fails. */
export const VOICE_DIGEST_MAX_TURNS = 8;

/** Soft cap on digest payload size sent to the model. */
export const VOICE_DIGEST_MAX_CHARS = 1_400;

/**
 * Client turn text that triggers a short spoken reply after setupComplete.
 * @param kind - Fresh mic start, successful resume, or failed-resume bridge.
 * @param digest - Recent user/model lines for context_bridge only.
 */
export function voiceSessionPromptText(
  kind: VoiceSessionPromptKind,
  digest = ""
): string {
  if (kind === "greet") {
    return [
      "[SESSION]",
      "New voice session just started.",
      "Greet the user in one short friendly sentence as their Release Desk release manager",
      "(you were built by the Release Desk Team — never say Google).",
      "Ask how you can help (walkthrough, find a release, check readiness, navigate, or explain a page).",
      "Do not call any tools yet.",
    ].join(" ");
  }
  if (kind === "context_bridge") {
    const body = digest.trim() || "(no prior transcript available)";
    return [
      "[SESSION]",
      "Prior Live connection could not be resumed — this is a refreshed socket,",
      "not a brand-new product tour.",
      "Recent conversation for continuity:",
      body,
      "Acknowledge in one short sentence that you are back and use that context.",
      "Do not re-introduce yourself as if meeting the user for the first time,",
      "and do not ask how you can help from scratch unless the digest is empty.",
      "Do not call any tools yet.",
    ].join(" ");
  }
  // resume_continue | network_resume (alias)
  return [
    "[SESSION]",
    "Live connection briefly refreshed (normal session rotation — same conversation).",
    "You already have the prior dialogue in context.",
    "Say one short line that you are still here and listening,",
    "then wait for the user.",
    "Do not apologize for a network outage,",
    "do not re-introduce yourself,",
    "and do not restart or ask how you can help from scratch.",
    "Do not call any tools yet.",
  ].join(" ");
}

/**
 * Compact recent user/model turns for continuity when session resumption fails.
 * @param turns - Chronological digest entries (oldest first).
 * @param maxChars - Soft character budget for the returned string.
 */
export function buildVoiceContextDigest(
  turns: VoiceDigestTurn[],
  maxChars = VOICE_DIGEST_MAX_CHARS
): string {
  const lines: string[] = [];
  for (const t of turns) {
    const role = t.role === "user" ? "User" : "Assistant";
    const text = t.text.replace(/\s+/g, " ").trim().slice(0, 400);
    if (!text) continue;
    lines.push(`${role}: ${text}`);
  }
  let out = lines.join("\n");
  if (out.length > maxChars) {
    out = out.slice(out.length - maxChars);
    const nl = out.indexOf("\n");
    if (nl > 0 && nl < 80) out = out.slice(nl + 1);
  }
  return out;
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
    case "lookup_navigation":
      return "Checking navigation… please wait";
    case "navigate_to":
      return "Navigating… please wait";
    case "apply_list_filters":
      return "Applying filters… please wait";
    case "get_summary":
      return "Looking that up… please wait";
    case "explain_page":
      return "Explaining this page… please wait";
    case "run_walkthrough":
      return "Starting walkthrough… please wait";
    case "configure_table_view":
      return "Updating table view… please wait";
    case "scroll_page":
      return null;
    case "get_page_context":
      return "Reading this page… please wait";
    case "get_release_bundle":
      return "Loading release bundle… please wait";
    case "get_attention_brief":
      return "Building attention brief… please wait";
    case "get_calendar_window":
      return "Checking the calendar… please wait";
    case "compare_releases":
      return "Comparing releases… please wait";
    case "open_entity":
      return "Opening… please wait";
    case "copy_visible_codes":
      return "Copying codes… please wait";
    case "undo_filters":
      return "Restoring previous filters… please wait";
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
