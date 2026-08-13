"use client";

/**
 * Visible Settings warning when an exclusive status role is missing or clashes.
 * Automation that needs the role fails loudly — this is where operators fix it.
 */
import {
  automationRoleIssues,
  type StatusRoleBag,
  type StatusRoleId,
} from "@/lib/lifecycle-status-roles";

export type ExclusiveRoleWarningProps = {
  statuses: readonly StatusRoleBag[];
  roleIds: readonly StatusRoleId[];
};

/**
 * Amber banner listing exclusive-role problems in plain English.
 */
export function ExclusiveRoleWarning({
  statuses,
  roleIds,
}: ExclusiveRoleWarningProps) {
  const issues = automationRoleIssues(statuses, roleIds);
  if (issues.length === 0) return null;
  return (
    <div
      className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
      data-testid="lifecycle-exclusive-role-warning"
      role="alert"
    >
      <p className="font-semibold">Automation can’t run until this is fixed</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-4">
        {issues.map((issue) => (
          <li key={issue.roleId}>{issue.message}</li>
        ))}
      </ul>
    </div>
  );
}
