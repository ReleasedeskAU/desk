"use client";

/**
 * Statuses panel — Active / Inactive lists; toggle, drag-reorder (within section), add, remove.
 */
import { useState } from "react";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import type {
  ReleaseLifecycleConfig,
  ReleaseLifecycleStatusConfig,
} from "@/lib/release-lifecycle-config";
import {
  isHardBoundaryStatusKey,
  statusRemovalBlockReason,
  type StatusUsageMap,
} from "@/lib/release-lifecycle-settings-ui";
import { LifecycleSection } from "@/components/settings/lifecycle/LifecycleSection";
import { LifecycleToggle } from "@/components/settings/lifecycle/LifecycleToggle";
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
  onToggleEnabled: (key: string, enabled: boolean) => void;
  /** Apply a new top-to-bottom key order after drag-and-drop. */
  onReorder: (orderedKeys: string[]) => void;
};

/**
 * Render Active and Inactive status lists plus add-custom form.
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
  onToggleEnabled,
  onReorder,
}: StatusesPanelProps) {
  const sorted = [...config.statuses].sort((a, b) => a.sortOrder - b.sortOrder);
  const active = sorted.filter((s) => s.enabled);
  const inactive = sorted.filter((s) => !s.enabled);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);

  const applyDrop = (targetKey: string, sectionKeys: string[]) => {
    if (!editing || !dragKey || dragKey === targetKey) {
      setDragKey(null);
      setOverKey(null);
      return;
    }
    if (!sectionKeys.includes(dragKey) || !sectionKeys.includes(targetKey)) {
      setDragKey(null);
      setOverKey(null);
      return;
    }
    const from = sectionKeys.indexOf(dragKey);
    const to = sectionKeys.indexOf(targetKey);
    if (from < 0 || to < 0) {
      setDragKey(null);
      setOverKey(null);
      return;
    }
    const nextSection = sectionKeys.slice();
    const [moved] = nextSection.splice(from, 1);
    nextSection.splice(to, 0, moved!);
    // Keep Active and Inactive as separate blocks; reorder only within the dragged section.
    const otherKeys = sorted
      .map((s) => s.key)
      .filter((key) => !sectionKeys.includes(key));
    const activeKeys = active.map((s) => s.key);
    const next =
      sectionKeys[0] != null && activeKeys.includes(sectionKeys[0]!)
        ? [...nextSection, ...otherKeys]
        : [...otherKeys, ...nextSection];
    onReorder(next);
    setDragKey(null);
    setOverKey(null);
  };

  const renderRow = (
    status: ReleaseLifecycleStatusConfig,
    sectionKeys: string[]
  ) => {
    const count = usage[status.key] ?? 0;
    const block = statusRemovalBlockReason(status, count);
    const isDragging = dragKey === status.key;
    const isOver = overKey === status.key && dragKey !== status.key;
    return (
      <li
        key={status.key}
        draggable={editing}
        onDragStart={(e) => {
          if (!editing) return;
          setDragKey(status.key);
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", status.key);
        }}
        onDragEnd={() => {
          setDragKey(null);
          setOverKey(null);
        }}
        onDragOver={(e) => {
          if (!editing || !dragKey) return;
          if (!sectionKeys.includes(dragKey)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          if (overKey !== status.key) setOverKey(status.key);
        }}
        onDragLeave={() => {
          if (overKey === status.key) setOverKey(null);
        }}
        onDrop={(e) => {
          e.preventDefault();
          applyDrop(status.key, sectionKeys);
        }}
        className={cn(
          "flex flex-wrap items-center justify-between gap-3 px-4 py-3",
          !status.enabled && "opacity-70",
          isDragging && "opacity-40",
          isOver && "bg-brand-500/8 dark:bg-brand-500/15"
        )}
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

        <div className="flex flex-wrap items-center gap-3">
          {editing ? (
            <>
              <LifecycleToggle
                checked={status.enabled}
                onCheckedChange={(enabled) => onToggleEnabled(status.key, enabled)}
                label={status.enabled ? "On" : "Off"}
                title={
                  status.enabled
                    ? "Turn off — hides from timeline and next-status choices"
                    : "Turn on — shows on timeline when transitions allow it"
                }
                aria-label={`${status.label} ${status.enabled ? "On" : "Off"}`}
                data-testid={`lifecycle-status-enabled-${status.key}`}
              />
              <button
                type="button"
                className="cursor-grab touch-none rounded-md px-1 py-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 active:cursor-grabbing dark:hover:bg-white/10 dark:hover:text-white/80"
                title="Drag to rearrange order within this section"
                aria-label={`Drag to reorder ${status.label}`}
                data-testid={`lifecycle-status-drag-${status.key}`}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <GripVertical className="h-4 w-4" aria-hidden />
              </button>
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
            </>
          ) : (
            <LifecycleToggle
              checked={status.enabled}
              onCheckedChange={() => undefined}
              label={status.enabled ? "On" : "Off"}
              disabled
              aria-label={`${status.label} ${status.enabled ? "On" : "Off"}`}
              data-testid={`lifecycle-status-enabled-${status.key}`}
            />
          )}
        </div>
      </li>
    );
  };

  return (
    <div className="space-y-4" data-testid="lifecycle-statuses-panel">
      <LifecycleSection
        title="Active"
        count={active.length}
        emptyMessage="No active statuses — turn one On below."
        testId="lifecycle-statuses-active"
      >
        <ul className="divide-y divide-slate-100 dark:divide-white/10">
          {active.map((status) => renderRow(status, active.map((s) => s.key)))}
        </ul>
      </LifecycleSection>

      <LifecycleSection
        title="Inactive"
        count={inactive.length}
        emptyMessage="No inactive statuses."
        testId="lifecycle-statuses-inactive"
      >
        <ul className="divide-y divide-slate-100 dark:divide-white/10">
          {inactive.map((status) =>
            renderRow(
              status,
              inactive.map((s) => s.key)
            )
          )}
        </ul>
      </LifecycleSection>

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
