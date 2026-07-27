/**
 * navigate_to tool handler — allowlisted client-side navigation only.
 * Resolves spoken sidebar names ("calendar tab", "env booking page") and
 * path aliases (/bookings → /booking) via sidebar-catalog before allowlist checks.
 * Bad/invented detail paths are recovered via search + app-context catalogs
 * (never hardcoded singular→plural URL rewrites).
 */
import {
  isAllowedVoicePath,
  labelForVoicePath,
  normalizeVoicePath,
} from "@/lib/voice/route-allowlist";
import { resolveVoiceNavTarget } from "@/lib/voice/sidebar-catalog";
import { assertVoicePathExists } from "@/lib/voice/path-exists";
import { resolveEntityNavFromHint } from "@/lib/voice/resolve-nav-path";

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

  // Bare non-path tokens: sidebar phrase, else entity catalog lookup (REL-0004 → seed href).
  if (
    candidateRaw &&
    !candidateRaw.startsWith("/") &&
    !/^https?:\/\//i.test(candidateRaw)
  ) {
    const spoken = resolveVoiceNavTarget(candidateRaw);
    if (spoken) {
      return navigateResolved(spoken.path, label ?? spoken.label, deps);
    }
    const fromCatalog = resolveEntityNavFromHint(candidateRaw);
    if (fromCatalog) {
      return navigateResolved(fromCatalog.path, label ?? fromCatalog.label, deps);
    }
    return {
      ok: false,
      tool: "navigate_to",
      path: rawPath,
      reason:
        "Bare ids are not navigable — call search_entity and use the returned path field",
      actionLine: `Navigate blocked — use search path, not id (${rawPath})`,
    };
  }

  return navigateResolved(candidateRaw, label ?? resolved?.label, deps);
}

/**
 * Allowlist + existence check + router.push.
 * If the model invented a bad shape (/release/…), recover via catalog href.
 */
async function navigateResolved(
  rawPath: string,
  label: string | undefined,
  deps: NavigateDeps
): Promise<NavigateToolResult> {
  let path = normalizeVoicePath(rawPath);
  let displayHint = label;

  if (!path) {
    return {
      ok: false,
      tool: "navigate_to",
      reason:
        "Missing or invalid path — pass a sidebar name or path from search_entity",
      actionLine: "Navigate failed — invalid path",
    };
  }

  // Apply path aliases again after normalize (e.g. /Bookings).
  const aliased = resolveVoiceNavTarget(path);
  if (aliased?.path?.startsWith("/")) {
    path = normalizeVoicePath(aliased.path) ?? path;
    displayHint = displayHint ?? aliased.label;
  }

  // Unknown / disallowed shape → resolve real href from search or visible rows.
  if (!isAllowedVoicePath(path)) {
    const recovered = resolveEntityNavFromHint(rawPath);
    if (recovered && isAllowedVoicePath(recovered.path)) {
      path = normalizeVoicePath(recovered.path) ?? recovered.path;
      displayHint = displayHint ?? recovered.label;
    } else {
      return {
        ok: false,
        tool: "navigate_to",
        path,
        reason:
          "Path is not in the Release Desk allowlist — call search_entity and use candidate.path",
        actionLine: `Navigate blocked — unknown page (${path})`,
      };
    }
  }

  const exists = await assertVoicePathExists(path, { fetch: deps.fetch });
  if (!exists.ok) {
    // Wrong path but real entity code in the segment — try catalog once.
    const recovered = resolveEntityNavFromHint(path);
    if (
      recovered &&
      recovered.path !== path &&
      isAllowedVoicePath(recovered.path)
    ) {
      const ok2 = await assertVoicePathExists(recovered.path, { fetch: deps.fetch });
      if (ok2.ok) {
        path = normalizeVoicePath(recovered.path) ?? recovered.path;
        displayHint = displayHint ?? recovered.label;
      } else {
        return {
          ok: false,
          tool: "navigate_to",
          path,
          reason: exists.reason,
          actionLine: `Navigate blocked — ${exists.reason}`,
        };
      }
    } else {
      return {
        ok: false,
        tool: "navigate_to",
        path,
        reason: exists.reason,
        actionLine: `Navigate blocked — ${exists.reason}`,
      };
    }
  }

  const displayName = labelForVoicePath(path, displayHint);
  deps.push(path);

  return {
    ok: true,
    tool: "navigate_to",
    path,
    displayName,
    actionLine: `Opening ${displayName}`,
  };
}
