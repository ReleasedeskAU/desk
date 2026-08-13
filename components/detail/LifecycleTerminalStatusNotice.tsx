"use client";

import { Ban } from "lucide-react";
import {
  lifecycleTerminalEditNoticeText,
  type LifecycleTerminalEditNoun,
} from "@/lib/lifecycle-terminal-edit-notice";
import { cn } from "@/lib/utils";

type LifecycleTerminalStatusNoticeProps = {
  /** Current status or decision label shown in the notice. */
  statusLabel: string;
  /** "status" for releases/blockers/incidents; "decision" for approvals. */
  noun?: LifecycleTerminalEditNoun;
  className?: string;
};

/**
 * Inline Edit notice when the dropdown has no next steps (terminal lifecycle state).
 *
 * @param props.statusLabel - Final status/decision label.
 * @param props.noun - Wording for status vs decision.
 * @param props.className - Optional layout classes.
 * @returns Accessible info callout; null when label is blank.
 */
export function LifecycleTerminalStatusNotice({
  statusLabel,
  noun = "status",
  className,
}: LifecycleTerminalStatusNoticeProps) {
  const text = lifecycleTerminalEditNoticeText(statusLabel, noun);
  if (!text) return null;

  return (
    <div
      role="status"
      className={cn(
        "mt-1.5 flex gap-2 rounded-lg border border-slate-200/90 bg-slate-50/90 px-2.5 py-2 text-[11.5px] leading-snug text-slate-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/65",
        className
      )}
    >
      <Ban
        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-white/40"
        strokeWidth={2}
        aria-hidden
      />
      <p>{text}</p>
    </div>
  );
}
