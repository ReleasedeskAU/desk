"use client";

/**
 * Field Locks matrix — plain-language controls for when Release fields can be edited.
 */
import { useMemo } from "react";
import { CircleHelp, Lock, Pencil, RotateCcw } from "lucide-react";
import type { FieldLockState } from "@/lib/release-field-lock-catalog";
import { cn } from "@/lib/utils";

export type FieldLockStatusCol = {
  key: string;
  label: string;
  sortOrder: number;
};

export type FieldLockMatrixRow = {
  fieldKey: string;
  label: string;
  category: string;
  lockRuleRef: string | null;
  isConfigurable: boolean;
  infoOnly?: boolean;
  unavailable?: boolean;
  statusRules: Record<string, FieldLockState>;
};

export type FieldLocksPanelProps = {
  statuses: FieldLockStatusCol[];
  rows: FieldLockMatrixRow[];
  gapRows: FieldLockMatrixRow[];
  orphanStatusKeys: string[];
  editing: boolean;
  onCellChange: (
    fieldKey: string,
    statusKey: string,
    state: FieldLockState
  ) => void;
};

/** User-facing labels — keep short for the grid, explain fully in the legend. */
const STATE_OPTIONS: {
  value: FieldLockState;
  label: string;
  shortHint: string;
}[] = [
  {
    value: "editable",
    label: "Can edit",
    shortHint: "People can change this field while the release is in this status.",
  },
  {
    value: "locked",
    label: "Locked",
    shortHint: "People cannot change this field in this status. Save is blocked if they try.",
  },
  {
    value: "editable_with_side_effect",
    label: "Can edit → back to Pending CAB",
    shortHint:
      "People can change it, but the release is moved back to Pending CAB (used for Size/Priority after CAB approval).",
  },
];

const CATEGORY_BLURB: Record<string, string> = {
  Identity: "Who / what this release is",
  Ownership: "Who owns the release",
  Scope: "Size, priority, and impact",
  Schedule: "Dates and CAB timing",
  "Sign-Off": "Checklist sign-offs",
  Deployment: "Deploy readiness and environments",
  Documentation: "Notes and plans",
  Computed: "Calculated by the system — always locked",
  Audit: "System timestamps — always locked",
  Workflow: "Status is controlled by Transitions, not this grid",
  Unavailable: "Listed in the rules spreadsheet but not built in the app yet",
};

/**
 * Render the field-lock matrix grouped by category, with a plain-language legend.
 */
export function FieldLocksPanel({
  statuses,
  rows,
  gapRows,
  orphanStatusKeys,
  editing,
  onCellChange,
}: FieldLocksPanelProps) {
  const groups = useMemo(() => {
    const map = new Map<string, FieldLockMatrixRow[]>();
    for (const row of [...rows, ...gapRows]) {
      const list = map.get(row.category) ?? [];
      list.push(row);
      map.set(row.category, list);
    }
    return [...map.entries()];
  }, [rows, gapRows]);

  if (statuses.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-[13px] text-slate-500 dark:border-[var(--border)] dark:text-white/45">
        Turn on at least one status under the Statuses tab first. This grid needs
        those status names as columns.
      </p>
    );
  }

  return (
    <div className="space-y-4" data-testid="lifecycle-field-locks-panel">
      <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-[var(--border)] dark:bg-white/[0.03]">
        <p className="text-[14px] font-semibold text-slate-900 dark:text-white">
          How to read this table
        </p>
        <p className="mt-1 text-[13px] leading-relaxed text-slate-600 dark:text-white/65">
          Each <span className="font-semibold">row</span> is a field on a release.
          Each <span className="font-semibold">column</span> is a status (Draft,
          Planning, …). Pick what should happen when someone tries to change that
          field while the release is in that status.
        </p>
        {!editing ? (
          <p className="mt-2 text-[12.5px] font-medium text-slate-500 dark:text-white/50">
            Click <span className="font-semibold text-slate-700 dark:text-white/80">Edit</span> above
            to change cells, then <span className="font-semibold text-slate-700 dark:text-white/80">Save</span>.
          </p>
        ) : (
          <p className="mt-2 text-[12.5px] font-medium text-brand-700 dark:text-brand-300">
            Editing — change any dropdown, then Save. Changes apply the next time someone
            edits a release.
          </p>
        )}
      </div>

      <ul className="grid gap-2 sm:grid-cols-3">
        {STATE_OPTIONS.map((opt) => (
          <li
            key={opt.value}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-[var(--border)] dark:bg-[var(--card)]"
          >
            <div className="flex items-center gap-1.5 text-[12px] font-bold text-slate-900 dark:text-white">
              {opt.value === "editable" ? (
                <Pencil className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
              ) : opt.value === "locked" ? (
                <Lock className="h-3.5 w-3.5 text-slate-500" aria-hidden />
              ) : (
                <RotateCcw className="h-3.5 w-3.5 text-amber-600" aria-hidden />
              )}
              {opt.label}
            </div>
            <p className="mt-1 text-[11.5px] leading-snug text-slate-500 dark:text-white/55">
              {opt.shortHint}
            </p>
          </li>
        ))}
      </ul>

      {orphanStatusKeys.length > 0 ? (
        <div
          className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
          data-testid="lifecycle-field-locks-orphan-warning"
        >
          <p className="font-semibold">Some old status names need a cleanup</p>
          <p className="mt-0.5 text-[12.5px] leading-relaxed">
            These rules still mention statuses that are no longer in your Statuses
            list: <span className="font-medium">{orphanStatusKeys.join(", ")}</span>.
            Until you set a choice for the new status columns, those fields stay{" "}
            <span className="font-semibold">Locked</span> (safer default).
          </p>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-[var(--border)]">
        <table className="min-w-full border-collapse text-left text-[12px]">
          <thead>
            <tr className="bg-slate-50 dark:bg-white/[0.04]">
              <th className="sticky left-0 z-10 min-w-[200px] bg-slate-50 px-3 py-2.5 font-semibold text-slate-700 dark:bg-[var(--card)] dark:text-white/80">
                Field on the release
              </th>
              {statuses.map((s) => (
                <th
                  key={s.key}
                  className="min-w-[140px] px-2 py-2.5 font-semibold text-slate-600 dark:text-white/70"
                  title={`When the release status is “${s.label}”`}
                >
                  <span className="block text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-white/40">
                    When status is
                  </span>
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map(([category, groupRows]) => (
              <CategoryBlock
                key={category}
                category={category}
                rows={groupRows}
                statuses={statuses}
                editing={editing}
                onCellChange={onCellChange}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CategoryBlock({
  category,
  rows,
  statuses,
  editing,
  onCellChange,
}: {
  category: string;
  rows: FieldLockMatrixRow[];
  statuses: FieldLockStatusCol[];
  editing: boolean;
  onCellChange: FieldLocksPanelProps["onCellChange"];
}) {
  const blurb = CATEGORY_BLURB[category];
  return (
    <>
      <tr className="bg-slate-100/80 dark:bg-white/[0.06]">
        <td
          colSpan={statuses.length + 1}
          className="px-3 py-2 text-[12px] text-slate-600 dark:text-white/60"
        >
          <span className="font-bold uppercase tracking-wide text-slate-500 dark:text-white/50">
            {category === "Unavailable" ? "Coming later" : category}
          </span>
          {blurb ? (
            <span className="mt-0.5 block text-[11.5px] font-normal normal-case tracking-normal text-slate-500 dark:text-white/45">
              {blurb}
            </span>
          ) : null}
        </td>
      </tr>
      {rows.map((row) => (
        <tr
          key={row.fieldKey}
          className="border-t border-slate-100 dark:border-white/10"
          data-testid={`field-lock-row-${row.fieldKey}`}
        >
          <td className="sticky left-0 z-10 bg-white px-3 py-2.5 dark:bg-[var(--card)]">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-semibold text-slate-900 dark:text-white">
                {row.label}
              </span>
              {row.lockRuleRef ? (
                <span
                  title={`Rule reference: ${row.lockRuleRef}`}
                  className="text-slate-400"
                >
                  <CircleHelp className="h-3.5 w-3.5" aria-hidden />
                  <span className="sr-only">Rule {row.lockRuleRef}</span>
                </span>
              ) : null}
            </div>
            {row.infoOnly ? (
              <p className="mt-1 text-[11px] leading-snug text-slate-500 dark:text-white/50">
                Change status on the release using allowed Transitions — not from this grid.
              </p>
            ) : null}
            {row.unavailable ? (
              <p className="mt-1 text-[11px] leading-snug text-amber-800/90 dark:text-amber-100/80">
                In the rules spreadsheet, but not a field in the app yet. No setting to change.
              </p>
            ) : null}
            {!row.isConfigurable && !row.infoOnly && !row.unavailable ? (
              <p className="mt-1 text-[11px] leading-snug text-slate-500 dark:text-white/50">
                Always locked — the system sets this; you cannot open it for editing.
              </p>
            ) : null}
          </td>
          {statuses.map((s) => {
            const disabled =
              !editing ||
              !row.isConfigurable ||
              row.infoOnly ||
              row.unavailable;
            const value: FieldLockState = row.statusRules[s.key] ?? "locked";
            const opt = STATE_OPTIONS.find((o) => o.value === value);
            return (
              <td key={s.key} className="px-2 py-1.5 align-middle">
                {disabled ? (
                  <span
                    className={cn(
                      "inline-flex max-w-full items-center rounded-md px-2 py-1 text-[11px] font-medium leading-snug",
                      row.unavailable
                        ? "bg-slate-50 text-slate-400 dark:bg-white/[0.04] dark:text-white/35"
                        : value === "editable"
                          ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200"
                          : value === "editable_with_side_effect"
                            ? "bg-amber-50 text-amber-900 dark:bg-amber-500/15 dark:text-amber-100"
                            : "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-white/55"
                    )}
                    title={
                      row.unavailable
                        ? "Not in the app yet"
                        : opt?.shortHint
                    }
                  >
                    {row.unavailable ? "—" : opt?.label ?? "Locked"}
                  </span>
                ) : (
                  <select
                    className="w-full rounded-md border border-slate-200 bg-white px-1.5 py-1.5 text-[11px] dark:border-[var(--border)] dark:bg-[var(--card)] dark:text-white"
                    value={value}
                    onChange={(e) =>
                      onCellChange(
                        row.fieldKey,
                        s.key,
                        e.target.value as FieldLockState
                      )
                    }
                    aria-label={`${row.label} when status is ${s.label}`}
                    title={opt?.shortHint}
                    data-testid={`field-lock-cell-${row.fieldKey}-${s.key}`}
                  >
                    {STATE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                )}
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
