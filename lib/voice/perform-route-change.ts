/**
 * Reliable client route changes for voice navigate_to.
 * Soft router.push can silently no-op in some App Router timings — we click the
 * real sidebar link when possible and soft-retry with router.push if needed.
 * Never hard-assign (location.assign): that full-reloads the document and drops
 * the Live voice WebSocket / mic session.
 */
import {
  resolveVoiceNavElement,
  voiceGuideListHref,
} from "@/lib/voice/guide-ui";

function normalizePathname(path: string): string {
  const p = path.split(/[?#]/)[0] ?? path;
  if (p.length > 1 && p.endsWith("/")) return p.slice(0, -1);
  return p || "/";
}

function pathMatches(current: string, target: string): boolean {
  const here = normalizePathname(current);
  const want = normalizePathname(target);
  return here === want || here.startsWith(`${want}/`);
}

/**
 * Change the browser route for a voice navigation (SPA-only; preserves mic).
 * @param href - Allowlisted href (e.g. /blockers).
 * @param routerPush - Next.js router.push binding.
 */
export function performVoiceRouteChange(
  href: string,
  routerPush: (h: string) => void
): void {
  if (typeof window === "undefined") {
    routerPush(href);
    return;
  }

  const target = normalizePathname(href);
  const list = voiceGuideListHref(target);
  // Query-bearing hrefs (list filters) must not click the bare sidebar link —
  // that would navigate without the query and race the soft push.
  const hasQuery = /[?]/.test(href);

  // List tabs: click the real ProgressLink, then soft-push as belt-and-suspenders.
  if (target === list && !hasQuery) {
    const el = resolveVoiceNavElement(list);
    const anchor =
      el instanceof HTMLAnchorElement
        ? el
        : el instanceof Element
          ? el.closest("a")
          : null;
    if (anchor instanceof HTMLAnchorElement) {
      anchor.click();
    }
  }

  // Always soft-navigate; never location.assign (full reload kills voice session).
  try {
    routerPush(href);
  } catch {
    try {
      routerPush(href);
    } catch {
      /* fail soft — hard assign would drop the mic */
    }
    return;
  }

  window.setTimeout(() => {
    if (!pathMatches(window.location.pathname, target)) {
      routerPush(href);
    }
  }, 450);
}

/**
 * True when speech is clearly a sidebar/page navigation request.
 * @param raw - User utterance.
 */
export function isSpokenNavigateIntent(raw: string): boolean {
  const t = raw.trim().toLowerCase();
  if (!t) return false;
  // Avoid stealing ordinal detail opens ("open the first blocker").
  if (
    /\b(first|second|third|1st|2nd|3rd|\d+(?:st|nd|rd|th))\b/.test(t) &&
    /\b(blocker|release|risk|conflict|booking|incident|approval)\b/.test(t)
  ) {
    return false;
  }
  return (
    /\b(go to|goto|open|navigate(?:\s+to)?|take me to|switch to|show(?:\s+me)?)\b/.test(
      t
    ) || /\b(blockers?|releases?|calendar|dashboard|conflicts?)\s+(page|tab)\b/.test(t)
  );
}
