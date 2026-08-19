"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Ticket } from "lucide-react";
import { AdvancedCard } from "@/components/ui/advanced-card";
import { EmptyHint } from "@/components/detail/editable";
import { StatusBadge } from "@/components/badges/StatusBadge";
import { formatDateTime } from "@/lib/utils";
import type { WorkItemSummary } from "@/lib/dependency-impact";
import { loadJsonEffect } from "@/lib/safe-fetch";

type WorkItem = {
  externalId: string;
  title: string;
  itemType: string;
  status: string;
  source: string;
  priority: string | null;
  assignee: string | null;
  blockedBy: string | null;
};

type Props = {
  releaseId: string;
  /** Skip outer card when already inside a DetailSection. */
  embedded?: boolean;
};

export function DbLinkedWorkItems({ releaseId, embedded = false }: Props) {
  const [items, setItems] = useState<WorkItem[]>([]);
  const [summary, setSummary] = useState<WorkItemSummary | null>(null);
  const [lastSynced, setLastSynced] = useState<string | null>(null);

  useEffect(() => {
    return loadJsonEffect<{ items?: WorkItem[]; summary?: WorkItemSummary; lastSynced?: string }>(
      `/api/releases/${releaseId}/work-items`,
      (d) => {
        setItems(d.items ?? []);
        setSummary(d.summary ?? null);
        setLastSynced(d.lastSynced ?? null);
      },
      { label: "release-work-items" },
    );
  }, [releaseId]);

  const body = (
    <>
      {embedded && lastSynced ? (
        <p className="mb-2 text-[11px] text-gray-500 dark:text-white/50">
          Read-only from Jira · synced {formatDateTime(lastSynced)}
        </p>
      ) : null}
      {summary && summary.total > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          <Stat label="Total" value={summary.total} />
          <Stat label="Open" value={summary.open} />
          <Stat label="Done" value={summary.done} />
          {summary.blocked > 0 && <Stat label="Blocked" value={summary.blocked} warn />}
        </div>
      )}

      {items.length === 0 ? (
        <EmptyHint>No linked Jira work items for this release code.</EmptyHint>
      ) : (
        <div className="space-y-2">
          {items.map((t) => (
            <div
              key={t.externalId}
              className="flex items-center justify-between gap-3 border-b border-gray-100 py-2 last:border-0 dark:border-[var(--border)]"
            >
              <div className="min-w-0">
                <a
                  href={`https://jira.example.com/browse/${t.externalId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-mono text-xs text-brand-600 hover:underline dark:text-brand-400"
                >
                  {t.externalId}
                  <ExternalLink className="h-3 w-3" />
                </a>
                <p className="truncate text-sm text-gray-700 dark:text-white/80">{t.title}</p>
                <span className="text-[10px] text-gray-400 dark:text-white/45">
                  {t.itemType}
                  {t.priority ? ` · ${t.priority}` : ""}
                  {t.assignee ? ` · ${t.assignee}` : ""}
                  {t.blockedBy ? ` · blocked by ${t.blockedBy}` : ""}
                </span>
              </div>
              <StatusBadge status={workItemStatus(t.status)} />
            </div>
          ))}
        </div>
      )}
    </>
  );

  if (embedded) return body;

  return (
    <AdvancedCard
      title="Linked work items"
      subtitle={
        lastSynced
          ? `Read-only from Jira · synced ${formatDateTime(lastSynced)}`
          : "Read-only from Jira"
      }
      icon={Ticket}
      variant="glass"
    >
      {body}
    </AdvancedCard>
  );
}

function Stat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
        warn
          ? "bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400"
          : "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-white/65"
      }`}
    >
      {label}: {value}
    </span>
  );
}

function workItemStatus(status: string): string {
  if (status === "Done" || status === "Closed" || status === "Resolved") return "Approved";
  if (status === "Blocked") return "Blocked";
  if (status === "In Progress") return "In Progress";
  return "Pending";
}
