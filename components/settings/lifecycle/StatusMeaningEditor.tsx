"use client";

/**
 * Plain-English status-role controls for Lifecycle Settings.
 * Labels come from STATUS_ROLE_FIELDS — never show the raw flag id as the title.
 * Role flags are visually distinct from the status availability toggle.
 */
import { Check } from "lucide-react";
import {
  applyStatusRolePatch,
  exclusiveRoleIds,
  statusRoleFieldsFor,
  type StatusRoleBag,
  type StatusRoleFieldDef,
  type StatusRoleId,
} from "@/lib/lifecycle-status-roles";
import { taInput } from "@/lib/styles";
import { cn } from "@/lib/utils";

export type StatusMeaningValues = Record<string, unknown>;

export type StatusMeaningEditorProps = {
  fields: readonly StatusRoleFieldDef[];
  values: StatusMeaningValues;
  editing: boolean;
  statusLabel: string;
  onToggle: (id: StatusRoleId, checked: boolean) => void;
  onDaysChange: (id: StatusRoleId, days: number | null) => void;
};

function daysDisplay(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return String(value);
  }
  return "";
}

const EXCLUSIVE_ROLE_HINT =
  "Only one status can hold this role — turning this on will turn it off elsewhere.";

/**
 * Checkbox / radio-style control for a status meaning flag (not On/Off).
 */
function RoleAssignControl({
  checked,
  exclusive,
  disabled,
  onCheckedChange,
  ariaLabel,
  testId,
}: {
  checked: boolean;
  exclusive: boolean;
  disabled: boolean;
  onCheckedChange: (next: boolean) => void;
  ariaLabel: string;
  testId: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      data-testid={testId}
      onClick={() => {
        if (disabled) return;
        onCheckedChange(!checked);
      }}
      className={cn(
        "flex shrink-0 items-center gap-2 rounded-md border px-2.5 py-1.5 text-[12px] font-semibold",
        "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40",
        "disabled:cursor-not-allowed disabled:opacity-50",
        checked
          ? "border-sky-300 bg-sky-100 text-sky-950 dark:border-sky-500/40 dark:bg-sky-500/15 dark:text-sky-100"
          : "border-slate-200 bg-white text-slate-500 dark:border-white/15 dark:bg-white/5 dark:text-white/55"
      )}
    >
      <span
        className={cn(
          "flex h-4 w-4 items-center justify-center border",
          exclusive ? "rounded-full" : "rounded-sm",
          checked
            ? "border-sky-600 bg-sky-600 text-white dark:border-sky-400 dark:bg-sky-400 dark:text-sky-950"
            : "border-slate-300 bg-white dark:border-white/30 dark:bg-transparent"
        )}
        aria-hidden
      >
        {checked ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
      </span>
      {checked ? "Assigned" : "Not assigned"}
    </button>
  );
}

/**
 * Render meaning toggles / day fields for one status.
 */
export function StatusMeaningEditor({
  fields,
  values,
  editing,
  statusLabel,
  onToggle,
  onDaysChange,
}: StatusMeaningEditorProps) {
  if (fields.length === 0) return null;

  return (
    <div
      className="mt-3 rounded-lg border border-sky-200/80 bg-sky-50/70 p-3 dark:border-sky-500/25 dark:bg-sky-500/10"
      data-testid="lifecycle-status-meaning"
    >
      <p className="text-[11px] font-bold uppercase tracking-wide text-sky-800 dark:text-sky-200">
        What this status means
      </p>
      <p
        className="mt-1 text-[12px] leading-relaxed text-slate-600 dark:text-white/65"
        data-testid="lifecycle-status-meaning-explainer"
      >
        These control what this status{" "}
        <strong className="font-semibold text-slate-800 dark:text-white/85">
          means
        </strong>{" "}
        to the system — separate from whether it&apos;s turned on above.
      </p>
      <div className="mt-3 space-y-3">
        {fields.map((field) => {
          if (field.valueKind === "days") {
            const raw = daysDisplay(values[field.id]);
            return (
              <label
                key={field.id}
                className="block text-[12px] font-medium text-slate-700 dark:text-white/80"
              >
                {field.label}
                <span className="mt-0.5 block text-[12px] font-normal leading-relaxed text-slate-500 dark:text-white/55">
                  {field.description}
                </span>
                <input
                  type="number"
                  min={1}
                  max={365}
                  inputMode="numeric"
                  disabled={!editing}
                  placeholder="Off"
                  className={cn(taInput, "mt-1 h-8 max-w-[8rem] py-1 text-[12px]")}
                  value={raw}
                  onChange={(e) => {
                    const t = e.target.value.trim();
                    if (!t) {
                      onDaysChange(field.id, null);
                      return;
                    }
                    const n = Number(t);
                    onDaysChange(
                      field.id,
                      Number.isFinite(n) && n >= 1 ? Math.floor(n) : null
                    );
                  }}
                  aria-label={`${statusLabel}: ${field.label}`}
                  data-testid={`lifecycle-role-days-${field.id}`}
                />
              </label>
            );
          }

          const checked = values[field.id] === true;
          const exclusive = field.uniqueness === "one";
          return (
            <div key={field.id} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-slate-800 dark:text-white/85">
                  {field.label}
                  {exclusive ? (
                    <span className="ml-1.5 text-[11px] font-normal text-sky-700 dark:text-sky-300">
                      (only one status)
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-slate-500 dark:text-white/55">
                  {field.description}
                </p>
                {exclusive ? (
                  <p className="mt-1 text-[11px] leading-relaxed text-sky-800 dark:text-sky-200">
                    {EXCLUSIVE_ROLE_HINT}
                  </p>
                ) : null}
              </div>
              <RoleAssignControl
                checked={checked}
                exclusive={exclusive}
                disabled={!editing}
                onCheckedChange={(next) => onToggle(field.id, next)}
                ariaLabel={`${statusLabel}: ${field.label}`}
                testId={`lifecycle-role-toggle-${field.id}`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export type StatusMeaningControlsProps<T extends StatusRoleBag> = {
  roleIds: readonly StatusRoleId[];
  statuses: T[];
  statusKey: string;
  editing: boolean;
  onStatusesChange: (next: T[]) => void;
};

/**
 * Bind meaning controls to a status list (exclusive flags clear siblings).
 */
export function StatusMeaningControls<T extends StatusRoleBag>({
  roleIds,
  statuses,
  statusKey,
  editing,
  onStatusesChange,
}: StatusMeaningControlsProps<T>) {
  const status = statuses.find((s) => s.key === statusKey);
  if (!status) return null;
  const exclusive = exclusiveRoleIds(roleIds);
  const label =
    typeof status.label === "string" && status.label.trim()
      ? status.label
      : statusKey;
  return (
    <StatusMeaningEditor
      fields={statusRoleFieldsFor(roleIds)}
      values={status}
      editing={editing}
      statusLabel={label}
      onToggle={(id, checked) =>
        onStatusesChange(
          applyStatusRolePatch(
            statuses,
            statusKey,
            { [id]: checked } as Partial<T>,
            exclusive
          )
        )
      }
      onDaysChange={(id, days) =>
        onStatusesChange(
          statuses.map((s) =>
            s.key === statusKey ? ({ ...s, [id]: days } as T) : s
          )
        )
      }
    />
  );
}
