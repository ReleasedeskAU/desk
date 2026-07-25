/**
 * navigate_to tool handler — allowlisted client-side navigation only.
 * Does not write to the database. Invalid / nonexistent paths return a
 * failure tool result (no navigation, no crash).
 */
import {
  isAllowedVoicePath,
  labelForVoicePath,
  normalizeVoicePath,
} from "@/lib/voice/route-allowlist";
import { assertVoicePathExists } from "@/lib/voice/path-exists";

export type NavigateToArgs = {
  path?: unknown;
  label?: unknown;
};

export type NavigateToolResult = {
  ok: boolean;
  tool: "navigate_to";
  path?: string;
  displayName?: string;
  reason?: string;
  /** Short line for the VoiceMic action / transcript strip. */
  actionLine: string;
};

export type NavigateDeps = {
  /** Next.js App Router push (client-side; no full reload). */
  push: (href: string) => void;
  /** Injectable fetch for existence checks (tests). */
  fetch?: typeof fetch;
};

/**
 * Validate path against the voice allowlist + entity existence, then navigate.
 * @param args - Tool args from Gemini (`path` must be a full href, optional `label`).
 * @param deps - Router adapters (must provide `push`).
 * @returns Structured tool result for the Live session.
 */
export async function handleNavigateTo(
  args: NavigateToArgs,
  deps: NavigateDeps
): Promise<NavigateToolResult> {
  const rawPath = typeof args.path === "string" ? args.path.trim() : "";
  const label = typeof args.label === "string" ? args.label : undefined;

  // Reject bare ids before normalization invents a leading slash (rel-rel-v2140 → /rel-rel-v2140).
  if (rawPath && !rawPath.startsWith("/") && !/^https?:\/\//i.test(rawPath)) {
    return {
      ok: false,
      tool: "navigate_to",
      path: rawPath,
      reason:
        "Bare ids are not navigable — use the path (href) from search_entity, e.g. /releases/rel-v2140",
      actionLine: `Navigate blocked — use search path, not id (${rawPath})`,
    };
  }

  const path = normalizeVoicePath(rawPath);

  if (!path) {
    return {
      ok: false,
      tool: "navigate_to",
      reason:
        "Missing or invalid path — pass the path field from search_entity (full href starting with /)",
      actionLine: "Navigate failed — invalid path",
    };
  }

  if (!isAllowedVoicePath(path)) {
    return {
      ok: false,
      tool: "navigate_to",
      path,
      reason: "Path is not in the Release Desk allowlist",
      actionLine: `Navigate blocked — unknown page (${path})`,
    };
  }

  const exists = await assertVoicePathExists(path, { fetch: deps.fetch });
  if (!exists.ok) {
    return {
      ok: false,
      tool: "navigate_to",
      path,
      reason: exists.reason,
      actionLine: `Navigate blocked — ${exists.reason}`,
    };
  }

  const displayName = labelForVoicePath(path, label);
  deps.push(path);

  return {
    ok: true,
    tool: "navigate_to",
    path,
    displayName,
    actionLine: `Opening ${displayName}`,
  };
}
