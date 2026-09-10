/**
 * Native scope approval statuses. Logic uses keys only.
 * Display uses tenant labels, then purpose, never a hardcoded English match.
 */

export const SCOPE_STATUS_DRAFT = "draft" as const;
export const SCOPE_STATUS_APPROVED = "approved" as const;

export const SCOPE_STATUS_KEYS = [SCOPE_STATUS_DRAFT, SCOPE_STATUS_APPROVED] as const;

export type ScopeStatusKey = (typeof SCOPE_STATUS_KEYS)[number];

export type ScopeStatusDefinition = {
  key: ScopeStatusKey;
  label: string;
  purpose: string;
};

export type ScopeSectionConfig = {
  statuses: ScopeStatusDefinition[];
  /** When true, draft scope due date is required before approve. */
  approvalDueRequired: boolean;
};

const DEFAULT_STATUSES: readonly ScopeStatusDefinition[] = [
  {
    key: SCOPE_STATUS_DRAFT,
    label: "Draft",
    purpose: "Scope is still being written and can be edited",
  },
  {
    key: SCOPE_STATUS_APPROVED,
    label: "Approved",
    purpose: "Scope text, due date, attachments, and grants are locked",
  },
];

export const DEFAULT_SCOPE_SECTION_CONFIG: ScopeSectionConfig = {
  statuses: DEFAULT_STATUSES.map((row) => ({ ...row })),
  approvalDueRequired: false,
};

/**
 * True when value is a known scope status key.
 *
 * @param value - Candidate key.
 */
export function isScopeStatusKey(value: unknown): value is ScopeStatusKey {
  return value === SCOPE_STATUS_DRAFT || value === SCOPE_STATUS_APPROVED;
}

/**
 * Normalize a stored snapshot into a safe config. Unknown keys are dropped.
 *
 * @param raw - JSON snapshot from UserScopeSectionConfig.
 * @returns Validated config with defaults filled.
 */
export function parseScopeSectionConfig(raw: unknown): ScopeSectionConfig {
  const fallback = DEFAULT_SCOPE_SECTION_CONFIG;
  if (!raw || typeof raw !== "object") return { ...fallback, statuses: fallback.statuses.map((s) => ({ ...s })) };
  const obj = raw as Record<string, unknown>;
  const incoming = Array.isArray(obj.statuses) ? obj.statuses : [];
  const byKey = new Map<ScopeStatusKey, ScopeStatusDefinition>();
  for (const row of incoming) {
    if (!row || typeof row !== "object") continue;
    const item = row as Record<string, unknown>;
    if (!isScopeStatusKey(item.key)) continue;
    const label = typeof item.label === "string" ? item.label.trim() : "";
    const purpose = typeof item.purpose === "string" ? item.purpose.trim() : "";
    const base = DEFAULT_STATUSES.find((s) => s.key === item.key) ?? DEFAULT_STATUSES[0];
    byKey.set(item.key, {
      key: item.key,
      label: label || purpose || base.label,
      purpose: purpose || base.purpose,
    });
  }
  const statuses = DEFAULT_STATUSES.map((base) => byKey.get(base.key) ?? { ...base });
  return {
    statuses,
    approvalDueRequired: obj.approvalDueRequired === true,
  };
}

/**
 * Display label for a scope status key.
 *
 * @param config - Tenant scope-section config.
 * @param key - Stored status key.
 * @returns Tenant label, else purpose, else the key (never guess another status).
 */
export function scopeStatusLabel(config: ScopeSectionConfig, key: string): string {
  const row = config.statuses.find((s) => s.key === key);
  if (!row) return key;
  const label = row.label.trim();
  if (label) return label;
  const purpose = row.purpose.trim();
  return purpose || key;
}

/**
 * True when the stored key is the draft state.
 *
 * @param key - Stored status key.
 */
export function isScopeDraft(key: string | null | undefined): boolean {
  return key === SCOPE_STATUS_DRAFT;
}

/**
 * True when the stored key is the approved (locked) state.
 *
 * @param key - Stored status key.
 */
export function isScopeApproved(key: string | null | undefined): boolean {
  return key === SCOPE_STATUS_APPROVED;
}

/**
 * Whether a draft due date is overdue (warning only — approve stays available).
 *
 * @param args.dueAt - Stored due instant.
 * @param args.statusKey - Scope status key.
 * @param args.now - Comparison instant.
 */
export function isScopeApprovalDueOverdue(args: {
  dueAt: Date | string | null | undefined;
  statusKey: string | null | undefined;
  now?: Date;
}): boolean {
  if (!isScopeDraft(args.statusKey) || !args.dueAt) return false;
  const due = args.dueAt instanceof Date ? args.dueAt : new Date(args.dueAt);
  if (Number.isNaN(due.getTime())) return false;
  return due.getTime() < (args.now ?? new Date()).getTime();
}
