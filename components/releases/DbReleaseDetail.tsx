"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { StatusBadge } from "@/components/badges/StatusBadge";
import { DetailField, DetailFieldGrid, DetailPageShell } from "@/components/detail/DetailPageShell";
import {
  ConfirmDeleteDialog,
  DetailSection,
  EmptyHint,
  HeroStatusRow,
  ScoreBar,
  SignoffChip,
  StatusChip,
  TintedCallout,
  type ChipTone,
  type HeroTone,
} from "@/components/detail/editable";
import { DbReleaseCommandCenter } from "@/components/releases/DbReleaseCommandCenter";
import { DbBlockerList } from "@/components/releases/DbBlockerList";
import { DbReleaseDriftList } from "@/components/releases/DbReleaseDriftList";
import { StakeholderCommsPanel } from "@/components/releases/StakeholderCommsPanel";
import { ReleaseFormModal } from "@/components/releases/ReleaseFormModal";
import { taBtnPrimary, taBtnSecondary, taInput } from "@/lib/styles";
import { formatDate, formatDateTime, cn } from "@/lib/utils";
import type { SessionUser } from "@/lib/auth/roles";
import { canEdit as sessionCanEdit } from "@/lib/auth/roles";
import { loadJsonEffect, safeFetchJson } from "@/lib/safe-fetch";
import {
  AlertTriangle,
  Calendar,
  CalendarCheck,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  GitCompareArrows,
  History,
  LayoutDashboard,
  List,
  Megaphone,
  Package,
  Pencil,
  Server,
  ShieldAlert,
  SlidersHorizontal,
  Trash2,
  Users,
  Zap,
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

function healthTone(health?: string | null): HeroTone {
  const normalized = (health ?? "").toLowerCase();
  if (normalized.includes("no-go") || normalized.includes("nogo") || normalized.includes("red")) return "rose";
  if (normalized.includes("caution") || normalized.includes("amber") || normalized.includes("risk")) return "amber";
  if (normalized.includes("go") || normalized.includes("green") || normalized.includes("ready")) return "emerald";
  return "indigo";
}

function statusTone(status?: string | null): ChipTone {
  const normalized = (status ?? "").toLowerCase();
  if (normalized.includes("block")) return "bad";
  if (normalized.includes("risk") || normalized.includes("hold") || normalized.includes("progress")) return "warn";
  if (normalized.includes("complete") || normalized.includes("ready") || normalized.includes("approve")) return "good";
  if (normalized.includes("plan")) return "info";
  return "neutral";
}

function signalDone(value?: string | null): boolean {
  const normalized = (value ?? "").trim().toLowerCase();
  return ["yes", "done", "approved", "complete", "completed", "ready", "passed", "cleared"].some(
    (token) => normalized === token || normalized.startsWith(`${token} `)
  );
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
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [computedReadiness, setComputedReadiness] = useState<number | null>(null);
  const [commandRefreshKey, setCommandRefreshKey] = useState(0);
  const [note, setNote] = useState("");
  const [lastRefresh, setLastRefresh] = useState<Date>(() => new Date());
  const [lookups, setLookups] = useState<{
    departments: { id: string; name: string }[];
    applications: { id: string; name: string; departmentId: string }[];
    environments: { id: string; name: string; applicationId: string }[];
    releases: { id: string; releaseCode: string; name: string }[];
  }>({ departments: [], applications: [], environments: [], releases: [] });

  const load = useCallback(() => {
    void (async () => {
      const result = await safeFetchJson<ReleaseDetail>(`/api/releases/${id}`, { label: "release-detail" });
      setRelease(result.ok ? result.data : null);
      setLastRefresh(new Date());
      setLoading(false);
    })();
  }, [id]);

  useEffect(() => {
    setComputedReadiness(null);
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
      const [deptRes, appRes, envRes, relRes] = await Promise.all([
        safeFetchJson<{ id: string; name: string }[]>("/api/departments", { signal: ac.signal, label: "departments" }),
        safeFetchJson<{ id: string; name: string; departmentId: string }[]>("/api/applications", {
          signal: ac.signal,
          label: "applications",
        }),
        safeFetchJson<{ id: string; name: string; applicationId: string }[]>("/api/environments", {
          signal: ac.signal,
          label: "environments",
        }),
        safeFetchJson<{ id: string; releaseCode: string; name: string }[]>("/api/releases", {
          signal: ac.signal,
          label: "releases",
        }),
      ]);
      if (ac.signal.aborted) return;
      setLookups({
        departments: deptRes.ok ? deptRes.data : [],
        applications: appRes.ok ? appRes.data : [],
        environments: envRes.ok ? envRes.data : [],
        releases: relRes.ok ? relRes.data : [],
      });
    })();
    return () => {
      cleanupAuth();
      ac.abort();
    };
  }, []);

  const canEdit = sessionCanEdit(user);
  const refreshCommandCenter = useCallback(() => {
    setCommandRefreshKey((key) => key + 1);
  }, []);

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
    refreshCommandCenter();
  };

  const recordDecision = async (detail: string) => {
    await safeFetchJson(`/api/releases/${id}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "decision", detail }),
      label: "release-record-decision",
    });
    load();
    refreshCommandCenter();
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
    setDeleting(true);
    const result = await safeFetchJson(`/api/releases/${id}`, {
      method: "DELETE",
      label: "release-delete",
      rejectHttpErrors: false,
    });
    setDeleting(false);
    if (!result.ok || result.status >= 300) return;
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
  const conflictFlagDisplay = release.conflictFlag
    ? release.conflictId
      ? "⚠️ CONFLICT"
      : "Yes"
    : "No";

  return (
    <DetailPageShell
      entityCode={release.releaseCode}
      title="Release Detail"
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
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-[13px] font-semibold text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:text-white/45 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              Delete
            </button>
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2.5 text-[13px] font-semibold text-white shadow-sm shadow-indigo-200 transition-all hover:bg-indigo-700 hover:shadow-md active:scale-[0.97] dark:shadow-indigo-900/40"
            >
              <Pencil className="h-4 w-4" aria-hidden />
              Edit Release
            </button>
          </>
        ) : undefined
      }
    >
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-[22px] bg-white px-5 py-4 shadow-[0_16px_36px_-24px_rgba(112,144,176,0.25)] dark:bg-[var(--card)] dark:shadow-[0_16px_36px_-24px_rgba(0,0,0,0.55)]">
        <label className="min-w-0 w-full text-sm text-gray-700 dark:text-white/80 sm:w-auto">
          <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/45">
            Select Release
          </span>
          <select
            className={cn(taInput, "w-full min-w-0 max-w-full rounded-xl font-mono text-sm sm:w-auto sm:min-w-[220px]")}
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

      <HeroStatusRow
        hero={{
          icon: ShieldAlert,
          label: "Release Health",
          value: release.releaseHealth ?? "Not assessed",
          tone: healthTone(release.releaseHealth),
        }}
        secondary={{ icon: Zap, label: "Status", value: release.status }}
        metric={{
          icon: CheckCircle2,
          label: "Operational Readiness",
          percent: computedReadiness ?? release.readinessPercent ?? 0,
          caption: computedReadiness == null ? "stored planning readiness" : "computed from live operational signals",
          tone:
            (computedReadiness ?? release.readinessPercent ?? 0) >= 80
              ? "emerald"
              : (computedReadiness ?? release.readinessPercent ?? 0) >= 50
                ? "amber"
                : "rose",
        }}
      />

      <DbReleaseCommandCenter
        releaseId={id}
        storedReadiness={release.readinessPercent}
        checklistPercent={release.goLiveChecklistPercent}
        refreshKey={commandRefreshKey}
        onReadinessChange={setComputedReadiness}
      />

      <DetailSection
        id="go-nogo"
        icon={SlidersHorizontal}
        tone="indigo"
        title="Release controls"
        description="Update operational status and record the deployment decision without leaving this page."
      >
        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <div>
            <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">Quick status</p>
            {canEdit ? (
              <div className="flex flex-wrap gap-2">
                {STATUSES.map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => patchStatus(status)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                      release.status === status
                        ? "border-indigo-600 bg-indigo-600 text-white"
                        : "border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-600 dark:border-[var(--border)] dark:bg-white/5 dark:text-white/65"
                    )}
                  >
                    {status}
                  </button>
                ))}
              </div>
            ) : (
              <StatusChip label={release.status} tone={statusTone(release.status)} />
            )}
          </div>
          <div className="rounded-xl bg-slate-50 p-3 dark:bg-white/5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">Go / No-Go</p>
              <StatusChip label={release.decision ?? "No decision"} tone={statusTone(release.decision)} />
            </div>
            {canEdit && (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className={cn(taBtnPrimary, "!bg-emerald-600 hover:!bg-emerald-700")}
                  onClick={() => recordDecision("Go — approved for deployment")}
                >
                  Record Go
                </button>
                <button
                  type="button"
                  className={cn(taBtnPrimary, "!bg-rose-600 hover:!bg-rose-700")}
                  onClick={() => recordDecision("No-Go — blocked")}
                >
                  Record No-Go
                </button>
              </div>
            )}
          </div>
        </div>
      </DetailSection>

      <div id="blockers">
        <DetailSection
          icon={AlertTriangle}
          tone="rose"
          title="Blockers & conflicts"
          description="Anything actively stopping the release, including environment collisions and live blocker-register rows."
        >
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <StatusChip
              label={release.conflictFlag ? "⚠ Conflict detected" : "No environment conflict"}
              tone={release.conflictFlag ? "bad" : "good"}
            />
            {release.changeFreeze && <StatusChip label={release.changeFreeze} tone="warn" />}
          </div>
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
          {release.conflictNotes && (
            <div className="mt-4">
              <TintedCallout tone="rose">{release.conflictNotes}</TintedCallout>
            </div>
          )}
          <div className="mt-5 pt-4 border-t border-gray-100 dark:border-[var(--border)]">
            <DbBlockerList
              embedded
              releaseCode={release.releaseCode}
              releaseName={release.name}
              departmentName={release.department.name}
              applicationName={release.applications[0]?.application.name ?? ""}
              canEdit={canEdit}
              raisedByDefault={user?.name ?? ""}
              onChanged={refreshCommandCenter}
            />
          </div>
        </DetailSection>
      </div>

      <DetailSection
        icon={Package}
        tone="indigo"
        title="Release information"
        description="Core identity, ownership, scope, and upstream dependencies for this release."
      >
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
      </DetailSection>

      <DetailSection
        icon={Calendar}
        tone="violet"
        title="Key dates & timeline"
        description="CAB, execution, and deployment timing with relative milestones for fast scheduling decisions."
      >
        <div className="md:hidden">
          <DetailFieldGrid cols={2}>
            <DetailField
              label="CAB Date"
              value={
                <span>
                  {release.cabDate ? formatDate(release.cabDate) : "—"}
                  <span className="mt-0.5 block text-xs font-normal text-gray-500 dark:text-white/55">
                    {relativeLabel(release.cabDate)}
                  </span>
                </span>
              }
            />
            <DetailField
              label="Start Date"
              value={
                <span>
                  {release.startDate ? formatDate(release.startDate) : "—"}
                  <span className="mt-0.5 block text-xs font-normal text-gray-500 dark:text-white/55">
                    {relativeLabel(release.startDate)}
                  </span>
                </span>
              }
            />
            <DetailField
              label="End Date"
              value={
                <span>
                  {formatDate(release.releaseDate)}
                  <span className="mt-0.5 block text-xs font-normal text-gray-500 dark:text-white/55">
                    {relativeLabel(release.releaseDate)}
                  </span>
                </span>
              }
            />
            <DetailField label="Duration" value={durationLabel(release.startDate, release.releaseDate)} />
            <DetailField label="Deploy Window" value={dash(release.deploymentWindow)} />
          </DetailFieldGrid>
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs text-gray-400 dark:border-[var(--border)] dark:text-white/45">
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
      </DetailSection>

      <DetailSection
        icon={Server}
        tone="sky"
        title="Environments & bookings"
        description="Required test infrastructure, collision state, and every linked environment reservation."
      >
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
        <div className="mt-5 border-t border-slate-100 pt-4 dark:border-[var(--border)]">
          <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">
            Linked environment bookings
          </p>
          {release.bookings.length ? (
            <ul className="space-y-2">
              {release.bookings.map((booking) => (
                <li
                  key={booking.id}
                  className="rounded-xl bg-sky-50/70 px-3 py-2.5 text-sm text-slate-700 dark:bg-sky-500/10 dark:text-white/75"
                >
                  <ProgressLink
                    href={`/booking/${booking.id}`}
                    className="font-mono text-xs font-bold text-sky-700 hover:underline dark:text-sky-300"
                  >
                    {booking.bookingCode ?? booking.id}
                  </ProgressLink>
                  {" · "}
                  <strong>{booking.application.name}</strong> · {formatDate(booking.fromDate)} →{" "}
                  {formatDate(booking.toDate)}
                  {booking.bookedBy && <span className="opacity-65"> · Booked by {booking.bookedBy}</span>}
                  {booking.team && <span className="opacity-65"> · Team {booking.team}</span>}
                  {booking.purpose && <span className="opacity-65"> · {booking.purpose}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyHint>No environment bookings are linked to this release.</EmptyHint>
          )}
        </div>
      </DetailSection>

      <DetailSection
        icon={CheckCircle2}
        tone="emerald"
        title="Sign-offs & approvals"
        description="Every formal gate that must clear before the deployment decision can safely move to Go."
      >
        <DetailFieldGrid cols={2}>
          <DetailField
            label="Approval Status"
            value={<StatusChip label={String(dash(release.approvalStatus))} tone={statusTone(release.approvalStatus)} />}
          />
          <DetailField
            label="Rollback Plan"
            value={<StatusChip label={String(dash(release.rollbackPlan))} tone={statusTone(release.rollbackPlan)} />}
          />
        </DetailFieldGrid>
        <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          <SignoffChip label="Dev sign-off" done={signalDone(release.devSignoff)} />
          <SignoffChip label="Test sign-off" done={signalDone(release.testSignoff)} />
          <SignoffChip label="UAT sign-off" done={signalDone(release.uatSignoff)} />
          <SignoffChip label="Security clearance" done={signalDone(release.securityClearance)} />
          <SignoffChip label="Dress rehearsal" done={signalDone(release.dressRehearsal)} />
          <div className="rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-white/5">
            <ScoreBar
              value={release.goLiveChecklistPercent ?? 0}
              asPercent
              label={release.goLiveChecklistPercent == null ? "Checklist not set" : "Go-live checklist"}
            />
          </div>
        </div>
      </DetailSection>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DetailSection
          icon={Megaphone}
          tone="amber"
          title="Communications & training"
          description="Human readiness across hypercare, stakeholder messaging, and enablement."
        >
          <DetailFieldGrid cols={3}>
            <DetailField label="Hypercare Plan" value={dash(release.hypercarePlan)} />
            <DetailField label="Comms Plan" value={dash(release.commsPlan)} />
            <DetailField label="Training Status" value={dash(release.trainingStatus)} />
          </DetailFieldGrid>
        </DetailSection>

        <DetailSection
          icon={Users}
          tone="indigo"
          title="Stakeholders & contacts"
          description="Accountability, interested parties, and regulatory context."
        >
          <DetailFieldGrid cols={3}>
            <DetailField label="Release Owner" value={dash(ownerDisplay)} />
            <DetailField label="Stakeholder IDs" value={<span className="font-mono text-xs">{stakeholderIds}</span>} />
            <DetailField label="Regulatory" value={dash(release.regulatory)} />
          </DetailFieldGrid>
        </DetailSection>
      </div>

      <DetailSection
        icon={FileText}
        tone="amber"
        title="Release notes"
        description="Additional context for CAB, deployment teams, and the release audit record."
      >
        {release.notes ? (
          <TintedCallout tone="amber">{release.notes}</TintedCallout>
        ) : (
          <EmptyHint>No additional release notes have been recorded.</EmptyHint>
        )}
      </DetailSection>

      <StakeholderCommsPanel releaseId={id} releaseCode={release.releaseCode} />

      <div id="drift">
        <DetailSection
          icon={GitCompareArrows}
          tone="sky"
          title="Release drift"
          description="Changes between planned and current delivery state that need review."
        >
          <DbReleaseDriftList releaseId={id} embedded />
        </DetailSection>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <DetailSection
          icon={Zap}
          tone="indigo"
          title="Quick actions"
          description="Jump to the operational views most relevant to this release."
        >
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
        </DetailSection>

        <DetailSection
          icon={History}
          tone="violet"
          title="Audit trail"
          description="Immutable operational history, decisions, status changes, and release notes."
        >
          <div className="space-y-3">
            {canEdit && (
              <div className="flex gap-2">
                <input
                  className={cn(taInput, "rounded-xl")}
                  placeholder="Add an audit note…"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
                <button type="button" className={taBtnSecondary} onClick={addNote}>
                  Add
                </button>
              </div>
            )}
            {release.auditEvents.length ? (
              <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                {release.auditEvents.map((event) => (
                  <div
                    key={event.id}
                    className="rounded-xl bg-slate-50 px-3 py-2.5 text-sm dark:bg-white/5"
                  >
                    <span className="text-[10.5px] text-slate-400 dark:text-white/45">
                      {formatDateTime(event.createdAt)} · {event.actor}
                    </span>
                    <p className="text-slate-700 dark:text-white/75">
                      <span className="font-semibold capitalize">{event.action.replace("_", " ")}</span>
                      {event.detail ? ` — ${event.detail}` : ""}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyHint>No audit events have been recorded for this release.</EmptyHint>
            )}
          </div>
        </DetailSection>
      </div>

      <p className="text-center text-[11px] text-slate-400 dark:text-white/40">
        Release Page v2.0 · Live release, readiness, lifecycle, blocker, booking, and audit data
      </p>

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
        applications={lookups.applications.map((a) => ({
          value: a.id,
          label: a.name,
          departmentId: a.departmentId,
        }))}
        environments={lookups.environments.map((e) => ({
          value: e.name,
          label: e.name,
          applicationId: e.applicationId,
        }))}
        releases={lookups.releases.map((r) => ({
          value: r.id,
          label: r.name ? `${r.releaseCode} — ${r.name}` : r.releaseCode,
        }))}
        onClose={() => setEditOpen(false)}
        onSaved={load}
      />
      <ConfirmDeleteDialog
        open={deleteOpen}
        entityLabel="release"
        entityCode={release.releaseCode}
        busy={deleting}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={remove}
      />
    </DetailPageShell>
  );
}
