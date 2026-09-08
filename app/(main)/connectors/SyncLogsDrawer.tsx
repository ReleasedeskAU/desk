"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import type { ConnectorTableRow } from "@/lib/staffless/map-indexing-status";
import {
  indexAttemptStatusLabel,
  lastResultLabel,
  shouldPollSyncLogs,
  SYNC_LOGS_POLL_MS,
  type SyncLogsView,
} from "@/lib/staffless/map-sync-logs";

async function readError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  return body.error ?? body.message ?? `Request failed (${res.status})`;
}

function relativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function formatCount(value: number | null): string {
  return value == null ? "—" : String(value);
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-[15px] font-semibold text-[#111827] mt-0.5">{value}</p>
      {hint ? <p className="text-xs text-gray-500 mt-0.5">{hint}</p> : null}
    </div>
  );
}

/**
 * Live StaffLess index runs for one connector. Polls while a sync is queued or running.
 */
export function SyncLogsDrawer({
  connector,
  onClose,
  onUpdated,
  onSyncFromBeginning,
  onPrune,
}: {
  connector: ConnectorTableRow;
  onClose: () => void;
  onUpdated?: (row: ConnectorTableRow) => void;
  onSyncFromBeginning: () => void;
  onPrune: () => Promise<void>;
}) {
  const [view, setView] = useState<SyncLogsView | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const onUpdatedRef = useRef(onUpdated);
  onUpdatedRef.current = onUpdated;

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const pollingRef = { current: false };

    const load = async (quiet: boolean) => {
      if (!quiet) setLoading(true);
      try {
        const res = await fetch(`/api/connectors/${connector.id}/logs`);
        if (!res.ok) throw new Error(await readError(res));
        const body = (await res.json()) as SyncLogsView;
        if (cancelled) return;
        setView(body);
        setLoadError(null);
        onUpdatedRef.current?.(body.connector);
        pollingRef.current = shouldPollSyncLogs(body.summary);
        if (pollingRef.current) {
          timer = setTimeout(() => void load(true), SYNC_LOGS_POLL_MS);
        }
      } catch (e) {
        if (cancelled) return;
        setLoadError(e instanceof Error ? e.message : "Could not load sync logs");
        if (pollingRef.current) {
          timer = setTimeout(() => void load(true), SYNC_LOGS_POLL_MS);
        }
      } finally {
        if (!cancelled && !quiet) setLoading(false);
      }
    };

    void load(false);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [connector.id]);

  const summary = view?.summary;
  const attempts = view?.attempts ?? [];
  const errors = view?.errors ?? [];
  const polling = summary != null && shouldPollSyncLogs(summary);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
      <div className="w-full max-w-lg bg-white h-full shadow-xl flex flex-col">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h3 className="font-bold text-lg">Sync logs — {connector.name}</h3>
          <button type="button" onClick={onClose} aria-label="Close sync logs">
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-5 space-y-6">
          {polling && (
            <p className="flex items-center gap-2 text-sm text-[#2548C9] font-medium">
              <Loader2 className="h-4 w-4 animate-spin" />
              Sync in progress — numbers update every 5 seconds.
            </p>
          )}
          {summary && (
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Indexed" value={String(summary.docsIndexed)} hint="Searchable documents" />
              <Stat
                label="This run"
                value={formatCount(summary.latestAttemptDocsIndexed)}
                hint={summary.newDocsIndexed != null ? `${summary.newDocsIndexed} new` : "Latest index attempt"}
              />
              <Stat
                label="Last sync"
                value={
                  summary.lastSyncAt
                    ? `${lastResultLabel(summary.lastResult)} · ${relativeTime(summary.lastSyncAt)}`
                    : lastResultLabel(summary.lastResult)
                }
              />
              <Stat
                label="Errors"
                value={String(summary.errorCount)}
                hint={summary.lastError ?? "Unresolved index errors"}
              />
            </div>
          )}
          <p className="text-xs text-gray-500">
            StaffLess does not report how many items were found at the source versus fetched. Indexed is what is
            searchable; This run is the latest index attempt.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || !connector.enabled || connector.status === "DELETING"}
              onClick={() => {
                if (
                  !confirm(
                    "Re-index from the beginning? StaffLess will queue a full run for this connector. This does not delete source data."
                  )
                ) {
                  return;
                }
                onSyncFromBeginning();
              }}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold hover:bg-gray-50 disabled:opacity-40"
            >
              Re-index from beginning
            </button>
            <button
              type="button"
              disabled={busy || connector.status === "DELETING"}
              onClick={async () => {
                if (
                  !confirm(
                    "Prune this connector? StaffLess will remove indexed documents that no longer exist in the source."
                  )
                ) {
                  return;
                }
                setBusy(true);
                try {
                  await onPrune();
                } catch (e) {
                  setLoadError(e instanceof Error ? e.message : "Prune failed");
                } finally {
                  setBusy(false);
                }
              }}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold hover:bg-gray-50 disabled:opacity-40"
            >
              Prune stale docs
            </button>
          </div>
          {loadError && <p className="text-sm text-red-700">{loadError}</p>}
          {loading ? (
            <p className="text-gray-500 text-sm">Loading index attempts…</p>
          ) : (
            <>
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Index attempts</h4>
                {attempts.length === 0 ? (
                  <p className="text-gray-500 text-sm">No index attempts yet. Use Sync Now to queue the first run.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase text-gray-500 border-b">
                        <th className="pb-2">Started</th>
                        <th className="pb-2">Status</th>
                        <th className="pb-2">Indexed</th>
                        <th className="pb-2">Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attempts.map((attempt) => (
                        <tr key={attempt.id} className="hover:bg-gray-50/50">
                          <td className="border-b border-gray-200 py-2 pr-2">
                            {attempt.timeStarted ? new Date(attempt.timeStarted).toLocaleString() : "—"}
                          </td>
                          <td className="border-b border-gray-200 py-2 pr-2">
                            {indexAttemptStatusLabel(attempt.status)}
                          </td>
                          <td className="border-b border-gray-200 py-2 pr-2">{attempt.totalDocsIndexed}</td>
                          <td className="border-b border-gray-200 py-2 text-red-600 text-xs">{attempt.errorMsg ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Open errors</h4>
                {errors.length === 0 ? (
                  <p className="text-gray-500 text-sm">No unresolved index errors.</p>
                ) : (
                  <ul className="space-y-2">
                    {errors.map((item) => (
                      <li key={item.id} className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-900">
                        {item.documentId ? <span className="font-semibold">{item.documentId}: </span> : null}
                        {item.failureMessage}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
