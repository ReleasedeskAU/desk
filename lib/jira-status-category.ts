/**
 * Jira statusCategory.key — the portable open/resolved classifier.
 * Display names (Done, Closed, Resolved, and localized labels) are never the rule.
 */

export const STATUS_CATEGORY_KEYS = ["new", "indeterminate", "done"] as const;

export type StatusCategoryKey = (typeof STATUS_CATEGORY_KEYS)[number];

export const RESOLVED_STATUS_CATEGORY: StatusCategoryKey = "done";

/**
 * Normalize a stored tag to a Jira category key, or null when missing/invalid.
 * Null means not classifiable — not open and not resolved.
 * Only the exact keys are accepted (not the English display name "Done").
 */
export function classifyStatusCategory(raw: unknown): StatusCategoryKey | null {
  if (typeof raw !== "string") return null;
  const key = raw.trim();
  if (key === "new" || key === "indeterminate" || key === "done") return key;
  return null;
}

/** Resolved = category key `done`. A status named Done with no category is not resolved. */
export function isResolvedCategory(raw: unknown): boolean {
  return classifyStatusCategory(raw) === RESOLVED_STATUS_CATEGORY;
}

/** Open = category key `new` or `indeterminate`. Missing category is not open. */
export function isOpenCategory(raw: unknown): boolean {
  const key = classifyStatusCategory(raw);
  return key === "new" || key === "indeterminate";
}
