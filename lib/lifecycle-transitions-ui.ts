/**
 * Group and filter lifecycle transition rows for Settings → Transitions.
 */

export type LifecycleTransitionStatusRef = {
  key: string;
  label: string;
  sortOrder: number;
};

export type LifecycleTransitionRowRef = {
  fromKey: string;
  toKey: string | null;
  sortOrder: number;
};

export type LifecycleTransitionFromGroup<T extends LifecycleTransitionRowRef> = {
  fromKey: string;
  fromLabel: string;
  transitions: T[];
};

/**
 * Whether a move matches the operator search (from, to, or "From → To").
 */
export function transitionMatchesQuery(
  fromLabel: string,
  toLabel: string,
  query: string
): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  const from = fromLabel.toLocaleLowerCase();
  const to = toLabel.toLocaleLowerCase();
  return (
    from.includes(needle) ||
    to.includes(needle) ||
    `${from} → ${to}`.includes(needle) ||
    `${from} ${to}`.includes(needle)
  );
}

/**
 * Filter transitions by search, then group by starting status (status sort order).
 */
export function groupTransitionsByFrom<T extends LifecycleTransitionRowRef>(
  transitions: readonly T[],
  statuses: readonly LifecycleTransitionStatusRef[],
  query = ""
): LifecycleTransitionFromGroup<T>[] {
  const statusOrder = new Map(
    statuses.map((status) => [status.key, status.sortOrder] as const)
  );
  const labelByKey = new Map(
    statuses.map((status) => [status.key, status.label] as const)
  );
  const filtered = transitions.filter((item) => {
    const toKey = item.toKey ?? "";
    return transitionMatchesQuery(
      labelByKey.get(item.fromKey) ?? item.fromKey,
      labelByKey.get(toKey) ?? (toKey || "Previous status"),
      query
    );
  });
  const byFrom = new Map<string, T[]>();
  for (const item of filtered) {
    const list = byFrom.get(item.fromKey) ?? [];
    list.push(item);
    byFrom.set(item.fromKey, list);
  }
  return [...byFrom.entries()]
    .sort(([a], [b]) => (statusOrder.get(a) ?? 0) - (statusOrder.get(b) ?? 0))
    .map(([fromKey, items]) => ({
      fromKey,
      fromLabel: labelByKey.get(fromKey) ?? fromKey,
      transitions: items.slice().sort((a, b) => a.sortOrder - b.sortOrder),
    }));
}
