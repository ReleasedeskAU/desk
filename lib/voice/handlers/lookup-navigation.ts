/**
 * lookup_navigation tool — Navigation Agent for the Voice Live LLM.
 * Resolves sidebar tabs / aliases / detail shapes without inventing URLs.
 */
import { lookupNavigation } from "@/lib/voice/nav-agent";

export type LookupNavigationArgs = {
  query?: unknown;
};

export type LookupNavigationResult = {
  ok: boolean;
  tool: "lookup_navigation";
  query: string;
  href?: string;
  label?: string;
  section?: string;
  kind?: string;
  candidates?: Array<{ href: string; label: string; section: string; kind: string }>;
  reason?: string;
  instruction?: string;
  actionLine: string;
};

/**
 * Resolve a spoken page/tab name or guessed path via the nav agent.
 * @param args - Tool args (`query` required).
 * @returns Structured result for the Live toolResponse.
 */
export function handleLookupNavigation(
  args: LookupNavigationArgs
): LookupNavigationResult {
  const query = typeof args.query === "string" ? args.query.trim() : "";
  const result = lookupNavigation(query);

  if (result.ok && result.match) {
    return {
      ok: true,
      tool: "lookup_navigation",
      query,
      href: result.match.href,
      label: result.match.label,
      section: result.match.section,
      kind: result.match.kind,
      instruction: `Call navigate_to with path="${result.match.href}" to open this page.`,
      actionLine: `Nav agent: ${result.match.label} → ${result.match.href}`,
    };
  }

  return {
    ok: false,
    tool: "lookup_navigation",
    query,
    candidates: result.candidates,
    reason: result.reason,
    instruction: result.candidates?.length
      ? "Pick one candidate.href and call navigate_to. Do not invent a different URL."
      : "Ask the user which page, or try search_entity for a record code.",
    actionLine: result.candidates?.length
      ? `Nav agent: ambiguous (${result.candidates.length} candidates)`
      : `Nav agent: unknown page (${query || "empty"})`,
  };
}
