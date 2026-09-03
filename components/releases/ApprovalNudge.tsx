"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { AgentBadge } from "@/components/badges/AgentBadge";
import { CommsModal } from "@/components/releases/CommsModal";
import { AISkeleton } from "@/components/ui/AISkeleton";
import { useReleaseStore } from "@/context/ReleaseStoreContext";
import { callAgent } from "@/lib/agent-client";
import type { Release } from "@/lib/types";
import { hoursPending, isApprovalOverdue } from "@/lib/utils";

export function ApprovalNudge({ release }: { release: Release }) {
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const { sendApprovalReminder } = useReleaseStore();

  const overdue = release.approvals.filter((a) => {
    const typical = release.typicalApprovalHours[a.gate] ?? 24;
    return isApprovalOverdue(a, typical);
  });

  useEffect(() => {
    if (overdue.length === 0) return;
    setLoading(true);
    callAgent({
      agentRole: "Approval Agent",
      context: { release, overdueApprovals: overdue.map((a) => ({ gate: a.gate, hoursPending: hoursPending(a), typical: release.typicalApprovalHours[a.gate] })) },
    }).then((res) => {
      setMessage(res.text ?? null);
      setLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [release.id, overdue.length]);

  if (overdue.length === 0) return null;

  const first = overdue[0];
  const hours = hoursPending(first) ?? 0;
  const typical = release.typicalApprovalHours[first.gate] ?? 6;
  const defaultMessage =
    message ??
    `Hi — ${first.gate} sign-off for ${release.version} has been pending ${hours}h (typical: ${typical}h). Please review and approve in ReleaseDesk Everywhere. Blockers: ${release.approvals.filter((a) => a.status === "Pending").map((a) => a.gate).join(", ")}.`;

  return (
    <>
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
        <Bell className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <AgentBadge agent="Approval Agent" />
          </div>
          {loading ? <AISkeleton lines={2} /> : (
            <p className="text-sm text-amber-900">
              {message ?? `${first.gate} sign-off has been pending ${hours}h — typical turnaround is ${typical}h.`}
            </p>
          )}
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="mt-2 text-xs font-medium text-amber-800 bg-amber-100 px-3 py-1.5 rounded-lg hover:bg-amber-200 transition-colors"
          >
            Send reminder
          </button>
        </div>
      </div>

      <CommsModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={`Remind ${first.gate} approver`}
        defaultMessage={defaultMessage}
        releaseVersion={release.version}
        onSend={(channel) => sendApprovalReminder(release.id, release.version, first.gate, channel)}
      />
    </>
  );
}
