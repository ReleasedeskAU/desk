"use client";

import { useEffect, useMemo, useState } from "react";
import { ClipboardList } from "lucide-react";
import { AnalyseRiskSection } from "./AnalyseRiskSection";
import type { MappingNote } from "./types";

const NOTE_COUNT = 6;

/** Persistent release-manager notes and real booking-conflict analysis sidebar. */
export function ReleaseManagerSidebar() {
  const [notes, setNotes] = useState<MappingNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/system-mapping/notes", { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error ?? "Unable to load release manager notes.");
        setNotes(Array.isArray(data.items) ? data.items : []);
      })
      .catch((loadError) => {
        if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : "Unable to load release manager notes.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const noteSlots = useMemo(() => {
    const sorted = [...notes].sort((a, b) => a.sourceOrder - b.sourceOrder).slice(0, NOTE_COUNT);
    return Array.from({ length: NOTE_COUNT }, (_, index) => sorted[index] ?? null);
  }, [notes]);

  return (
    <aside className="order-first min-w-0 lg:order-last lg:sticky lg:top-4 lg:self-start" aria-label="Release manager tools">
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-[var(--border)] dark:bg-[var(--card)]">
        <header className="flex items-center gap-2 border-b border-gray-200 px-4 py-3 dark:border-[var(--border)]">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
            <ClipboardList className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">Release Manager Notes</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">Six persisted coordination reminders</p>
          </div>
        </header>
        <div className="p-4">
          {error && <p role="alert" className="mb-2 text-sm text-error-700 dark:text-error-300">{error}</p>}
          <ol className="space-y-2" aria-busy={loading}>
            {noteSlots.map((note, index) => (
              <li key={note?.id ?? `empty-${index}`} className="flex gap-2 rounded-lg bg-gray-50 p-2.5 text-sm leading-relaxed text-gray-700 dark:bg-white/5 dark:text-gray-200">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[11px] font-bold text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">{index + 1}</span>
                <span className={loading ? "animate-pulse text-gray-400" : ""}>
                  {loading ? "Loading persisted note…" : note?.content || "No persisted note is configured for this position."}
                </span>
              </li>
            ))}
          </ol>
          <div className="my-4 border-t border-gray-200 dark:border-[var(--border)]" />
          <h3 className="mb-2 text-sm font-bold text-gray-900 dark:text-white">Booking conflicts</h3>
          <p className="mb-3 text-xs leading-relaxed text-gray-500 dark:text-gray-400">Check real environment bookings across a date range.</p>
          <AnalyseRiskSection compact />
        </div>
      </div>
    </aside>
  );
}
