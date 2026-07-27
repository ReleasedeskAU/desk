/**
 * navigate_to tool handler — allowlisted client-side navigation only.
 * Resolves spoken sidebar names ("calendar tab", "env booking page") and
 * path aliases (/bookings → /booking) via sidebar-catalog before allowlist checks.
 */
import {
  isAllowedVoicePath,
  labelForVoicePath,
  normalizeVoicePath,
} from "@/lib/voice/route-allowlist";
import { resolveVoiceNavTarget } from "@/lib/voice/sidebar-catalog";
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

  // Spoken sidebar names (calendar tab / env booking page) → canonical href.
  // Also accepts near-miss paths like /bookings.
  const resolved = rawPath ? resolveVoiceNavTarget(rawPath) : null;
  const candidateRaw = resolved?.path ?? rawPath;

  // Reject bare ids before normalization invents a leading slash (rel-rel-v2140 → /rel-rel-v2140).
  if (
    candidateRaw &&
    !candidateRaw.startsWith("/") &&
    !/^https?:\/\//i.test(candidateRaw)
  ) {
    // Last chance: resolve as spoken phrase without a leading slash.
    const spoken = resolveVoiceNavTarget(candidateRaw);
    if (!spoken) {
      return {
        ok: false,
        tool: "navigate_to",
        path: rawPath,
        reason:
          "Bare ids are not navigable — use a sidebar name (e.g. env booking) or path from search_entity",
        actionLine: `Navigate blocked — use search path, not id (${rawPath})`,
      };
    }
    return navigateResolved(spoken.path, label ?? spoken.label, deps);
  }

  return navigateResolved(candidateRaw, label ?? resolved?.label, deps);
}

/**
 * Allowlist + existence check + router.push.
 */
async function navigateResolved(
  rawPath: string,
  label: string | undefined,
  deps: NavigateDeps
): Promise<NavigateToolResult> {
  const path = normalizeVoicePath(rawPath);

  if (!path) {
    return {
      ok: false,
      tool: "navigate_to",
      reason:
        "Missing or invalid path — pass a sidebar name or path starting with /",
      actionLine: "Navigate failed — invalid path",
    };
  }

  // Apply path aliases again after normalize (e.g. /Bookings).
  const aliased = resolveVoiceNavTarget(path);
  const finalPath =
    aliased?.path && aliased.path.startsWith("/")
      ? normalizeVoicePath(aliased.path) ?? path
      : path;
  const displayHint = label ?? aliased?.label;

  if (!isAllowedVoicePath(finalPath)) {
    return {
      ok: false,
      tool: "navigate_to",
      path: finalPath,
      reason: "Path is not in the Release Desk allowlist",
      actionLine: `Navigate blocked — unknown page (${finalPath})`,
    };
  }

  const exists = await assertVoicePathExists(finalPath, { fetch: deps.fetch });
  if (!exists.ok) {
    return {
      ok: false,
      tool: "navigate_to",
      path: finalPath,
      reason: exists.reason,
      actionLine: `Navigate blocked — ${exists.reason}`,
    };
  }

  const displayName = labelForVoicePath(finalPath, displayHint);
  deps.push(finalPath);

  return {
    ok: true,
    tool: "navigate_to",
    path: finalPath,
    displayName,
    actionLine: `Opening ${displayName}`,
  };
}
