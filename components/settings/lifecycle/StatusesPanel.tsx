"use client";

/**
 * Statuses panel — list system + custom statuses; add custom; block unsafe deletes.
 */
import { Plus, Trash2 } from "lucide-react";
import type { ReleaseLifecycleConfig } from "@/lib/release-lifecycle-config";
import {
  isHardBoundaryStatusKey,
  statusRemovalBlockReason,
  type StatusUsageMap,
} from "@/lib/release-lifecycle-settings-ui";
import { taBtnPrimary, taBtnSecondary, taInput } from "@/lib/styles";
import { cn } from "@/lib/utils";

export type StatusesPanelProps = {
  config: ReleaseLifecycleConfig;
  usage: StatusUsageMap;
  editing: boolean;
  newLabel: string;
  newTerminal: boolean;
  onNewLabelChange: (value: string) => void;
  onNewTerminalChange: (value: boolean) => void;
  onAdd: () => void;
  onRemove: (key: string) => void;
};

/**
 * Render the statuses list and add-custom form for lifecycle settings.
 */
export function StatusesPanel({
  config,
  usage,
  editing,
  newLabel,
  newTerminal,
  onNewLabelChange,
  onNewTerminalChange,
  onAdd,
  onRemove,
}: StatusesPanelProps) {
  const sorted = [...config.statuses].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="space-y-4" data-testid="lifecycle-statuses-panel">
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-white/10 dark:border-[var(--border)]">
        {sorted.map((status) => {
          const count = usage[status.key] ?? 0;
          const block = statusRemovalBlockReason(status, count);
          return (
            <li
              key={status.key}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              data-testid={`lifecycle-status-row-${status.key}`}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[14px] font-semibold text-slate-900 dark:text-white">
                    {status.label}
                  </span>
                  {status.isSystem ? (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-white/10 dark:text-white/70">
                      Default
                    </span>
                  ) : (
                    <span className="rounded-full bg-brand-500/10 px-2 py-0.5 text-[11px] font-semibold text-brand-700 dark:text-brand-300">
                      Custom
                    </span>
                  )}
                  {isHardBoundaryStatusKey(status.key) ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">
                      Hard boundary
                    </span>
                  ) : null}
                  {status.terminal ? (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500 dark:bg-white/10 dark:text-white/55">
                      Terminal
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 font-mono text-[11px] text-slate-400 dark:text-white/40">
                  {status.key}
                  {count > 0 ? ` · ${count} release${count === 1 ? "" : "s"} in use` : ""}
                </p>
              </div>
              {editing ? (
                <button
                  type="button"
                  className={cn(
                    taBtnSecondary,
                    "gap-1.5 px-3 py-1.5 text-[12px] text-rose-700 disabled:opacity-40 dark:text-rose-300"
                  )}
                  disabled={Boolean(block)}
                  title={block ?? "Remove status"}
                  onClick={() => onRemove(status.key)}
                  data-testid={`lifecycle-status-remove-${status.key}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Remove
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>

      {editing ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-4 dark:border-[var(--border)] dark:bg-white/[0.03]">
          <p className="mb-3 text-[13px] font-semibold text-slate-700 dark:text-white/80">
            Add custom status
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="min-w-0 flex-1 text-[12px] font-medium text-slate-600 dark:text-white/65">
              Name
              <input
                className={cn(taInput, "mt-1")}
                value={newLabel}
                maxLength={80}
                placeholder="e.g. Peer review"
                onChange={(e) => onNewLabelChange(e.target.value)}
                data-testid="lifecycle-status-new-label"
              />
            </label>
            <label className="flex items-center gap-2 pb-2.5 text-[13px] font-medium text-slate-700 dark:text-white/80">
              <input
                type="checkbox"
                checked={newTerminal}
                onChange={(e) => onNewTerminalChange(e.target.checked)}
                data-testid="lifecycle-status-new-terminal"
              />
              Terminal
            </label>
            <button
              type="button"
              className={cn(taBtnPrimary, "gap-1.5")}
              onClick={onAdd}
              data-testid="lifecycle-status-add"
            >
              <Plus className="h-4 w-4" />
              Add status
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
