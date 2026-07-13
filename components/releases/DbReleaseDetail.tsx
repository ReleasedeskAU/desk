"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { StatusBadge } from "@/components/badges/StatusBadge";
import { DetailField, DetailFieldGrid, DetailPageShell } from "@/components/detail/DetailPageShell";
import { DbReleaseCommandCenter } from "@/components/releases/DbReleaseCommandCenter";
import { DbBlockerList } from "@/components/releases/DbBlockerList";
import { DbReleaseDriftList } from "@/components/releases/DbReleaseDriftList";
import { StakeholderCommsPanel } from "@/components/releases/StakeholderCommsPanel";
import { ReleaseFormModal } from "@/components/releases/ReleaseFormModal";
import { AdvancedCard } from "@/components/ui/advanced-card";
import { taBtnPrimary, taBtnSecondary, taInput } from "@/lib/styles";
import { formatDate, formatDateTime, cn } from "@/lib/utils";
import type { SessionUser } from "@/lib/auth/roles";
import { loadJsonEffect, safeFetchJson } from "@/lib/safe-fetch";
import {
  Calendar,
  CalendarCheck,
  ClipboardCheck,
  GitCompareArrows,
  History,
  LayoutDashboard,
  List,
  Pencil,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";

type ReleaseDetail = {
  id: string;
  releaseCode: string;
  name: string;
  programProject: string | null;
  owner: string;
  status: string;
  releaseDate: string;
  priority: string;
  impact: string;
  notes: string | null;
  decision: string | null;
  departmentId: string;
  department: { name: string };
  releaseSize?: string | null;
  cabDate?: string | null;
  startDate?: string | null;
  testEnvRequired?: string | null;
  uatEnvRequired?: string | null;
  conflictFlag?: boolean;
  readinessPercent?: number | null;
  blockers?: string | null;
  vendorMaintenance?: string | null;
  changeFreeze?: string | null;
  regulatory?: string | null;
  approvalStatus?: string | null;
  rollbackPlan?: string | null;
  goLiveChecklistPercent?: number | null;
  deploymentWindow?: string | null;
  dependencies?: string | null;
  conflictId?: string | null;
  conflictingRelease?: string | null;
  conflictType?: string | null;
  conflictNotes?: string | null;
  externalDependencies?: string | null;
  releaseHealth?: string | null;
  devSignoff?: string | null;
  testSignoff?: string | null;
  uatSignoff?: string | null;
  securityClearance?: string | null;
  dressRehearsal?: string | null;
  hypercarePlan?: string | null;
  commsPlan?: string | null;
  trainingStatus?: string | null;
  releaseOwnerId?: string | null;
  releaseOwner?: { id: string; userId: string; name: string; email: string; role: string } | null;
  stakeholders?: { user: { id: string; userId: string; name: string; email: string; role: string } }[];
  applications: { application: { id: string; name: string } }[];
  dependsOn: { dependsOnRelease: { id: string; releaseCode: string; name: string } }[];
  bookings: {
    id: string;
    bookingCode?: string | null;
    purpose: string | null;
    fromDate: string;
    toDate: string;
    bookedBy?: string;
    team?: string;
    application: { name: string };
  }[];
  auditEvents: { id: string; action: string; actor: string; detail: string | null; createdAt: string }[];
};

const STATUSES = ["Planned", "In Progress", "Blocked", "At Risk", "Complete"];

function dash(v: ReactNode) {
  if (v === null || v === undefined || v === "") return "—";
  return v;
}

function relativeLabel(iso?: string | null): string {
  if (!iso) return "—";
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
  if (Number.isNaN(days)) return "—";
  if (days === 0) return "Today";
  if (days === 1) return "In 1 day";
  if (days > 1) return `In ${days} days`;
  if (days === -1) return "1 day ago";
  return `${Math.abs(days)} days ago`;
}

function durationLabel(start?: string | null, end?: string | null): string {
  if (!start || !end) return "—";
  const a = new Date(start);
  const b = new Date(end);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return "—";
  const days = Math.round((b.getTime() - a.getTime()) / 86400000);
  return `${days} day${days === 1 ? "" : "s"}`;
}

function healthClass(health?: string | null): string {
  const h = (health ?? "").toLowerCase();
  if (h.includes("no-go") || h.includes("nogo") || h.includes("red")) {
    return "bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300";
  }
  if (h.includes("go") || h.includes("green") || h.includes("ready")) {
    return "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300";
  }
  if (h.includes("caution") || h.includes("amber") || h.includes("at risk")) {
    return "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300";
  }
  return "bg-gray-100 text-gray-800 dark:bg-white/10 dark:text-white/80";
}

function ConflictCodeLinks({ raw }: { raw?: string | null }) {
  const codes = (raw ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  if (!codes.length) return <>—</>;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1 gap-y-0.5">
      {codes.map((code, i) => (
        <span key={code} className="inline-flex items-center">
          {i > 0 && <span className="text-gray-400 mr-1">,</span>}
          <ProgressLink
            href={`/conflicts/${encodeURIComponent(code)}`}
            className="font-mono text-xs text-brand-600 hover:underline dark:text-brand-400"
          >
            {code}
          </ProgressLink>
        </span>
      ))}
    </span>
  );
}

function ReleaseCodeLinks({
  raw,
  releases,
}: {
  raw?: string | null;
  releases: { id: string; releaseCode: string }[];
}) {
  const codes = (raw ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  if (!codes.length) return <>—</>;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1 gap-y-0.5">
      {codes.map((code, i) => {
        const hit = releases.find((r) => r.releaseCode.toUpperCase() === code.toUpperCase());
        return (
          <span key={code} className="inline-flex items-center">
            {i > 0 && <span className="text-gray-400 mr-1">,</span>}
            {hit ? (
              <ProgressLink
                href={`/releases/${hit.id}`}
                className="font-mono text-xs text-brand-600 hover:underline dark:text-brand-400"
              >
                {code}
              </ProgressLink>
            ) : (
              <span className="font-mono text-xs">{code}</span>
            )}
          </span>
        );
      })}
    </span>
  );
}

export function DbReleaseDetail({ id }: { id: string }) {
  const router = useRouter();
  const [release, setRelease] = useState<ReleaseDetail | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [note, setNote] = useState("");
  const [lastRefresh, setLastRefresh] = useState<Date>(() => new Date());
  const [lookups, setLookups] = useState<{
    departments: { id: string; name: string }[];
    applications: { id: string; name: string }[];
    releases: { id: string; releaseCode: string; name: string }[];
  }>({ departments: [], applications: [], releases: [] });

  const load = useCallback(() => {
    void (async () => {
      const result = await safeFetchJson<ReleaseDetail>(`/api/releases/${id}`, { label: "release-detail" });
      setRelease(result.ok ? result.data : null);
      setLastRefresh(new Date());
      setLoading(false);
    })();
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const cleanupAuth = loadJsonEffect<{ user: SessionUser }>(
      "/api/auth/me",
      (d) => setUser(d.user),
      { label: "auth-me" }
    );
    const ac = new AbortController();
    void (async () => {
      const [deptRes, appRes, relRes] = await Promise.all([
        safeFetchJson<{ id: string; name: string }[]>("/api/departments", { signal: ac.signal, label: "departments" }),
        safeFetchJson<{ id: string; name: string }[]>("/api/applications", { signal: ac.signal, label: "applications" }),
        safeFetchJson<{ id: string; releaseCode: string; name: string }[]>("/api/releases", {
          signal: ac.signal,
          label: "releases",
        }),
      ]);
      if (ac.signal.aborted) return;
      setLookups({
        departments: deptRes.ok ? deptRes.data : [],
        applications: appRes.ok ? appRes.data : [],
        releases: relRes.ok ? relRes.data : [],
      });
    })();
    return () => {
      cleanupAuth();
      ac.abort();
    };
  }, []);

  const canEdit = user?.role === "editor" || user?.role === "admin";

  const releaseOptions = useMemo(
    () =>
      [...lookups.releases].sort((a, b) => a.releaseCode.localeCompare(b.releaseCode, undefined, { numeric: true })),
    [lookups.releases]
  );

  const patchStatus = async (status: string) => {
    await safeFetchJson(`/api/releases/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
      label: "release-patch-status",
    });
    load();
  };

  const recordDecision = async (detail: string) => {
    await safeFetchJson(`/api/releases/${id}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "decision", detail }),
      label: "release-record-decision",
    });
    load();
  };

  const addNote = async () => {
    if (!note.trim()) return;
    await safeFetchJson(`/api/releases/${id}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "note", detail: note }),
      label: "release-add-note",
    });
    setNote("");
    load();
  };

  const remove = async () => {
    if (!confirm("Delete this release?")) return;
    await safeFetchJson(`/api/releases/${id}`, { method: "DELETE", label: "release-delete" });
    router.push("/releases");
  };

  if (loading) return <p className="text-gray-500 dark:text-white/60">Loading release…</p>;
  if (!release) return <p className="text-gray-500 dark:text-white/60">Release not found.</p>;

  const appNames = release.applications.map((a) => a.application.name).join(", ") || "—";
  const stakeholderIds =
    release.stakeholders?.map((s) => s.user.userId).filter(Boolean).join(", ") || "—";
  const ownerDisplay = release.releaseOwner
    ? `${release.releaseOwner.userId} (${release.releaseOwner.name})`
    : release.owner;
  const readinessDisplay =
    release.readinessPercent != null ? `${release.readinessPercent}%` : "—";
  const checklistDisplay =
    release.goLiveChecklistPercent != null ? `${release.goLiveChecklistPercent}%` : "—";
  const conflictFlagDisplay = release.conflictFlag
    ? release.conflictId
      ? "⚠️ CONFLICT"
      : "Yes"
    : "No";

  return (
    <DetailPageShell
      entityCode={release.releaseCode}
      title="Release Page"
      subtitle={`${release.releaseCode} — ${release.name}`}
      backHref="/releases"
      backLabel="All Releases"
      badges={
        <>
          <StatusBadge status={release.status as "Ready"} />
          {release.releaseHealth && (
            <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold", healthClass(release.releaseHealth))}>
              {release.releaseHealth}
            </span>
          )}
        </>
      }
      actions={
        canEdit ? (
          <>
            <button type="button" className={taBtnSecondary + " text-sm !py-2"} onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4 inline mr-1" /> Edit
            </button>
            <button
              type="button"
              className={
                taBtnSecondary +
                " text-sm !py-2 !text-error-600 !border-error-200 hover:!bg-error-50 dark:!border-error-800/50 dark:hover:!bg-error-950/30"
              }
              onClick={remove}
            >
              <Trash2 className="h-4 w-4 inline mr-1" /> Delete
            </button>
          </>
        ) : undefined
      }
    >
      {/* Header: Select Release + Last Refresh */}
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-gray-200 bg-white/80 px-4 py-3 dark:border-[var(--border)] dark:bg-[var(--card)]">
        <label className="text-sm text-gray-700 dark:text-white/80">
          <span className="block text-xs text-gray-400 dark:text-white/45 mb-1">Select Release</span>
          <select
            className={cn(taInput, "min-w-[220px] font-mono text-sm")}
            value={release.id}
            onChange={(e) => {
              if (e.target.value && e.target.value !== release.id) {
                router.push(`/releases/${e.target.value}`);
              }
            }}
          >
            {releaseOptions.length === 0 ? (
              <option value={release.id}>{release.releaseCode}</option>
            ) : (
              releaseOptions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.releaseCode}
                </option>
              ))
            )}
          </select>
        </label>
        <p className="text-xs text-gray-500 dark:text-white/55">
          Last Refresh: <span className="font-medium text-gray-700 dark:text-white/80">{formatDateTime(lastRefresh.toISOString())}</span>
        </p>
      </div>

      {/* RELEASE STATUS AT A GLANCE */}
      <AdvancedCard title="🚦 Release Status at a Glance">
        <DetailFieldGrid cols={3}>
          <DetailField
            label="Release Health"
            value={
              <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-sm font-semibold", healthClass(release.releaseHealth))}>
                {dash(release.releaseHealth)}
              </span>
            }
          />
          <DetailField label="Status" value={<StatusBadge status={release.status} />} />
          <DetailField label="Readiness %" value={readinessDisplay} />
        </DetailFieldGrid>
      </AdvancedCard>

      {/* BLOCKERS & CONFLICTS */}
      <div id="blockers">
        <AdvancedCard title="🚨 Blockers & Conflicts">
          <DetailFieldGrid cols={3}>
            <DetailField label="Conflict Flag" value={conflictFlagDisplay} />
            <DetailField label="Conflict ID" value={<ConflictCodeLinks raw={release.conflictId} />} />
            <DetailField
              label="Conflicting Release"
              value={<ReleaseCodeLinks raw={release.conflictingRelease} releases={lookups.releases} />}
            />
            <DetailField label="Conflict Type" value={dash(release.conflictType)} />
            <DetailField label="Change Freeze" value={dash(release.changeFreeze)} />
            <DetailField label="Vendor Maintenance" value={dash(release.vendorMaintenance)} />
          </DetailFieldGrid>
          <div className="mt-4">
            <DetailField label="Conflict Notes" value={dash(release.conflictNotes)} />
          </div>
          <div className="mt-5 pt-4 border-t border-gray-100 dark:border-[var(--border)]">
            <DbBlockerList
              embedded
              releaseCode={release.releaseCode}
              releaseName={release.name}
              departmentName={release.department.name}
              applicationName={release.applications[0]?.application.name ?? ""}
              canEdit={canEdit}
              raisedByDefault={user?.name ?? ""}
            />
          </div>
        </AdvancedCard>
      </div>

      {/* RELEASE INFORMATION */}
      <AdvancedCard title="📦 Release Information">
        <DetailFieldGrid cols={3}>
          <DetailField label="Release ID" value={<span className="font-mono">{release.releaseCode}</span>} />
          <DetailField label="Priority" value={dash(release.priority)} />
          <DetailField label="Impact" value={dash(release.impact)} />
          <DetailField label="Release Name" value={dash(release.name)} />
          <DetailField label={"\u00A0"} value={"\u00A0"} />
          <DetailField label="Size" value={dash(release.releaseSize)} />
          <DetailField label="Department" value={dash(release.department.name)} />
          <DetailField label="Application" value={appNames} />
          <DetailField label="Owner" value={dash(ownerDisplay)} />
          <DetailField label="External Dependencies" value={dash(release.externalDependencies)} />
          <DetailField label={"\u00A0"} value={"\u00A0"} />
          <DetailField
            label="Depends On"
            value={
              release.dependsOn.length ? (
                <span className="inline-flex flex-wrap gap-2">
                  {release.dependsOn.map((d) => (
                    <ProgressLink
                      key={d.dependsOnRelease.id}
                      href={`/releases/${d.dependsOnRelease.id}`}
                      className="font-mono text-xs text-brand-600 hover:underline dark:text-brand-400"
                    >
                      {d.dependsOnRelease.releaseCode}
                    </ProgressLink>
                  ))}
                </span>
              ) : (
                "—"
              )
            }
          />
        </DetailFieldGrid>
      </AdvancedCard>

      {/* KEY DATES & TIMELINE */}
      <AdvancedCard title="📅 Key Dates & Timeline">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 dark:text-white/45 border-b border-gray-100 dark:border-[var(--border)]">
                <th className="py-2 pr-3 font-medium">CAB Date</th>
                <th className="py-2 pr-3 font-medium">Start Date</th>
                <th className="py-2 pr-3 font-medium">End Date</th>
                <th className="py-2 pr-3 font-medium">Duration</th>
                <th className="py-2 font-medium">Deploy Window</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-50 dark:border-[var(--border)]/60">
                <td className="py-2 pr-3 font-medium text-gray-800 dark:text-white">
                  {release.cabDate ? formatDate(release.cabDate) : "—"}
                </td>
                <td className="py-2 pr-3 font-medium text-gray-800 dark:text-white">
                  {release.startDate ? formatDate(release.startDate) : "—"}
                </td>
                <td className="py-2 pr-3 font-medium text-gray-800 dark:text-white">
                  {formatDate(release.releaseDate)}
                </td>
                <td className="py-2 pr-3 font-medium text-gray-800 dark:text-white">
                  {durationLabel(release.startDate, release.releaseDate)}
                </td>
                <td className="py-2 font-medium text-gray-800 dark:text-white">
                  {dash(release.deploymentWindow)}
                </td>
              </tr>
              <tr className="text-xs text-gray-500 dark:text-white/55">
                <td className="py-2 pr-3">{relativeLabel(release.cabDate)}</td>
                <td className="py-2 pr-3">{relativeLabel(release.startDate)}</td>
                <td className="py-2 pr-3">{relativeLabel(release.releaseDate)}</td>
                <td className="py-2 pr-3">—</td>
                <td className="py-2">—</td>
              </tr>
            </tbody>
          </table>
        </div>
      </AdvancedCard>

      {/* ENVIRONMENTS */}
      <AdvancedCard title="🖥️ Environments">
        <DetailFieldGrid cols={3}>
          <DetailField label="Test Env Required" value={dash(release.testEnvRequired)} />
          <DetailField label="UAT Env Required" value={dash(release.uatEnvRequired)} />
          <DetailField
            label="Env Conflicts"
            value={
              <span
                className={cn(
                  "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold",
                  release.conflictFlag
                    ? "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300"
                    : "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300"
                )}
              >
                {release.conflictFlag ? "Yes" : "No"}
              </span>
            }
          />
        </DetailFieldGrid>
      </AdvancedCard>

      {/* SIGN-OFFS & APPROVALS */}
      <AdvancedCard title="✅ Sign-offs & Approvals">
        <DetailFieldGrid cols={2}>
          <DetailField label="Approval Status" value={dash(release.approvalStatus)} />
          <DetailField label="Rollback Plan" value={dash(release.rollbackPlan)} />
        </DetailFieldGrid>
        <div className="mt-4 pt-4 border-t border-gray-100 dark:border-[var(--border)]">
          <DetailFieldGrid cols={3}>
            <DetailField label="Dev Signoff" value={dash(release.devSignoff)} />
            <DetailField label="Test Sign-off" value={dash(release.testSignoff)} />
            <DetailField label="UAT Sign-off" value={dash(release.uatSignoff)} />
            <DetailField label="Security Clearance" value={dash(release.securityClearance)} />
            <DetailField label="Dress Rehearsal" value={dash(release.dressRehearsal)} />
            <DetailField label="Go-Live Checklist (%)" value={checklistDisplay} />
          </DetailFieldGrid>
        </div>
      </AdvancedCard>

      {/* COMMUNICATIONS & TRAINING */}
      <AdvancedCard title="📢 Communications & Training">
        <DetailFieldGrid cols={3}>
          <DetailField label="Hypercare Plan" value={dash(release.hypercarePlan)} />
          <DetailField label="Comms Plan" value={dash(release.commsPlan)} />
          <DetailField label="Training Status" value={dash(release.trainingStatus)} />
        </DetailFieldGrid>
      </AdvancedCard>

      {/* STAKEHOLDERS & CONTACTS */}
      <AdvancedCard title="👥 Stakeholders & Contacts">
        <DetailFieldGrid cols={3}>
          <DetailField label="Release Owner" value={dash(ownerDisplay)} />
          <DetailField label="Stakeholder IDs" value={<span className="font-mono text-xs">{stakeholderIds}</span>} />
          <DetailField label="Regulatory" value={dash(release.regulatory)} />
        </DetailFieldGrid>
      </AdvancedCard>

      {/* NOTES */}
      <AdvancedCard title="📝 Notes & Additional Information">
        <DetailFieldGrid cols={2}>
          <DetailField label="Conflict Notes" value={dash(release.conflictNotes)} />
          <DetailField label="Release Notes" value={dash(release.notes)} />
        </DetailFieldGrid>
      </AdvancedCard>

      {/* DRIFT (Batch 7 — required, not in original mockup) */}
      <div id="drift">
        <AdvancedCard title="Drift" icon={GitCompareArrows}>
          <DbReleaseDriftList releaseId={id} embedded />
        </AdvancedCard>
      </div>

      {/* QUICK ACTIONS */}
      <AdvancedCard title="⚡ Quick Actions">
        <div className="flex flex-wrap gap-2">
          <ProgressLink href="/calendar" className={taBtnSecondary + " text-sm !py-2"}>
            <Calendar className="h-4 w-4 inline mr-1" /> View Calendar
          </ProgressLink>
          <ProgressLink href="/booking" className={taBtnSecondary + " text-sm !py-2"}>
            <CalendarCheck className="h-4 w-4 inline mr-1" /> Env Booking
          </ProgressLink>
          <ProgressLink href="/approvals" className={taBtnSecondary + " text-sm !py-2"}>
            <ClipboardCheck className="h-4 w-4 inline mr-1" /> Approvals
          </ProgressLink>
          <ProgressLink href="/risks" className={taBtnSecondary + " text-sm !py-2"}>
            <ShieldAlert className="h-4 w-4 inline mr-1" /> View Risks
          </ProgressLink>
          <ProgressLink href="/dashboard" className={taBtnSecondary + " text-sm !py-2"}>
            <LayoutDashboard className="h-4 w-4 inline mr-1" /> Dashboard
          </ProgressLink>
          <ProgressLink href="/releases" className={taBtnSecondary + " text-sm !py-2"}>
            <List className="h-4 w-4 inline mr-1" /> All Releases
          </ProgressLink>
        </div>
      </AdvancedCard>

      <p className="text-center text-xs text-gray-400 dark:text-white/40">
        Release Page v1.0 | Data sourced from Releases sheet | For questions contact Release Management Team
      </p>

      {/* —— Supplemental tools (beyond mockup; kept intentionally) —— */}
      <div className="pt-2 border-t border-dashed border-gray-200 dark:border-[var(--border)] space-y-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-white/40">
          Additional tools
        </p>

        <DbReleaseCommandCenter releaseId={id} />

        <StakeholderCommsPanel releaseId={id} releaseCode={release.releaseCode} />

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            {canEdit && (
              <AdvancedCard title="Quick status">
                <div className="flex flex-wrap gap-2">
                  {STATUSES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => patchStatus(s)}
                      className={cn(
                        "rounded-lg px-2.5 py-1 text-xs border transition-colors",
                        release.status === s
                          ? "bg-brand-500 text-white border-brand-500"
                          : "border-gray-200 dark:border-[var(--border)] hover:border-brand-300 dark:hover:border-brand-500/50 dark:text-white/75"
                      )}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </AdvancedCard>
            )}
          </div>
          <div id="go-nogo">
            <AdvancedCard title="Go / No-Go" subtitle="Recorded to audit trail">
              {canEdit ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={taBtnPrimary + " flex-1 !bg-success-600"}
                    onClick={() => recordDecision("Go — approved for deployment")}
                  >
                    Go
                  </button>
                  <button
                    type="button"
                    className={taBtnPrimary + " flex-1 !bg-error-600"}
                    onClick={() => recordDecision("No-Go — blocked")}
                  >
                    No-Go
                  </button>
                </div>
              ) : (
                <p className="text-sm text-gray-500 dark:text-white/60">{release.decision ?? "No decision recorded"}</p>
              )}
            </AdvancedCard>
          </div>
        </div>

        {release.bookings.length > 0 && (
          <AdvancedCard title="Linked environment bookings">
            <ul className="space-y-2 text-sm">
              {release.bookings.map((b) => (
                <li key={b.id} className="text-gray-700 dark:text-white/80">
                  <ProgressLink
                    href={`/booking/${b.id}`}
                    className="font-mono text-xs text-brand-600 hover:underline dark:text-brand-400"
                  >
                    {b.bookingCode ?? b.id}
                  </ProgressLink>
                  {" · "}
                  <strong>{b.application.name}</strong> · {formatDate(b.fromDate)} → {formatDate(b.toDate)}
                  {b.bookedBy && <span className="text-gray-500 dark:text-white/50"> · Booked by {b.bookedBy}</span>}
                  {b.team && <span className="text-gray-500 dark:text-white/50"> · Team {b.team}</span>}
                  {b.purpose && <span className="text-gray-500 dark:text-white/50"> · {b.purpose}</span>}
                </li>
              ))}
            </ul>
          </AdvancedCard>
        )}

        <AdvancedCard title="Audit trail" icon={History}>
          <div className="space-y-3">
            {canEdit && (
              <div className="flex gap-2">
                <input
                  className={taInput}
                  placeholder="Add a note…"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
                <button type="button" className={taBtnSecondary} onClick={addNote}>
                  Add
                </button>
              </div>
            )}
            {release.auditEvents.map((e) => (
              <div key={e.id} className="text-sm border-b border-gray-100 dark:border-[var(--border)] pb-2">
                <span className="text-xs text-gray-400 dark:text-white/45">
                  {formatDateTime(e.createdAt)} · {e.actor}
                </span>
                <p className="text-gray-700 dark:text-white/80 capitalize">
                  {e.action.replace("_", " ")}
                  {e.detail ? ` — ${e.detail}` : ""}
                </p>
              </div>
            ))}
          </div>
        </AdvancedCard>
      </div>

      <ReleaseFormModal
        open={editOpen}
        initial={{
          id: release.id,
          releaseCode: release.releaseCode,
          name: release.name,
          programProject: release.programProject ?? "",
          owner: release.owner,
          status: release.status,
          releaseDate: release.releaseDate,
          priority: release.priority,
          impact: release.impact,
          departmentId: release.departmentId,
          applicationIds: release.applications.map((a) => a.application.id),
          dependsOnReleaseIds: release.dependsOn.map((d) => d.dependsOnRelease.id),
          notes: release.notes ?? "",
          releaseSize: release.releaseSize ?? "",
          cabDate: release.cabDate ?? "",
          startDate: release.startDate ?? "",
          testEnvRequired: release.testEnvRequired ?? "",
          uatEnvRequired: release.uatEnvRequired ?? "",
          releaseOwnerId: release.releaseOwner?.id ?? release.releaseOwnerId ?? "",
        }}
        existingReleaseCodes={lookups.releases.map((r) => r.releaseCode)}
        departments={lookups.departments.map((d) => ({ value: d.id, label: d.name }))}
        applications={lookups.applications.map((a) => ({ value: a.id, label: a.name }))}
        releases={lookups.releases.map((r) => ({
          value: r.id,
          label: r.name ? `${r.releaseCode} — ${r.name}` : r.releaseCode,
        }))}
        onClose={() => setEditOpen(false)}
        onSaved={load}
      />
    </DetailPageShell>
  );
}
