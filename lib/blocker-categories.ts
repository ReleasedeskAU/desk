/**
 * Allowed Blocker Category (blockerType) values.
 * Live 12 plus sheet-only Approval, Data, Vendor.
 */

export const BLOCKER_CATEGORIES = [
  "Environment",
  "Technical",
  "Dependency",
  "Resource",
  "Business",
  "Testing",
  "Security",
  "Infrastructure",
  "Defect",
  "Compliance",
  "Documentation",
  "External",
  "Approval",
  "Data",
  "Vendor",
] as const;

export type BlockerCategory = (typeof BLOCKER_CATEGORIES)[number];

const CATEGORY_SET = new Set<string>(BLOCKER_CATEGORIES);

/**
 * Whether a raw category string is in the agreed 15-value list.
 * @param value - User/API-supplied category
 */
export function isBlockerCategory(value: unknown): value is BlockerCategory {
  return typeof value === "string" && CATEGORY_SET.has(value);
}

/**
 * Select options for create/edit Category fields.
 */
export function blockerCategoryOptions(): { value: string; label: string }[] {
  return BLOCKER_CATEGORIES.map((value) => ({ value, label: value }));
}
