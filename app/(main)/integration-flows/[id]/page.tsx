"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeftRight,
  Database,
  FileText,
  List,
  Network,
  Plug,
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
  EntityConnection,
  type ChipTone,
} from "@/components/detail/editable";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { useEditableDetail } from "@/hooks/useEditableDetail";
import { canEdit as sessionCanEdit } from "@/lib/auth/roles";
import type { SessionUser } from "@/lib/auth/roles";
import { safeFetchJson } from "@/lib/safe-fetch";
import { taBtnSecondary } from "@/lib/styles";

type FlowDetail = {
  id: string;
  flowCode: string;
  sourceSystem: string;
  targetSystem: string;
  integrationType: string;
  frequency: string;
  dataElements: string;
  businessPurpose: string;
};

type FlowOption = { id: string; flowCode: string; sourceSystem?: string };

type FlowDraft = {
  sourceSystem: string;
  targetSystem: string;
  integrationType: string;
  frequency: string;
  dataElements: string;
  businessPurpose: string;
};

const FLOW_FIELD_LABELS: Partial<Record<keyof FlowDraft, string>> = {
  sourceSystem: "Source System",
  targetSystem: "Target System",
  integrationType: "Integration Type",
  frequency: "Frequency",
  dataElements: "Data Elements",
  businessPurpose: "Business Purpose",
};

function typeTone(integrationType: string): ChipTone {
  const t = integrationType.toLowerCase();
  if (t.includes("real") || t.includes("sync") || t.includes("api")) return "info";
  if (t.includes("batch") || t.includes("file")) return "neutral";
  if (t.includes("event") || t.includes("stream")) return "warn";
  return "neutral";
}

function typeHeroTone(integrationType: string): "indigo" | "sky" | "violet" | "amber" {
  const t = typeTone(integrationType);
  if (t === "info") return "sky";
  if (t === "warn") return "amber";
  return "indigo";
}

/** Rough connectivity weight from how many distinct systems the flow touches. */
function systemsPercent(source: string, target: string): number {
  const names = [source.trim(), target.trim()].filter(Boolean);
  if (names.length === 0) return 0;
  const unique = new Set(names.map((n) => n.toLowerCase()));
  if (unique.size >= 2) return 100;
  return 50;
}

function toDraft(row: FlowDetail): FlowDraft {
  return {
    sourceSystem: row.sourceSystem ?? "",
    targetSystem: row.targetSystem ?? "",
    integrationType: row.integrationType ?? "",
    frequency: row.frequency ?? "",
    dataElements: row.dataElements ?? "",
    businessPurpose: row.businessPurpose ?? "",
  };
}

export default function IntegrationFlowDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [row, setRow] = useState<FlowDetail | null>(null);
  const [options, setOptions] = useState<FlowOption[]>([]);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(() => new Date());

  const load = useCallback(async (signal?: AbortSignal) => {
    const [detail, list, me] = await Promise.all([
      safeFetchJson<FlowDetail>(`/api/integration-flows/${id}`, {
        signal,
        label: "integration-flow-detail",
        rejectHttpErrors: false,
      }),
      safeFetchJson<FlowOption[]>("/api/integration-flows", {
        signal,
        label: "integration-flows-list",
      }),
      safeFetchJson<{ user: SessionUser }>("/api/auth/me", { signal, label: "auth-me" }),
    ]);
    if (signal?.aborted) return;
    setRow(detail.ok && detail.status < 300 ? detail.data : null);
    setOptions(
      list.ok
        ? list.data.map((f) => ({
            id: f.id,
            flowCode: f.flowCode,
            sourceSystem: f.sourceSystem,
          }))
        : []
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

  const source = useMemo(() => (row ? toDraft(row) : null), [row]);
  const edit = useEditableDetail(source);
  const canEdit = sessionCanEdit(user);
  const v = edit.values;
  const d = edit.draft;

  const selectOptions = useMemo(
    () =>
      [...options]
        .sort((a, b) => a.flowCode.localeCompare(b.flowCode, undefined, { numeric: true }))
        .map((o) => ({
          value: o.id,
          label: o.sourceSystem ? `${o.flowCode} · ${o.sourceSystem}` : o.flowCode,
        })),
    [options]
  );

  const save = async () => {
    if (!row || !edit.draft) return;
    edit.setSaving(true);
    edit.setError(null);
    const draft = edit.draft;
    // flowCode is immutable — never include it in the PATCH body.
    const res = await safeFetchJson(`/api/integration-flows/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceSystem: draft.sourceSystem.trim(),
        targetSystem: draft.targetSystem.trim(),
        integrationType: draft.integrationType.trim(),
        frequency: draft.frequency.trim(),
        dataElements: draft.dataElements.trim(),
        businessPurpose: draft.businessPurpose.trim(),
      }),
      label: "integration-flow-patch",
      rejectHttpErrors: false,
    });
    edit.setSaving(false);
    if (!res.ok || res.status >= 300) {
      edit.setError("Couldn’t save changes. Try again.");
      return;
    }
    edit.completeSaveSuccess(FLOW_FIELD_LABELS);
    await load();
  };

  const remove = async () => {
    if (!row) return;
    edit.setDeleting(true);
    const res = await safeFetchJson(`/api/integration-flows/${row.id}`, {
      method: "DELETE",
      label: "integration-flow-delete",
      rejectHttpErrors: false,
    });
    edit.setDeleting(false);
    if (!res.ok || res.status >= 300) {
      edit.setError("Couldn’t delete this integration flow.");
      edit.setDeleteOpen(false);
      return;
    }
    router.push("/integration-flows");
  };

  if (loading) {
    return <p className="text-slate-500 dark:text-white/60">Loading integration flow…</p>;
  }
  if (!row || !v) {
    return <p className="text-slate-500 dark:text-white/60">Integration flow not found.</p>;
  }

  const uniqueSystems = new Set(
    [v.sourceSystem.trim(), v.targetSystem.trim()]
      .filter(Boolean)
      .map((n) => n.toLowerCase())
  ).size;
  const systemsPct = systemsPercent(v.sourceSystem, v.targetSystem);

  return (
    <EditableDetailShell
      pageTitle="Integration Detail"
      pageDescription="System-to-system data path — source, target, type, and frequency show what breaks if either side is unavailable during a release."
      entityLabel="Integration"
      entityCode={row.flowCode}
      entityName={
        v.sourceSystem && v.targetSystem
          ? `${v.sourceSystem} → ${v.targetSystem}`
          : row.flowCode
      }
      selectLabel="Select Integration"
      selectValue={row.id}
      selectOptions={selectOptions}
      onSelectChange={(next) => next !== row.id && router.push(`/integration-flows/${next}`)}
      lastRefresh={lastRefresh}
      footer="Integration Page v2.0 · System mapping · Integration ID is locked"
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
      lockedIdLabel="Integration ID"
      successChanges={edit.successChanges}
      onSuccessDismiss={edit.dismissSuccess}
      editForm={
        d ? (
          <EditableFieldGrid cols={2}>
            <EditableField
              label="Source System"
              value={d.sourceSystem}
              editing
              onChange={(n) => edit.setField("sourceSystem", n)}
              placeholder="Source system…"
            />
            <EditableField
              label="Target System"
              value={d.targetSystem}
              editing
              onChange={(n) => edit.setField("targetSystem", n)}
              placeholder="Target system…"
            />
            <EditableField
              label="Integration Type"
              value={d.integrationType}
              editing
              onChange={(n) => edit.setField("integrationType", n)}
              placeholder="e.g. API, Batch…"
            />
            <EditableField
              label="Frequency"
              value={d.frequency}
              editing
              onChange={(n) => edit.setField("frequency", n)}
              placeholder="e.g. Real-time, Daily…"
            />
            <EditableField
              label="Data Elements"
              value={d.dataElements}
              editing
              kind="textarea"
              onChange={(n) => edit.setField("dataElements", n)}
              placeholder="Key data elements…"
              className="sm:col-span-2"
            />
            <EditableField
              label="Business Purpose"
              value={d.businessPurpose}
              editing
              kind="textarea"
              onChange={(n) => edit.setField("businessPurpose", n)}
              placeholder="Why this integration matters…"
              className="sm:col-span-2"
            />
          </EditableFieldGrid>
        ) : null
      }
      relatedLinks={
        <>
          <ProgressLink href="/integration-flows" className={taBtnSecondary + " text-sm !py-2"}>
            <Network className="mr-1.5 inline h-4 w-4" aria-hidden />
            Integration Map
          </ProgressLink>
          <ProgressLink href="/dependencies" className={taBtnSecondary + " text-sm !py-2"}>
            <Plug className="mr-1.5 inline h-4 w-4" aria-hidden />
            View Dependencies
          </ProgressLink>
          <ProgressLink href="/integration-flows" className={taBtnSecondary + " text-sm !py-2"}>
            <List className="mr-1.5 inline h-4 w-4" aria-hidden />
            All Integrations
          </ProgressLink>
        </>
      }
    >
      <HeroStatusRow
        hero={{
          icon: ArrowLeftRight,
          label: "Type",
          value: v.integrationType.trim() || "—",
          tone: typeHeroTone(v.integrationType),
        }}
        secondary={{
          icon: Zap,
          label: "Frequency",
          value: v.frequency.trim() || "—",
        }}
        metric={{
          icon: Network,
          label: "Systems",
          percent: systemsPct,
          caption:
            uniqueSystems === 0
              ? "no systems recorded"
              : uniqueSystems === 1
                ? "1 system recorded"
                : `${uniqueSystems} systems linked`,
          tone: uniqueSystems >= 2 ? "emerald" : "amber",
        }}
      />

      <DetailSection
        icon={Network}
        tone="sky"
        title="Data path"
        description="Directional link between systems — if either side is down, this flow stops."
      >
        <EntityConnection
          source={v.sourceSystem.trim() || "—"}
          target={v.targetSystem.trim() || "—"}
          caption={`${v.integrationType.trim() || "Type n/a"} · ${v.frequency.trim() || "Frequency n/a"}`}
        />
      </DetailSection>

      <DetailSection
        icon={Plug}
        tone="indigo"
        title="Systems"
        description="Source and target endpoints for this integration."
      >
        <EditableFieldGrid cols={3}>
          <LockedIdField label="Integration ID" value={row.flowCode} />
          <EditableField label="Source System" value={v.sourceSystem} editing={false} />
          <EditableField label="Target System" value={v.targetSystem} editing={false} />
          <EditableField
            label="Integration Type"
            value={v.integrationType}
            editing={false}
            display={
              v.integrationType.trim() ? (
                <StatusChip label={v.integrationType} tone={typeTone(v.integrationType)} />
              ) : (
                "—"
              )
            }
          />
          <EditableField label="Frequency" value={v.frequency} editing={false} />
        </EditableFieldGrid>
      </DetailSection>

      <DetailSection
        icon={Database}
        tone="violet"
        title="Data exchanged"
        description="Which data elements move across this path and matter for release impact."
      >
        <TintedCallout tone="violet">
          {v.dataElements.trim() ? v.dataElements : "No data elements recorded."}
        </TintedCallout>
      </DetailSection>

      <DetailSection
        icon={FileText}
        tone="amber"
        title="Notes"
        description="Business purpose — why this integration exists and what fails without it."
      >
        <TintedCallout tone="amber">
          {v.businessPurpose.trim() ? v.businessPurpose : "No business purpose recorded yet."}
        </TintedCallout>
      </DetailSection>
    </EditableDetailShell>
  );
}
