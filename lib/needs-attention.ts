import { getReleaseBlockers } from "./blockers";
import { computeLifecycleStages } from "./lifecycle";
import { createDefaultReleaseLifecycleConfig } from "@/lib/release-lifecycle-config";
import { attentionStatusLabels } from "@/lib/release-lifecycle-status-ui";
import { demoToUnified } from "./unified-releases";
import type { DeploymentPhase, Release, ReleaseDecision } from "./types";
import { isApprovalOverdue } from "./utils";

export type NeedsAttentionItem = {
  id: string;
  code: string;
  name: string;
  status: string;
  owner: string;
  group: string;
  source: "database" | "demo";
  href: string;
  date: string;
  stage: string;
  reason: string;
  responsible: string;
  lastActor: string | null;
  lastActivity: string | null;
};

/**
 * Whether a release status is an attention (interrupt) status.
 * @param status - Stored release status label.
 * @param attentionLabels - Optional lifecycle interrupt labels; defaults to Enterprise Default.
 */
export function isNeedsAttentionStatus(
  status: string,
  attentionLabels?: Iterable<string>
): boolean {
  const labels =
    attentionLabels ??
    attentionStatusLabels(createDefaultReleaseLifecycleConfig());
  const set = new Set(
    [...labels].map((label) => label.trim().toLocaleLowerCase()).filter(Boolean)
  );
  return set.has(status.trim().toLocaleLowerCase());
}

export function buildDemoAttentionItem(
  release: Release,
  decision: ReleaseDecision | null,
  deployPhase: DeploymentPhase
): NeedsAttentionItem {
  const unified = demoToUnified(release);
  const blockers = getReleaseBlockers(release);
  const stages = computeLifecycleStages(release, decision, deployPhase);
  const focus =
    stages.find((s) => s.status === "blocked") ??
    stages.find((s) => s.status === "active") ??
    stages.find((s) => s.status === "pending");

  const overdue = release.approvals.filter((a) => {
    const typical = release.typicalApprovalHours[a.gate] ?? 24;
    return isApprovalOverdue(a, typical);
  });
  const pending = release.approvals.filter((a) => a.status === "Pending");
  const rejected = release.approvals.filter((a) => a.status === "Rejected");

  let responsible = release.owner;
  if (overdue.length) {
    const gate = overdue[0];
    responsible = gate.approver && gate.approver !== "System" ? gate.approver : `${gate.gate} approver`;
  } else if (rejected.length) {
    const gate = rejected[0];
    responsible = gate.approver && gate.approver !== "System" ? gate.approver : `${gate.gate} approver`;
  } else if (pending.length) {
    const gate = pending[0];
    responsible = gate.approver && gate.approver !== "System" ? gate.approver : `${gate.gate} approver`;
  }

  const reason =
    blockers[0]?.text ??
    (release.status === "At Risk"
      ? "Release flagged at risk — review gates and dependencies"
      : "Release blocked");

  const last = release.history[0];

  return {
    id: unified.id,
    code: unified.code,
    name: unified.name,
    status: unified.status,
    owner: unified.owner,
    group: unified.group,
    source: "demo",
    href: unified.href,
    date: unified.date,
    stage: focus ? `${focus.label} — ${focus.detail}` : release.status,
    reason,
    responsible,
    lastActor: last?.actor ?? null,
    lastActivity: last?.action ?? null,
  };
}

type DbAttentionRow = {
  id: string;
  releaseCode: string;
  name: string;
  status: string;
  owner: string;
  releaseDate: Date | string;
  notes: string | null;
  department: { name: string };
  auditEvents: { action: string; actor: string; detail: string | null; createdAt: Date }[];
};

export function buildDbAttentionItem(release: DbAttentionRow): NeedsAttentionItem {
  const latest = release.auditEvents[0];
  const reason =
    latest?.detail ??
    release.notes ??
    (release.status === "At Risk"
      ? "At risk — confirm env bookings and dependencies"
      : "Blocked — waiting on resolution");

  const date =
    typeof release.releaseDate === "string"
      ? release.releaseDate
      : release.releaseDate.toISOString();

  return {
    id: release.id,
    code: release.releaseCode,
    name: release.name,
    status: release.status,
    owner: release.owner,
    group: release.department.name,
    source: "database",
    href: `/releases/${release.id}`,
    date,
    stage: release.status,
    reason,
    responsible: release.owner,
    lastActor: latest?.actor ?? null,
    lastActivity: latest
      ? `${latest.action.replace(/_/g, " ")}${latest.detail ? ` — ${latest.detail}` : ""}`
      : null,
  };
}

export function sortAttentionItems(items: NeedsAttentionItem[]): NeedsAttentionItem[] {
  const rank = (status: string) => (status === "Blocked" ? 0 : status === "At Risk" ? 1 : 2);
  return [...items].sort((a, b) => {
    const byStatus = rank(a.status) - rank(b.status);
    if (byStatus !== 0) return byStatus;
    return new Date(a.date).getTime() - new Date(b.date).getTime();
  });
}
