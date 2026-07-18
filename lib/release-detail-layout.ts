import type { DbNextAction } from "@/lib/db-release-command";

/**
 * Pick the headline readiness for the command-center summary bar.
 * Computed reflects live operational signals; stored is planning-only.
 *
 * @param computed - Live readiness from command-center API (null while loading).
 * @param stored - Persisted planning readiness on the release row.
 * @returns Percent to emphasize as current state, preferring computed when available.
 */
export function pickHeadlineReadiness(
  computed: number | null | undefined,
  stored: number | null | undefined
): number {
  if (computed != null && Number.isFinite(computed)) return Math.round(computed);
  if (stored != null && Number.isFinite(stored)) return Math.round(stored);
  return 0;
}

/**
 * Select the single most-urgent next best action for the summary bar.
 *
 * @param actions - Ordered next-action list from command-center logic.
 * @returns First action, or null when none recommended.
 */
export function pickUrgentNextAction(
  actions: DbNextAction[] | null | undefined
): DbNextAction | null {
  if (!actions?.length) return null;
  return actions[0] ?? null;
}

/**
 * Whether a primary tile should open by default based on operational urgency.
 *
 * @param status - Release status string.
 * @param conflictFlag - Environment / schedule conflict flag.
 * @returns True when blockers/conflicts tile should start expanded.
 */
export function shouldDefaultOpenBlockersTile(
  status: string | null | undefined,
  conflictFlag: boolean | null | undefined
): boolean {
  const normalized = (status ?? "").toLowerCase();
  return Boolean(conflictFlag) || normalized.includes("block") || normalized.includes("risk");
}

/**
 * Open a collapsible `<details>` section when the URL hash targets its id.
 * Used so dashboard tile links expand deep-dive content on click.
 *
 * @param hash - location.hash including leading `#`, or empty.
 * @param root - Document root to query (injectable for tests).
 * @returns True when a matching details element was opened.
 */
export function openDetailsFromHash(
  hash: string,
  root: ParentNode = typeof document !== "undefined" ? document : (null as unknown as ParentNode)
): boolean {
  if (!hash || hash === "#" || !root) return false;
  const id = hash.startsWith("#") ? hash.slice(1) : hash;
  // Only allow simple DOM ids from our own anchors (no CSS.escape needed in Node tests).
  if (!id || !/^[A-Za-z][\w:-]*$/.test(id)) return false;
  const el = root.querySelector(`#${id}`);
  // HTMLDetailsElement in the browser; duck-type for unit tests without DOM globals.
  if (!el || typeof (el as HTMLDetailsElement).open !== "boolean") return false;
  (el as HTMLDetailsElement).open = true;
  return true;
}
