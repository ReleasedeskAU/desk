/**
 * Full-screen overlay for Flexible lifecycle exception confirm.
 * Keeps the reason field above edit modals (z-50) so 422 NEEDS_OVERRIDE
 * never looks like a silent save failure.
 */
"use client";

import type { ReactNode } from "react";

type LifecycleExceptionModalProps = {
  open: boolean;
  children: ReactNode;
  /** Backdrop click (usually cancel). */
  onDismiss?: () => void;
};

/**
 * Centers lifecycle exception UI above page chrome and edit modals.
 *
 * @param open - When false, renders nothing
 * @param children - Typically {@link LifecycleExceptionConfirm}
 * @param onDismiss - Optional backdrop handler
 */
export function LifecycleExceptionModal({
  open,
  children,
  onDismiss,
}: LifecycleExceptionModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
      onClick={onDismiss}
      role="presentation"
    >
      <div
        className="w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Status change confirmation"
      >
        {children}
      </div>
    </div>
  );
}
