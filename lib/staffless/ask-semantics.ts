/**
 * Semantic rules Ask must follow. These are QA contracts for open/overdue/ties —
 * not phrase matchers and not a second query engine.
 */

import { isOpenCategory, isResolvedCategory } from "@/lib/jira-status-category";

export {
  RESOLVED_STATUS_CATEGORY,
  STATUS_CATEGORY_KEYS,
  classifyStatusCategory,
  isOpenCategory,
  isResolvedCategory,
} from "@/lib/jira-status-category";

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
 * Stored category keys that count as open. Unknown or missing keys are omitted.
 * @param stored - values from list_distinct_values(status_category) or a breakdown.
 */
export function openCategoryValues(stored: readonly string[]): string[] {
  return stored.filter((value) => isOpenCategory(value));
}

/**
 * Sum unique-document counts for new + indeterminate category groups.
 * Groups with missing or invalid keys are not open and not resolved.
 */
export function sumOpenCount(groups: readonly StatusCountGroup[]): number {
  return groups.reduce((total, group) => {
    if (!isOpenCategory(group.value)) return total;
    return total + Math.max(0, group.count);
  }, 0);
}

/**
 * Sum unique-document counts for status_category=done groups.
 */
export function sumResolvedCount(groups: readonly StatusCountGroup[]): number {
  return groups.reduce((total, group) => {
    if (!isResolvedCategory(group.value)) return total;
    return total + Math.max(0, group.count);
  }, 0);
}

/**
 * Overdue = due date strictly before today AND status_category is open.
 * Missing category is not classifiable — not overdue.
 */
export function isOverdue(opts: {
  duedate: string | null | undefined;
  statusCategory: unknown;
  today: string;
}): boolean {
  if (!opts.duedate) return false;
  if (!isOpenCategory(opts.statusCategory)) return false;
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
