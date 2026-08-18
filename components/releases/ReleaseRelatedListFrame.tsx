"use client";

import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import { taBtnSecondary } from "@/lib/styles";

type Props = {
  heading: string;
  addLabel: string;
  canEdit: boolean;
  addDisabledReason?: string | null;
  onAdd: () => void;
  loading: boolean;
  loadingLabel: string;
  emptyLabel: string;
  hasItems: boolean;
  children: ReactNode;
};

/**
 * Shared chrome for Release-detail related-entity lists (same pattern as Blockers).
 */
export function ReleaseRelatedListFrame({
  heading,
  addLabel,
  canEdit,
  addDisabledReason = null,
  onAdd,
  loading,
  loadingLabel,
  emptyLabel,
  hasItems,
  children,
}: Props) {
  const addButton = canEdit ? (
    <button
      type="button"
      className={taBtnSecondary + " text-xs !py-1.5"}
      onClick={onAdd}
      disabled={Boolean(addDisabledReason)}
      title={addDisabledReason ?? undefined}
    >
      <Plus className="h-3.5 w-3.5 inline mr-1" />
      {addLabel}
    </button>
  ) : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-white/55">
          {heading}
        </p>
        {addButton}
      </div>
      {addDisabledReason ? (
        <p className="text-xs text-amber-700 dark:text-amber-300">{addDisabledReason}</p>
      ) : null}
      {loading ? (
        <p className="text-sm text-gray-500 dark:text-white/55">{loadingLabel}</p>
      ) : !hasItems ? (
        <p className="text-sm text-gray-500 dark:text-white/55">{emptyLabel}</p>
      ) : (
        children
      )}
    </div>
  );
}
