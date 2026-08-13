"use client";

/**
 * Plain-English status-role controls for Lifecycle Settings.
 * Labels come from STATUS_ROLE_FIELDS — never show the raw flag id as the title.
 */
import {
  applyStatusRolePatch,
  exclusiveRoleIds,
  statusRoleFieldsFor,
  type StatusRoleBag,
  type StatusRoleFieldDef,
  type StatusRoleId,
} from "@/lib/lifecycle-status-roles";
import { LifecycleToggle } from "@/components/settings/lifecycle/LifecycleToggle";
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
      className="mt-3 space-y-3 border-t border-slate-100 pt-3 dark:border-white/10"
      data-testid="lifecycle-status-meaning"
    >
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:text-white/40">
        What this status does
      </p>
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
                  onDaysChange(field.id, Number.isFinite(n) && n >= 1 ? Math.floor(n) : null);
                }}
                aria-label={`${statusLabel}: ${field.label}`}
                data-testid={`lifecycle-role-days-${field.id}`}
              />
            </label>
          );
        }

        const checked = values[field.id] === true;
        return (
          <div key={field.id} className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-slate-800 dark:text-white/85">
                {field.label}
                {field.uniqueness === "one" ? (
                  <span className="ml-1.5 text-[11px] font-normal text-slate-400">
                    (pick one status)
                  </span>
                ) : null}
              </p>
              <p className="mt-0.5 text-[12px] leading-relaxed text-slate-500 dark:text-white/55">
                {field.description}
              </p>
            </div>
            <LifecycleToggle
              checked={checked}
              disabled={!editing}
              label={checked ? "On" : "Off"}
              onCheckedChange={(next) => onToggle(field.id, next)}
              aria-label={`${statusLabel}: ${field.label}`}
              data-testid={`lifecycle-role-toggle-${field.id}`}
            />
          </div>
        );
      })}
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
