"use client";

/**
 * Option A / Option B prompt when a detector finds a real conflict.
 */
import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { taBtnPrimary, taBtnSecondary, taInput } from "@/lib/styles";
import { cn } from "@/lib/utils";
import type { ConflictFinding } from "@/lib/conflict-finding-types";

export type ConflictChoiceDialogProps = {
  findings: ConflictFinding[];
  busy?: boolean;
  highlightHint: string;
  onModify: () => void;
  onRaise: (notes: string) => void;
};

/** Show what/when/which-release and let the user modify or raise for RM review. */
export function ConflictChoiceDialog({
  findings,
  busy,
  highlightHint,
  onModify,
  onRaise,
}: ConflictChoiceDialogProps) {
  const [notes, setNotes] = useState("");

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-theme-lg max-h-[90vh] overflow-y-auto dark:bg-[var(--card)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="conflict-choice-title"
      >
        <div className="mb-4 flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-amber-600 dark:text-amber-400" />
          <div>
            <h2
              id="conflict-choice-title"
              className="text-lg font-semibold text-amber-900 dark:text-amber-200"
            >
              Conflict detected
            </h2>
            <p className="mt-1 text-sm text-gray-700 dark:text-white/70">
              This overlaps another booking, a maintenance window, or a freeze
              period. Choose whether to change your dates or raise it for the
              Release Manager.
            </p>
          </div>
        </div>

        <ul className="space-y-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
          {findings.map((finding, index) => (
            <li key={`${finding.typeKey}:${finding.release2Code}:${index}`}>
              <strong>{finding.summary}</strong>
              {finding.conflictPeriod ? ` · ${finding.conflictPeriod}` : ""}
              {finding.release2Code ? ` · ${finding.release2Code}` : ""}
            </li>
          ))}
        </ul>

        <label className="mt-4 block text-[12px] font-semibold text-slate-600 dark:text-white/60">
          Notes for the Release Manager (optional)
          <textarea
            className={cn(taInput, "mt-1 min-h-[72px]")}
            value={notes}
            maxLength={2000}
            disabled={busy}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Anything the RM should know…"
          />
        </label>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className={taBtnSecondary}
            disabled={busy}
            onClick={onModify}
          >
            Change my dates
          </button>
          <button
            type="button"
            className={cn(taBtnPrimary, busy && "opacity-70")}
            disabled={busy}
            onClick={() => onRaise(notes.trim())}
          >
            {busy ? "Raising…" : "Raise for RM review"}
          </button>
        </div>
        <p className="mt-3 text-[11px] text-slate-500 dark:text-white/45">
          {highlightHint}
        </p>
      </div>
    </div>
  );
}
