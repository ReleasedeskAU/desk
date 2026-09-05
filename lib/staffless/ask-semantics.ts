/**
 * Semantic rules Ask must follow. These are QA contracts for open/overdue/ties —
 * not phrase matchers and not a second query engine.
 */

export const DEFAULT_RESOLVED_STATUSES = ["Done"] as const;

export const ASK_SEP5_FIXTURE = {
  asOf: "2026-09-05",
  openBugs: 43,
  mohdUnresolved: 60,
  overdueKeys: ["RD-88", "RD-83", "RD-82", "RD-81", "RD-39", "RD-30", "RD-28"],
  highestPriority: [
    { key: "RD-142", assignee: null as string | null },
    { key: "RD-39", assignee: "Release Desk" },
    { key: "RD-89", assignee: "Jalla" },
  ],
} as const;

export type StatusCountGroup = { value: string; count: number };
export type NamedCount = { party: string; count: number };
export type ListedTicket = { key: string; assignee: string | null };

/**
 * Published resolved statuses, or Done-only when StaffLess omitted the list.
 * @param published - resolved_statuses from list_queryable_fields.
 */
export function resolvedStatuses(published?: readonly string[] | null): string[] {
  if (published && published.length > 0) return [...published];
  return [...DEFAULT_RESOLVED_STATUSES];
}

/**
 * True when the stored status is one of the published resolved values.
 * Comparison is exact on the stored name — there is no statusCategory field.
 */
export function isResolvedStatus(
  status: string,
  published?: readonly string[] | null
): boolean {
  const resolved = new Set(resolvedStatuses(published).map((item) => item.toLowerCase()));
  return resolved.has(status.trim().toLowerCase());
}

/**
 * Stored statuses that count as open. Discovered list minus resolved — never hardcoded.
 * @param stored - values from list_distinct_values(status) or a breakdown.
 */
export function openStatusValues(
  stored: readonly string[],
  published?: readonly string[] | null
): string[] {
  return stored.filter((value) => value.trim() && !isResolvedStatus(value, published));
}

/**
 * Sum unique-document counts for every non-resolved status group.
 * @param groups - get_breakdown_by_field(status) groups, optionally already type-filtered.
 */
export function sumOpenCount(
  groups: readonly StatusCountGroup[],
  published?: readonly string[] | null
): number {
  return groups.reduce((total, group) => {
    if (isResolvedStatus(group.value, published)) return total;
    return total + Math.max(0, group.count);
  }, 0);
}

/**
 * Overdue = due date strictly before today AND status is not resolved.
 * Workflow state alone is never overdue.
 */
export function isOverdue(opts: {
  duedate: string | null | undefined;
  status: string;
  today: string;
  publishedResolved?: readonly string[] | null;
}): boolean {
  if (!opts.duedate) return false;
  if (isResolvedStatus(opts.status, opts.publishedResolved)) return false;
  const prefix = opts.duedate.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(prefix)) return false;
  return prefix < opts.today;
}

/**
 * Leaders of a "who has the most X" grouping, including an unassigned bucket.
 * @returns every party tied at the top count (empty when there are no groups).
 */
export function tiedLeaders(groups: readonly NamedCount[]): string[] {
  if (groups.length === 0) return [];
  const top = Math.max(...groups.map((group) => group.count));
  return groups.filter((group) => group.count === top).map((group) => group.party);
}

/**
 * Assignees that appear on more than one ticket in a listed set.
 */
export function sharedAssignees(tickets: readonly ListedTicket[]): string[] {
  const counts = new Map<string, number>();
  for (const ticket of tickets) {
    if (!ticket.assignee) continue;
    counts.set(ticket.assignee, (counts.get(ticket.assignee) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, n]) => n > 1).map(([name]) => name);
}

/**
 * Keys in a listed set with no assignee.
 */
export function unassignedKeys(tickets: readonly ListedTicket[]): string[] {
  return tickets.filter((ticket) => !ticket.assignee).map((ticket) => ticket.key);
}
