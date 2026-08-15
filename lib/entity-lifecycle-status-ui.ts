/**
 * Generic lifecycle status helpers for non-release entities (blocker, risk, …).
 * Pure — works with any config that exposes statuses with label/enabled/terminal.
 */

export type EntityLifecycleStatusLike = {
  key: string;
  label: string;
  sortOrder: number;
  terminal: boolean;
  enabled: boolean;
  /** Entity-specific flags (e.g. blocksReleaseReady) are allowed. */
  [extra: string]: unknown;
};

export type EntityLifecycleConfigLike = {
  statuses: EntityLifecycleStatusLike[];
  transitions?: Array<{
    fromKey: string;
    toKey: string;
    enabled: boolean;
    sortOrder: number;
    enforcement?: string;
  }>;
};

export type EntityStatusDisplayTone = "good" | "warn" | "bad" | "info" | "neutral";

export type EntityStatusDisplay = {
  label: string;
  terminal: boolean;
  enabled: boolean;
  known: boolean;
  tone: EntityStatusDisplayTone;
};

/**
 * Find a status by label or key (case-insensitive).
 */
export function findEntityStatusByLabel(
  config: EntityLifecycleConfigLike,
  status: string | null | undefined
): EntityLifecycleStatusLike | null {
  const raw = (status ?? "").trim();
  if (!raw) return null;
  const needle = raw.toLocaleLowerCase();
  return (
    config.statuses.find(
      (s) =>
        s.label.toLocaleLowerCase() === needle ||
        s.key.toLocaleLowerCase() === needle
    ) ?? null
  );
}

/**
 * Select options from enabled labels, plus the current value if it is Off/unknown.
 * @param enabledLabels - Enabled status labels in display order.
 * @param current - Value currently stored on the row.
 */
export function statusSelectOptions(
  enabledLabels: readonly string[],
  current?: string | null
): Array<{ value: string; label: string }> {
  const opts = enabledLabels.map((v) => ({ value: v, label: v }));
  const raw = (current ?? "").trim();
  if (raw && !opts.some((o) => o.value === raw)) {
    return [{ value: raw, label: raw }, ...opts];
  }
  return opts;
}

/**
 * Enabled status labels in sort order.
 */
export function enabledEntityStatusLabels(
  config: EntityLifecycleConfigLike
): string[] {
  return [...config.statuses]
    .filter((s) => s.enabled)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((s) => s.label);
}

/**
 * Default create status: enabled Starting status, else first enabled non-terminal.
 */
export function defaultEntityStatusLabel(
  config: EntityLifecycleConfigLike
): string {
  const enabled = [...config.statuses]
    .filter((s) => s.enabled)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const intake = enabled.find((s) => s.isIntake === true);
  const open = enabled.find((s) => !s.terminal);
  return (intake ?? open ?? enabled[0])?.label ?? "";
}

/**
 * Enabled Starting-status labels (create path for entities that must not skip ahead).
 */
export function intakeEntityStatusLabels(
  config: EntityLifecycleConfigLike
): string[] {
  return [...config.statuses]
    .filter((s) => s.enabled && s.isIntake === true)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((s) => s.label);
}

/**
 * Whether a status label is enabled in config.
 */
export function isEnabledEntityStatusLabel(
  config: EntityLifecycleConfigLike,
  status: string | null | undefined
): boolean {
  return Boolean(findEntityStatusByLabel(config, status)?.enabled);
}

/**
 * Filter options: enabled labels, then Off/unknown still present on data.
 */
export function entityStatusFilterOptions(
  config: EntityLifecycleConfigLike,
  presentOnData: Iterable<string> = []
): string[] {
  const enabled = enabledEntityStatusLabels(config);
  const enabledSet = new Set(enabled.map((l) => l.toLocaleLowerCase()));
  const extras: string[] = [];
  const seen = new Set<string>();
  for (const raw of presentOnData) {
    const label = raw.trim();
    if (!label) continue;
    const key = label.toLocaleLowerCase();
    if (enabledSet.has(key) || seen.has(key)) continue;
    const known = findEntityStatusByLabel(config, label);
    extras.push(known?.label ?? label);
    seen.add(key);
  }
  extras.sort((a, b) => a.localeCompare(b));
  return [...enabled, ...extras];
}

/**
 * Resolve display metadata (tone from terminal / open).
 */
export function resolveEntityStatusDisplay(
  config: EntityLifecycleConfigLike,
  status: string | null | undefined
): EntityStatusDisplay {
  const raw = (status ?? "").trim();
  const found = findEntityStatusByLabel(config, raw);
  if (!found) {
    return {
      label: raw || "—",
      terminal: false,
      enabled: false,
      known: false,
      tone: "neutral",
    };
  }
  return {
    label: found.label,
    terminal: found.terminal,
    enabled: found.enabled,
    known: true,
    tone: found.terminal ? "good" : "info",
  };
}

/**
 * Labels that count as “open / needs attention” (enabled + non-terminal).
 * Prefer entity-specific flags (e.g. blocksReleaseReady) when provided.
 */
export function openEntityStatusLabels(
  config: EntityLifecycleConfigLike,
  isOpen?: (status: EntityLifecycleStatusLike) => boolean
): string[] {
  return [...config.statuses]
    .filter((s) => s.enabled && (isOpen ? isOpen(s) : !s.terminal))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((s) => s.label);
}

/**
 * Tailwind tokens for entity status badges.
 */
export function entityStatusBadgeTokens(tone: EntityStatusDisplayTone): {
  bg: string;
  text: string;
} {
  switch (tone) {
    case "good":
      return { bg: "bg-success-50", text: "text-success-600" };
    case "warn":
      return { bg: "bg-warning-50", text: "text-warning-700" };
    case "bad":
      return { bg: "bg-error-50", text: "text-error-600" };
    case "info":
      return { bg: "bg-info-50", text: "text-info-600" };
    default:
      return { bg: "bg-gray-100", text: "text-gray-600" };
  }
}
