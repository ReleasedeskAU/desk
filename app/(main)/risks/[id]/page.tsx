"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  FileText,
  LayoutDashboard,
  List,
  Package,
  Shield,
  ShieldAlert,
  User,
  Zap,
} from "lucide-react";
import {
  EditableDetailShell,
  DetailSection,
  LockedIdField,
  EditableField,
  EditableFieldGrid,
  StatusChip,
  HeroStatusRow,
  TintedCallout,
  ScoreBar,
  RiskMatrix,
  type ChipTone,
} from "@/components/detail/editable";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { useEditableDetail } from "@/hooks/useEditableDetail";
import { useRiskEngineConfig } from "@/hooks/useRiskEngineConfig";
import { canEdit as sessionCanEdit } from "@/lib/auth/roles";
import type { SessionUser } from "@/lib/auth/roles";
import { safeFetchJson } from "@/lib/safe-fetch";
import { formatDate } from "@/lib/utils";
import { taBtnSecondary } from "@/lib/styles";
import { getRiskLevel } from "@/lib/risk-level";
import {
  DEFAULT_RISK_ENGINE_CONFIG,
  simpleRiskLevelLabel,
  scaleAxisValues,
} from "@/lib/risk-engine-config";

type RiskDetail = {
  id: string;
  riskCode: string;
  releaseId: string;
  applicationName: string | null;
  departmentName: string | null;
  category: string;
  description: string;
  likelihood: number;
  impact: number;
  riskScore: number;
  affectedArea: string | null;
  mitigationStrategy: string | null;
  riskOwnerId: string | null;
  status: string;
  notes: string | null;
  release: { id: string; releaseCode: string; name: string; status: string; releaseDate: string };
  riskOwner: { id: string; userId: string; name: string; email: string } | null;
};

type RiskOption = { id: string; riskCode: string };
type DepartmentOption = { id: string; name: string };
type ApplicationOption = { id: string; name: string; departmentId: string };
type ReleaseOption = {
  id: string;
  releaseCode: string;
  departmentId: string;
  applications: { application: { id: string } }[];
};
type UserOption = { id: string; name: string; department?: string };

type RiskDraft = {
  departmentId: string;
  applicationId: string;
  releaseId: string;
  applicationName: string;
  departmentName: string;
  category: string;
  description: string;
  likelihood: string;
  impact: string;
  affectedArea: string;
  mitigationStrategy: string;
  riskOwnerId: string;
  status: string;
  notes: string;
};

const RISK_FIELD_LABELS: Partial<Record<keyof RiskDraft, string>> = {
  departmentId: "Department",
  applicationId: "Application",
  releaseId: "Release",
  category: "Category",
  description: "Description",
  likelihood: "Likelihood",
  impact: "Impact",
  affectedArea: "Affected Area",
  mitigationStrategy: "Mitigation Strategy",
  riskOwnerId: "Risk Owner",
  status: "Status",
  notes: "Notes",
};

const LIKELIHOOD: Record<number, string> = {
  1: "Rare",
  2: "Unlikely",
  3: "Possible",
  4: "Likely",
  5: "Almost Certain",
};

const IMPACT: Record<number, string> = {
  1: "Negligible",
  2: "Minor",
  3: "Moderate",
  4: "Major",
  5: "Catastrophic",
};

function scaleOptions(max: number) {
  return scaleAxisValues(max).map((n) => ({ value: String(n), label: String(n) }));
}

const STATUS_OPTIONS = [
  "Open",
  "Monitoring",
  "Mitigating",
  "In Progress",
  "Escalated",
  "Accepted",
  "Closed",
].map((v) => ({ value: v, label: v }));

function formatScale(n: number, map: Record<number, string>) {
  const label = map[n];
  return label ? `${n} (${label})` : String(n);
}

function riskLevelFromScore(
  score: number,
  config?: import("@/lib/risk-engine-config").RiskEngineConfig
): { label: string; tone: ChipTone; hero: "emerald" | "amber" | "rose" } {
  const cfg = config ?? DEFAULT_RISK_ENGINE_CONFIG;
  const level = getRiskLevel(score, cfg);
  const label = simpleRiskLevelLabel(level, cfg);
  const idx = cfg.simpleBands.findIndex((b) => b.id === level);
  const last = cfg.simpleBands.length - 1;
  if (idx <= 0) return { label, tone: "good", hero: "emerald" };
  if (idx >= last) return { label, tone: "bad", hero: "rose" };
  return { label, tone: "warn", hero: "amber" };
}

function statusTone(status: string): ChipTone {
  const s = status.toLowerCase();
  if (s.includes("escalat") || s.includes("open")) return "bad";
  if (s.includes("progress") || s.includes("mitigat") || s.includes("monitor")) return "warn";
  if (s.includes("accept") || s.includes("closed") || s.includes("resolv")) return "good";
  return "neutral";
}

function toDraft(
  row: RiskDetail,
  departments: DepartmentOption[],
  applications: ApplicationOption[],
): RiskDraft {
  const deptByName = departments.find((d) => d.name === row.departmentName);
  const app =
    applications.find(
      (a) =>
        a.name === row.applicationName &&
        (!deptByName || a.departmentId === deptByName.id),
    ) ?? applications.find((a) => a.name === row.applicationName);
  return {
    departmentId: deptByName?.id ?? app?.departmentId ?? "",
    applicationId: app?.id ?? "",
    releaseId: row.releaseId,
    applicationName: row.applicationName ?? "",
    departmentName: row.departmentName ?? "",
    category: row.category,
    description: row.description,
    likelihood: String(row.likelihood),
    impact: String(row.impact),
    affectedArea: row.affectedArea ?? "",
    mitigationStrategy: row.mitigationStrategy ?? "",
    riskOwnerId: row.riskOwnerId ?? "",
    status: row.status,
    notes: row.notes ?? "",
  };
}

export default function RiskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { config: riskConfig } = useRiskEngineConfig();
  const [row, setRow] = useState<RiskDetail | null>(null);
  const [options, setOptions] = useState<RiskOption[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [applications, setApplications] = useState<ApplicationOption[]>([]);
  const [releases, setReleases] = useState<ReleaseOption[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(() => new Date());

  const load = useCallback(async (signal?: AbortSignal) => {
    const [detail, list, deptList, appList, releaseList, userList, me] = await Promise.all([
      safeFetchJson<RiskDetail>(`/api/risks/${id}`, {
        signal,
        label: "risk-detail",
        rejectHttpErrors: false,
      }),
      safeFetchJson<RiskOption[]>("/api/risks", { signal, label: "risks-list" }),
      safeFetchJson<DepartmentOption[]>("/api/departments", { signal, label: "departments-list" }),
      safeFetchJson<ApplicationOption[]>("/api/applications", { signal, label: "applications-list" }),
      safeFetchJson<ReleaseOption[]>("/api/releases", { signal, label: "releases-list" }),
      safeFetchJson<UserOption[]>("/api/users", { signal, label: "users-list" }),
      safeFetchJson<{ user: SessionUser }>("/api/auth/me", { signal, label: "auth-me" }),
    ]);
    if (signal?.aborted) return;
    setRow(detail.ok && detail.status < 300 ? detail.data : null);
    setOptions(list.ok ? list.data.map((r) => ({ id: r.id, riskCode: r.riskCode })) : []);
    setDepartments(deptList.ok ? deptList.data.map((d) => ({ id: d.id, name: d.name })) : []);
    setApplications(
      appList.ok
        ? appList.data.map((a) => ({ id: a.id, name: a.name, departmentId: a.departmentId }))
        : [],
    );
    setReleases(
      releaseList.ok
        ? releaseList.data.map((r) => ({
            id: r.id,
            releaseCode: r.releaseCode,
            departmentId: r.departmentId,
            applications: Array.isArray(r.applications) ? r.applications : [],
          }))
        : [],
    );
    setUsers(
      userList.ok
        ? userList.data.map((u) => ({ id: u.id, name: u.name, department: u.department }))
        : [],
    );
    if (me.ok) setUser(me.data.user);
    setLastRefresh(new Date());
    setLoading(false);
  }, [id]);

  useEffect(() => {
    const ac = new AbortController();
    void load(ac.signal);
    return () => ac.abort();
  }, [load]);

  const source = useMemo(
    () => (row ? toDraft(row, departments, applications) : null),
    [row, departments, applications],
  );
  const edit = useEditableDetail(source);
  const canEdit = sessionCanEdit(user);
  const v = edit.values;
  const d = edit.draft;

  const selectOptions = useMemo(
    () =>
      [...options]
        .sort((a, b) => a.riskCode.localeCompare(b.riskCode, undefined, { numeric: true }))
        .map((o) => ({ value: o.id, label: o.riskCode })),
    [options]
  );

  const departmentOptions = useMemo(
    () =>
      [...departments]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((d) => ({ value: d.id, label: d.name })),
    [departments],
  );

  const filteredApplications = useMemo(() => {
    const deptId = d?.departmentId ?? v?.departmentId ?? "";
    return applications.filter((a) => a.departmentId === deptId);
  }, [applications, d?.departmentId, v?.departmentId]);

  const applicationOptions = useMemo(() => {
    const opts = [...filteredApplications]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((a) => ({ value: a.id, label: a.name }));
    const appId = d?.applicationId ?? v?.applicationId;
    if (appId && !opts.some((o) => o.value === appId)) {
      const current = applications.find((a) => a.id === appId);
      if (current) opts.unshift({ value: current.id, label: current.name });
    }
    return opts;
  }, [filteredApplications, applications, d?.applicationId, v?.applicationId]);

  const filteredReleases = useMemo(() => {
    const deptId = d?.departmentId ?? v?.departmentId ?? "";
    const appId = d?.applicationId ?? v?.applicationId ?? "";
    return releases.filter(
      (r) =>
        r.departmentId === deptId &&
        r.applications.some((link) => link.application.id === appId),
    );
  }, [releases, d?.departmentId, d?.applicationId, v?.departmentId, v?.applicationId]);

  const releaseOptions = useMemo(() => {
    const opts = [...filteredReleases]
      .sort((a, b) => a.releaseCode.localeCompare(b.releaseCode, undefined, { numeric: true }))
      .map((r) => ({ value: r.id, label: r.releaseCode }));
    const releaseId = d?.releaseId ?? row?.releaseId;
    if (releaseId && !opts.some((o) => o.value === releaseId)) {
      const current = releases.find((r) => r.id === releaseId);
      opts.unshift({
        value: releaseId,
        label: current?.releaseCode ?? row?.release?.releaseCode ?? releaseId,
      });
    }
    return opts;
  }, [filteredReleases, releases, d?.releaseId, row?.releaseId, row?.release?.releaseCode]);

  const ownerOptions = useMemo(() => {
    const deptName = (
      departments.find((dept) => dept.id === (d?.departmentId ?? v?.departmentId))?.name ?? ""
    ).toLowerCase();
    const scoped = deptName
      ? users.filter((u) => (u.department ?? "").toLowerCase() === deptName)
      : users;
    const opts = [...scoped]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((u) => ({ value: u.id, label: u.name }));
    if (row?.riskOwner && !opts.some((o) => o.value === row.riskOwner!.id)) {
      opts.unshift({ value: row.riskOwner.id, label: row.riskOwner.name });
    }
    return [{ value: "", label: "— Unassigned —" }, ...opts];
  }, [users, departments, d?.departmentId, v?.departmentId, row?.riskOwner]);

  const statusOptions = useMemo(() => {
    const set = new Set(STATUS_OPTIONS.map((o) => o.value));
    if (row?.status && !set.has(row.status)) {
      return [{ value: row.status, label: row.status }, ...STATUS_OPTIONS];
    }
    return STATUS_OPTIONS;
  }, [row?.status]);

  const save = async () => {
    if (!row || !edit.draft) return;
    edit.setSaving(true);
    edit.setError(null);
    const draft = edit.draft;
    if (!draft.departmentId || !draft.applicationId || !draft.releaseId) {
      edit.setSaving(false);
      edit.setError("Department, Application, and Release are required.");
      return;
    }
    const res = await safeFetchJson(`/api/risks/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        releaseId: draft.releaseId,
        applicationId: draft.applicationId,
        category: draft.category,
        description: draft.description,
        likelihood: Number(draft.likelihood),
        impact: Number(draft.impact),
        affectedArea: draft.affectedArea || null,
        mitigationStrategy: draft.mitigationStrategy || null,
        riskOwnerId: draft.riskOwnerId || null,
        status: draft.status,
        notes: draft.notes || null,
      }),
      label: "risk-patch",
      rejectHttpErrors: false,
    });
    edit.setSaving(false);
    if (!res.ok || res.status >= 300) {
      const message =
        res.ok && res.data && typeof res.data === "object" && "error" in res.data
          ? String((res.data as { error?: string }).error || "")
          : "";
      edit.setError(message || "Couldn’t save changes. Try again.");
      return;
    }
    edit.completeSaveSuccess(RISK_FIELD_LABELS);
    await load();
  };

  const remove = async () => {
    if (!row) return;
    edit.setDeleting(true);
    const res = await safeFetchJson(`/api/risks/${row.id}`, {
      method: "DELETE",
      label: "risk-delete",
      rejectHttpErrors: false,
    });
    edit.setDeleting(false);
    if (!res.ok || res.status >= 300) {
      edit.setError("Couldn’t delete this risk.");
      edit.setDeleteOpen(false);
      return;
    }
    router.push("/risks");
  };

  if (loading) return <p className="text-slate-500 dark:text-white/60">Loading risk…</p>;
  if (!row || !v) return <p className="text-slate-500 dark:text-white/60">Risk not found.</p>;

  const likelihoodNum = Number(v.likelihood) || 0;
  const impactNum = Number(v.impact) || 0;
  const liveScore = likelihoodNum * impactNum;
  const maxScore = riskConfig.likelihoodMax * riskConfig.impactMax;
  const scorePct = Math.max(0, Math.min(100, (liveScore / maxScore) * 100));
  const level = riskLevelFromScore(liveScore, riskConfig);
  const openish = !/accept|closed|resolv/i.test(v.status);
  const leaveMatch = v.notes.match(/LV-\d+/i)?.[0];
  const selectedRelease = releases.find((r) => r.id === v.releaseId);
  const selectedApp = applications.find((a) => a.id === v.applicationId);
  const selectedDept = departments.find((dept) => dept.id === v.departmentId);
  const selectedOwner = users.find((u) => u.id === v.riskOwnerId) ?? row.riskOwner;

  return (
    <EditableDetailShell
      pageTitle="Risk Detail"
      pageDescription="Likelihood × impact exposure on a release — left unmitigated, high scores threaten the deployment window and force last-minute coverage decisions."
      entityLabel="Risk"
      entityCode={row.riskCode}
      entityName={v.category || row.riskCode}
      selectLabel="Select Risk"
      selectValue={row.id}
      selectOptions={selectOptions}
      onSelectChange={(next) => next !== row.id && router.push(`/risks/${next}`)}
      lastRefresh={lastRefresh}
      footer="Risk Page v2.0 · Likelihood × Impact · Risk ID is locked · Score recomputed on save"
      editing={edit.editing}
      canEdit={canEdit}
      saving={edit.saving}
      deleting={edit.deleting}
      editError={edit.error}
      onEdit={edit.startEdit}
      onDiscard={edit.discard}
      onSave={save}
      deleteOpen={edit.deleteOpen}
      onDeleteOpen={() => edit.setDeleteOpen(true)}
      onDeleteCancel={() => edit.setDeleteOpen(false)}
      onDeleteConfirm={remove}
      lockedIdLabel="Risk ID"
      successChanges={edit.successChanges}
      onSuccessDismiss={edit.dismissSuccess}
      editForm={
        d ? (
          <EditableFieldGrid cols={2}>
            <EditableField
              label="Status"
              value={d.status}
              editing
              kind="select"
              options={statusOptions}
              onChange={(n) => edit.setField("status", n)}
            />
            <EditableField
              label="Category"
              value={d.category}
              editing
              onChange={(n) => edit.setField("category", n)}
            />
            <EditableField
              label="Likelihood"
              value={d.likelihood}
              editing
              kind="select"
              options={scaleOptions(riskConfig.likelihoodMax)}
              onChange={(n) => edit.setField("likelihood", n)}
            />
            <EditableField
              label="Impact"
              value={d.impact}
              editing
              kind="select"
              options={scaleOptions(riskConfig.impactMax)}
              onChange={(n) => edit.setField("impact", n)}
            />
            <EditableField
              label="Department"
              value={d.departmentId}
              editing
              kind="select"
              options={departmentOptions}
              onChange={(n) =>
                edit.patchDraft({
                  departmentId: n,
                  applicationId: "",
                  releaseId: "",
                  riskOwnerId: "",
                  departmentName: departments.find((dept) => dept.id === n)?.name ?? "",
                  applicationName: "",
                })
              }
            />
            <EditableField
              label="Application"
              value={d.applicationId}
              editing
              kind="select"
              options={applicationOptions}
              onChange={(n) =>
                edit.patchDraft({
                  applicationId: n,
                  releaseId: "",
                  applicationName: applications.find((a) => a.id === n)?.name ?? "",
                })
              }
            />
            <EditableField
              label="Release"
              value={d.releaseId}
              editing
              kind="select"
              options={releaseOptions}
              onChange={(n) => edit.setField("releaseId", n)}
            />
            <EditableField
              label="Affected Area"
              value={d.affectedArea}
              editing
              onChange={(n) => edit.setField("affectedArea", n)}
              placeholder="Area impacted…"
            />
            <EditableField
              label="Risk Owner"
              value={d.riskOwnerId}
              editing
              kind="select"
              options={ownerOptions}
              onChange={(n) => edit.setField("riskOwnerId", n)}
            />
            <EditableField
              label="Description"
              value={d.description}
              editing
              kind="textarea"
              onChange={(n) => edit.setField("description", n)}
              placeholder="Risk description…"
              className="sm:col-span-2"
            />
            <EditableField
              label="Mitigation Strategy"
              value={d.mitigationStrategy}
              editing
              kind="textarea"
              onChange={(n) => edit.setField("mitigationStrategy", n)}
              placeholder="How this risk will be mitigated…"
              className="sm:col-span-2"
            />
            <EditableField
              label="Notes"
              value={d.notes}
              editing
              kind="textarea"
              onChange={(n) => edit.setField("notes", n)}
              placeholder="Notes…"
              className="sm:col-span-2"
            />
          </EditableFieldGrid>
        ) : null
      }
      relatedLinks={
        <>
          <ProgressLink href={`/releases/${v.releaseId || row.release.id}`} className={taBtnSecondary + " text-sm !py-2"}>
            <Package className="mr-1.5 inline h-4 w-4" aria-hidden />
            View Release
          </ProgressLink>
          <ProgressLink
            href={leaveMatch ? `/leaves/${encodeURIComponent(leaveMatch)}` : "/leaves"}
            className={taBtnSecondary + " text-sm !py-2"}
          >
            <LayoutDashboard className="mr-1.5 inline h-4 w-4" aria-hidden />
            View Leave
          </ProgressLink>
          <ProgressLink href="/risks" className={taBtnSecondary + " text-sm !py-2"}>
            <List className="mr-1.5 inline h-4 w-4" aria-hidden />
            All Risks
          </ProgressLink>
        </>
      }
    >
      <HeroStatusRow
        hero={{
          icon: Zap,
          label: "Status",
          value: v.status,
          tone: openish ? "amber" : "emerald",
        }}
        secondary={{
          icon: AlertTriangle,
          label: "Category",
          value: v.category || "—",
        }}
        metric={{
          icon: ShieldAlert,
          label: "Risk Score",
          percent: scorePct,
          caption: `${liveScore}/25 · ${level.label}`,
          tone: level.hero,
        }}
      />

      <DetailSection
        icon={ShieldAlert}
        tone="rose"
        title="Risk status"
        description="Current exposure band and whether this item still needs active mitigation."
      >
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <StatusChip
            label={openish ? "⚠️ OPEN EXPOSURE" : "✓ CONTAINED"}
            tone={openish ? "bad" : "good"}
          />
          <StatusChip label={level.label} tone={level.tone} />
          <StatusChip label={v.status} tone={statusTone(v.status)} />
        </div>
        <EditableFieldGrid cols={3}>
          <LockedIdField label="Risk ID" value={row.riskCode} />
          <EditableField
            label="Status"
            value={v.status}
            editing={false}
            display={<StatusChip label={v.status} tone={statusTone(v.status)} />}
          />
          <EditableField label="Category" value={v.category} editing={false} />
        </EditableFieldGrid>
      </DetailSection>

      <DetailSection
        icon={AlertTriangle}
        tone="amber"
        title="Exposure matrix"
        description={`Likelihood × impact drives the stored score (max ${maxScore}). Changing either scale updates the preview immediately.`}
      >
        <div className="mb-4 grid items-stretch gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
          <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4 dark:border-white/5 dark:bg-white/[0.03]">
            <RiskMatrix
              likelihood={likelihoodNum}
              impact={impactNum}
              likelihoodMax={riskConfig.likelihoodMax}
              impactMax={riskConfig.impactMax}
              config={riskConfig}
            />
          </div>
          <div className="space-y-3">
            <div className="rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-white/5">
              <ScoreBar value={liveScore} max={maxScore} label={`${level.label} exposure`} />
            </div>
            <EditableFieldGrid>
              <EditableField
                label="Likelihood"
                value={v.likelihood}
                editing={false}
                display={formatScale(likelihoodNum, LIKELIHOOD)}
              />
              <EditableField
                label="Impact"
                value={v.impact}
                editing={false}
                display={formatScale(impactNum, IMPACT)}
              />
            </EditableFieldGrid>
          </div>
        </div>
      </DetailSection>

      <DetailSection
        icon={Package}
        tone="sky"
        title="Associated release"
        description="Which release carries this exposure and the org context around it."
      >
        <EditableFieldGrid>
          <EditableField
            label="Release"
            value={v.releaseId}
            editing={false}
            display={
              <ProgressLink
                href={`/releases/${v.releaseId || row.release.id}`}
                className="font-mono text-[13.5px] font-semibold text-sky-600 hover:underline dark:text-sky-300"
              >
                {selectedRelease?.releaseCode ?? row.release.releaseCode}
              </ProgressLink>
            }
          />
          <EditableField
            label="Release Name"
            value={row.release.name}
            editing={false}
            display={
              v.releaseId === row.releaseId
                ? row.release.name
                : (selectedRelease?.releaseCode ?? "—")
            }
          />
          <EditableField
            label="Prod Date"
            value={row.release.releaseDate}
            editing={false}
            display={
              v.releaseId === row.releaseId ? formatDate(row.release.releaseDate) : "—"
            }
          />
          <EditableField
            label="Application"
            value={v.applicationName}
            editing={false}
            display={selectedApp?.name ?? v.applicationName ?? "—"}
          />
          <EditableField
            label="Department"
            value={v.departmentName}
            editing={false}
            display={selectedDept?.name ?? v.departmentName ?? "—"}
          />
          <EditableField label="Affected Area" value={v.affectedArea} editing={false} />
        </EditableFieldGrid>
      </DetailSection>

      <DetailSection
        icon={FileText}
        tone="violet"
        title="Risk details"
        description="What can go wrong, and how owners should describe it in CAB and stand-ups."
      >
        <>
          <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">
            Description
          </p>
          <TintedCallout tone="amber">
            {v.description.trim() || "No description recorded."}
          </TintedCallout>
        </>
      </DetailSection>

      <DetailSection
        icon={Shield}
        tone="emerald"
        title="Mitigation & ownership"
        description="Who owns the risk and what strategy keeps exposure from becoming a blocker."
      >
        <EditableFieldGrid>
          <EditableField
            label="Risk Owner"
            value={v.riskOwnerId}
            editing={false}
            display={selectedOwner?.name ?? "—"}
          />
          <EditableField
            label="Owner ID"
            value={row.riskOwner?.userId ?? ""}
            editing={false}
            display={
              v.riskOwnerId === (row.riskOwnerId ?? "")
                ? (row.riskOwner?.userId ?? "—")
                : "—"
            }
          />
        </EditableFieldGrid>
        <div className="mt-4">
          <>
            <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">
              Mitigation Strategy
            </p>
            <TintedCallout tone="emerald">
              {v.mitigationStrategy.trim() || "No mitigation strategy recorded yet."}
            </TintedCallout>
          </>
        </div>
      </DetailSection>

      <DetailSection
        icon={User}
        tone="amber"
        title="Notes"
        description="Extra context for reviewers — leave codes, coverage plans, or follow-ups."
      >
        <TintedCallout tone="amber">
          {v.notes.trim() ? v.notes : "No notes recorded yet."}
        </TintedCallout>
      </DetailSection>
    </EditableDetailShell>
  );
}
