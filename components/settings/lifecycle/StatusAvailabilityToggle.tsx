"use client";

/**
 * Status-enabled control for Lifecycle → Statuses.
 * Visually distinct from role-flag controls in StatusMeaningEditor.
 */
import { LifecycleToggle } from "@/components/settings/lifecycle/LifecycleToggle";

export type StatusAvailabilityToggleProps = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  statusLabel: string;
  disabled?: boolean;
  "data-testid"?: string;
};

/**
 * Toggle whether a status exists in the workflow (not what the status means).
 */
export function StatusAvailabilityToggle({
  checked,
  onCheckedChange,
  statusLabel,
  disabled = false,
  "data-testid": testId,
}: StatusAvailabilityToggleProps) {
  return (
    <div
      className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 dark:border-white/15 dark:bg-white/5"
      data-testid="lifecycle-status-availability"
      onClick={(e) => e.stopPropagation()}
    >
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-white/40">
        In the workflow
      </p>
      <p className="mb-1.5 mt-0.5 text-[11px] leading-snug text-slate-500 dark:text-white/50">
        Show or hide this status. Separate from the meaning flags below.
      </p>
      <LifecycleToggle
        checked={checked}
        disabled={disabled}
        label={checked ? "Available" : "Hidden"}
        onCheckedChange={onCheckedChange}
        title={
          checked
            ? "Turn off — hides this status from timelines and next-step choices"
            : "Turn on — this status can appear when transitions allow it"
        }
        aria-label={`${statusLabel}: ${checked ? "available" : "hidden"} in the workflow`}
        data-testid={testId}
      />
    </div>
  );
}
