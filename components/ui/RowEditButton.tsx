import { Pencil } from "lucide-react";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { cn } from "@/lib/utils";
import { controlLoc, locatorToken } from "@/lib/ui-control-locators";

const editButtonClass =
  "inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-semibold text-gray-700 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 dark:border-[var(--border)] dark:text-gray-200 dark:hover:bg-brand-500/10 dark:hover:text-brand-300";

type RowEditButtonProps = {
  /** Visible record code used in the accessible name. */
  recordLabel: string;
  disabled?: boolean;
  /** Entity key for unique row locators (`release`, `signoff`, …). */
  entity?: string;
} & (
  | { href: string; onClick?: never }
  | { href?: never; onClick: () => void }
);

/**
 * Visible Edit control for a table row or detail header.
 *
 * @param recordLabel - Record code included in the accessible name.
 * @param disabled - When true, the control is inert.
 * @param href - Existing edit surface to open (list → detail).
 * @param onClick - Existing edit modal / focus handler.
 */
export function RowEditButton({ recordLabel, disabled, entity = "row", href, onClick }: RowEditButtonProps) {
  const label = `Edit ${recordLabel}`;
  const loc = controlLoc(locatorToken(entity, "row_edit", recordLabel));
  if (href) {
    return (
      <ProgressLink href={href} aria-label={label} className={cn(editButtonClass, disabled && "pointer-events-none opacity-40")} {...loc}>
        <Pencil className="h-3.5 w-3.5" aria-hidden />
        Edit
      </ProgressLink>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(editButtonClass, "disabled:cursor-not-allowed disabled:opacity-40")}
      {...loc}
    >
      <Pencil className="h-3.5 w-3.5" aria-hidden />
      Edit
    </button>
  );
}
