"use client";

import { ArrowRight, Loader2 } from "lucide-react";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { cn } from "@/lib/utils";
import { visibleActions, type DetailAction } from "@/lib/detail-decision";

const PRIMARY_CLASS =
  "inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-[13px] font-semibold text-white shadow-sm shadow-indigo-200 transition-all hover:bg-indigo-700 hover:shadow-md active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 dark:shadow-indigo-900/40";

const SECONDARY_CLASS =
  "inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-[13px] font-semibold text-slate-600 transition-colors hover:border-indigo-300 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-60 dark:border-[var(--border)] dark:bg-white/5 dark:text-white/70 dark:hover:text-white";

type DetailPrimaryActionProps = {
  /** The single most useful next step. Null when nothing is recommended. */
  primary?: DetailAction | null;
  /** Supporting actions; kept visually quieter than the primary. */
  secondary?: DetailAction[];
  /**
   * Whether this session may mutate the record. Write actions are hidden when
   * false — an affordance only, since the API route performs the real check.
   */
  canEdit: boolean;
  /** Copy shown when no action is available to this user. */
  emptyLabel?: string;
  className?: string;
};

/**
 * Next-action control for the DECIDE zone: one primary step plus quieter
 * alternatives, so the first viewport says what to do, not just what is wrong.
 *
 * @param props - Primary/secondary actions and the session's edit permission.
 * @returns Action row, or a muted note when nothing is actionable.
 */
export function DetailPrimaryAction({
  primary,
  secondary = [],
  canEdit,
  emptyLabel = "No action required right now",
  className,
}: DetailPrimaryActionProps) {
  const [allowedPrimary] = primary ? visibleActions([primary], canEdit) : [];
  const allowedSecondary = visibleActions(secondary, canEdit);

  if (!allowedPrimary && allowedSecondary.length === 0) {
    return (
      <p className={cn("text-[12.5px] font-medium text-slate-400 dark:text-white/45", className)}>
        {emptyLabel}
      </p>
    );
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {allowedPrimary ? <ActionControl action={allowedPrimary} variant="primary" /> : null}
      {allowedSecondary.map((action) => (
        <ActionControl key={action.id} action={action} variant="secondary" />
      ))}
    </div>
  );
}

function ActionControl({
  action,
  variant,
}: {
  action: DetailAction;
  variant: "primary" | "secondary";
}) {
  const className = variant === "primary" ? PRIMARY_CLASS : SECONDARY_CLASS;
  const body = (
    <>
      {action.pending ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : null}
      {action.label}
      {action.href ? <ArrowRight className="h-3.5 w-3.5" aria-hidden /> : null}
    </>
  );

  if (action.href) {
    // In-page anchors must stay plain <a> so hash navigation expands the target
    // section; route changes go through ProgressLink for the loading indicator.
    return action.href.startsWith("#") ? (
      <a href={action.href} title={action.hint} className={className}>
        {body}
      </a>
    ) : (
      <ProgressLink href={action.href} title={action.hint} className={className}>
        {body}
      </ProgressLink>
    );
  }

  return (
    <button
      type="button"
      onClick={action.onClick}
      disabled={action.disabled || action.pending}
      title={action.hint}
      className={className}
    >
      {body}
    </button>
  );
}
