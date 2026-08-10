"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronRight,
  Eye,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import {
  CONNECTOR_TYPES,
  POLL_INTERVAL_OPTIONS,
  getConnectorTypeDef,
  statusBadge,
  type ConnectorTypeId,
} from "@/lib/connectors/types";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import {
  CONNECTOR_DATA_TYPES,
  dataTypesFromConfig,
  defaultDataTypesForType,
} from "@/lib/connectorDataTypes";
import type { ConnectorPublic } from "@/lib/connectors/public";
import { WebhookConnectorsSection } from "@/components/connectors/WebhookConnectorsSection";
import { SyncedWorkItemsSection } from "@/components/connectors/SyncedWorkItemsSection";

type SyncLog = {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  recordsSynced: number | null;
  errorMessage: string | null;
};

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

function typeLabel(type: string): string {
  return getConnectorTypeDef(type)?.label ?? type;
}

function TypeIcon({ type }: { type: string }) {
  const colors: Record<string, string> = {
    jira: "bg-[#F4F5F7] text-[#0052CC]",
    github: "bg-gray-900 text-white",
    jenkins: "bg-[#D33833] text-white",
    servicenow: "bg-[#E8F5E9] text-[#2E7D32]",
    sonarqube: "bg-[#E8F0FE] text-[#326CE5]",
  };
  const label = typeLabel(type).charAt(0).toUpperCase();
  return (
    <div
      className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold ${colors[type] ?? "bg-gray-100 text-gray-700"}`}
    >
      {label}
    </div>
  );
}

export default function ConnectorsPageContent() {
  const [connectors, setConnectors] = useState<ConnectorPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editConnector, setEditConnector] = useState<ConnectorPublic | null>(null);
  const [logsConnector, setLogsConnector] = useState<ConnectorPublic | null>(null);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [errorDetail, setErrorDetail] = useState<{ name: string; message: string } | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  /** Bumps after Sync Now so the Synced Work Items demo table reloads. */
  const [workItemsRefreshKey, setWorkItemsRefreshKey] = useState(0);

  const loadConnectors = useCallback(async () => {
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const res = await fetch("/api/connectors", { signal: controller.signal });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Could not load connectors (${res.status})`);
      }
      setConnectors(await res.json());
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        setError("Request timed out. Check that the dev server is running and try refreshing.");
      } else {
        setError(e instanceof Error ? e.message : "Failed to load connectors");
      }
    } finally {
      window.clearTimeout(timeout);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConnectors();
  }, [loadConnectors]);

  const openLogs = async (connector: ConnectorPublic) => {
    setLogsConnector(connector);
    setLogsLoading(true);
    try {
      const res = await fetch(`/api/connectors/${connector.id}/logs`);
      if (!res.ok) throw new Error("Could not load logs");
      setLogs(await res.json());
    } catch {
      setLogs([]);
    } finally {
      setLogsLoading(false);
    }
  };

  const syncNow = async (id: string) => {
    setActionId(id);
    try {
      const res = await fetch(`/api/connectors/${id}/sync-now`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        alert(body.error ?? "Sync failed");
        return;
      }
      await loadConnectors();
      setWorkItemsRefreshKey((k) => k + 1);
    } finally {
      setActionId(null);
    }
  };

  const toggleEnabled = async (connector: ConnectorPublic) => {
    setActionId(connector.id);
    try {
      await fetch(`/api/connectors/${connector.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !connector.enabled }),
      });
      await loadConnectors();
    } finally {
      setActionId(null);
    }
  };

  const deleteConnector = async (connector: ConnectorPublic) => {
    if (!confirm(`Delete connector "${connector.name}"? This cannot be undone.`)) return;
    setActionId(connector.id);
    try {
      await fetch(`/api/connectors/${connector.id}`, { method: "DELETE" });
      await loadConnectors();
    } finally {
      setActionId(null);
    }
  };

  return (
    <div className="w-full font-sans pb-24 relative">
      <div className="mb-8 mt-2">
        <div className="flex items-center text-[13px] text-gray-500 font-medium mb-3">
          <span className="hover:text-gray-800 cursor-pointer">Settings</span>
          <ChevronRight className="h-3 w-3 mx-1.5" />
          <span className="text-[#2548C9] font-semibold">Connectors</span>
        </div>

        <div className="flex items-start justify-between">
          <div className="max-w-[700px]">
            <h1 className="text-[32px] font-bold text-[#111827] tracking-tight mb-2">System Connectors</h1>
            <p className="text-[15px] text-gray-500 font-medium leading-relaxed">
              Connect Jira, GitHub, Jenkins, and other tools. Data syncs automatically on a schedule you choose.
            </p>
          </div>
          <button
            onClick={() => {
              setEditConnector(null);
              setWizardOpen(true);
            }}
            className="flex items-center gap-2 rounded-lg bg-[#2548C9] px-6 py-2.5 text-[14px] font-semibold text-white shadow-sm hover:bg-[#1E3A9F] transition-colors"
          >
            <Plus className="h-4 w-4" /> Add Connector
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      {loading ? (
        <TableSkeleton showTitle={false} columns={5} rows={5} showFilterBar={false} />
      ) : (
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 border-b border-gray-200 text-[12px] uppercase tracking-wide text-gray-500 font-semibold">
            <tr>
              <th className="px-5 py-3">Name</th>
              <th className="px-5 py-3">Type</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Last Synced</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {connectors.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-gray-500">
                  No connectors yet. Click &quot;Add Connector&quot; to get started.
                </td>
              </tr>
            ) : (
              connectors.map((c) => {
                const badge = statusBadge(c.status, c.enabled);
                const busy = actionId === c.id;
                return (
                  <tr key={c.id} className="hover:bg-gray-50/50 transition-all duration-200">
                    <td className="border-b border-gray-200 px-5 py-4 font-semibold text-gray-900">{c.name}</td>
                    <td className="border-b border-gray-200 px-5 py-4">
                      <div className="flex items-center gap-2">
                        <TypeIcon type={c.type} />
                        <span>{typeLabel(c.type)}</span>
                      </div>
                    </td>
                    <td className="border-b border-gray-200 px-5 py-4">
                      <button
                        type="button"
                        disabled={!c.lastError}
                        onClick={() =>
                          c.lastError && setErrorDetail({ name: c.name, message: c.lastError })
                        }
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${badge.color} ${c.lastError ? "cursor-pointer hover:opacity-80" : "cursor-default"}`}
                      >
                        <span>{badge.emoji}</span> {badge.label}
                      </button>
                    </td>
                    <td className="border-b border-gray-200 px-5 py-4 text-gray-600">{relativeTime(c.lastSyncedAt as unknown as string)}</td>
                    <td className="border-b border-gray-200 px-5 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          disabled={busy || !c.enabled}
                          onClick={() => syncNow(c.id)}
                          className="text-[#2548C9] hover:underline text-xs font-semibold disabled:opacity-40"
                        >
                          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sync Now"}
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => {
                            setEditConnector(c);
                            setWizardOpen(true);
                          }}
                          className="text-gray-600 hover:text-gray-900 text-xs font-semibold disabled:opacity-40"
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => openLogs(c)}
                          className="text-gray-600 hover:text-gray-900 text-xs font-semibold"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => toggleEnabled(c)}
                          className="text-gray-600 hover:text-gray-900 text-xs font-semibold disabled:opacity-40"
                        >
                          {c.enabled ? "Disable" : "Enable"}
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => deleteConnector(c)}
                          className="text-red-600 hover:text-red-800 disabled:opacity-40"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      )}

      <WebhookConnectorsSection />

      <SyncedWorkItemsSection refreshKey={workItemsRefreshKey} />

      {wizardOpen && (
        <ConnectorWizard
          mode={editConnector ? "edit" : "create"}
          existingConnector={editConnector}
          onClose={() => {
            setWizardOpen(false);
            setEditConnector(null);
          }}
          onSaved={() => {
            setWizardOpen(false);
            setEditConnector(null);
            loadConnectors();
          }}
        />
      )}

      {logsConnector && (
        <LogsDrawer
          connector={logsConnector}
          logs={logs}
          loading={logsLoading}
          onClose={() => setLogsConnector(null)}
        />
      )}

      {errorDetail && (
        <ErrorModal
          name={errorDetail.name}
          message={errorDetail.message}
          onClose={() => setErrorDetail(null)}
        />
      )}
    </div>
  );
}

function ErrorModal({
  name,
  message,
  onClose,
}: {
  name: string;
  message: string;
  onClose: () => void;
}) {
  const [showTechnical, setShowTechnical] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2 text-red-700">
            <AlertTriangle className="h-5 w-5" />
            <h3 className="font-bold text-lg">{name} — Connection Error</h3>
          </div>
          <button onClick={onClose}><X className="h-5 w-5 text-gray-400" /></button>
        </div>
        <p className="text-sm text-gray-700 mb-4">
          This connector could not sync successfully. Check credentials and configuration, then try again.
        </p>
        <button
          type="button"
          onClick={() => setShowTechnical((v) => !v)}
          className="text-xs font-semibold text-[#2548C9] hover:underline"
        >
          {showTechnical ? "Hide" : "View"} technical details
        </button>
        {showTechnical && (
          <pre className="mt-2 rounded bg-gray-50 p-3 text-xs text-gray-600 overflow-auto max-h-32">{message}</pre>
        )}
      </div>
    </div>
  );
}

function LogsDrawer({
  connector,
  logs,
  loading,
  onClose,
}: {
  connector: ConnectorPublic;
  logs: SyncLog[];
  loading: boolean;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
      <div className="w-full max-w-lg bg-white h-full shadow-xl flex flex-col">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h3 className="font-bold text-lg">Sync logs — {connector.name}</h3>
          <button onClick={onClose}><X className="h-5 w-5 text-gray-400" /></button>
        </div>
        <div className="flex-1 overflow-auto p-5">
          {loading ? (
            <p className="text-gray-500 text-sm">Loading logs…</p>
          ) : logs.length === 0 ? (
            <p className="text-gray-500 text-sm">No sync history yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-gray-500 border-b">
                  <th className="pb-2">Started</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2">Records</th>
                  <th className="pb-2">Error</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50/50 transition-all duration-200">
                    <td className="border-b border-gray-200 py-2 pr-2">{new Date(log.startedAt).toLocaleString()}</td>
                    <td className="border-b border-gray-200 py-2 pr-2 capitalize">{log.status}</td>
                    <td className="border-b border-gray-200 py-2 pr-2">{log.recordsSynced ?? "—"}</td>
                    <td className="border-b border-gray-200 py-2 text-red-600 text-xs">{log.errorMessage ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function ConnectorWizard({
  mode,
  existingConnector,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  existingConnector: ConnectorPublic | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = mode === "edit" && existingConnector != null;
  const existingConfig = (existingConnector?.config ?? {}) as Record<string, unknown>;

  const [step, setStep] = useState(isEdit ? 2 : 1);
  const [selectedType, setSelectedType] = useState<ConnectorTypeId | null>(
    (existingConnector?.type as ConnectorTypeId) ?? null
  );
  const [name, setName] = useState(existingConnector?.name ?? "");
  const [baseUrl, setBaseUrl] = useState(existingConnector?.baseUrl ?? "");
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [replaceCredentials, setReplaceCredentials] = useState(!isEdit);
  const [config, setConfig] = useState<Record<string, string>>(() => {
    const fields: Record<string, string> = {};
    if (existingConnector) {
      const typeDef = getConnectorTypeDef(existingConnector.type);
      typeDef?.configFields.forEach((f) => {
        const v = existingConfig[f.key];
        if (v != null) fields[f.key] = String(v);
      });
    }
    return fields;
  });
  const [dataTypes, setDataTypes] = useState<string[]>(() =>
    existingConnector
      ? dataTypesFromConfig(existingConnector.type, existingConfig)
      : []
  );
  const [dataTypesError, setDataTypesError] = useState<string | null>(null);
  const [pollInterval, setPollInterval] = useState(existingConnector?.pollInterval ?? 15);
  const [testResult, setTestResult] = useState<{ ok: boolean; message?: string } | null>(
    isEdit ? { ok: true } : null
  );
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  const typeDef = useMemo(
    () => (selectedType ? getConnectorTypeDef(selectedType) : undefined),
    [selectedType]
  );

  const dataTypeOptions = selectedType ? CONNECTOR_DATA_TYPES[selectedType] ?? [] : [];

  const toggleDataType = (value: string, checked: boolean) => {
    setDataTypesError(null);
    const option = dataTypeOptions.find((o) => o.value === value);
    if (option?.fixed) return;
    setDataTypes((prev) => {
      if (checked) return prev.includes(value) ? prev : [...prev, value];
      return prev.filter((v) => v !== value);
    });
  };

  const canProceedStep2 = useMemo(() => {
    if (!name.trim()) return false;
    if (!isEdit || replaceCredentials) {
      const credsFilled = typeDef?.credentialFields.every((f) => credentials[f.key]?.trim());
      return Boolean(testResult?.ok && credsFilled);
    }
    return true;
  }, [name, isEdit, replaceCredentials, typeDef, credentials, testResult]);

  const runTest = async () => {
    if (!typeDef) return;
    setTesting(true);
    setTestResult(null);
    try {
      if (isEdit && existingConnector && !replaceCredentials) {
        const res = await fetch(`/api/connectors/${existingConnector.id}/test`, { method: "POST" });
        setTestResult(await res.json());
        return;
      }

      const res = await fetch("/api/connectors/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: typeDef.id,
          authType: typeDef.authType,
          baseUrl: baseUrl || undefined,
          credentials,
          config: { ...config, dataTypes },
        }),
      });
      setTestResult(await res.json());
    } catch {
      setTestResult({ ok: false, message: "Connection test failed. Please try again." });
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    if (!typeDef || !name.trim()) return;
    if (dataTypes.length === 0) {
      setDataTypesError("Select at least one data type");
      return;
    }
    setDataTypesError(null);
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        baseUrl: baseUrl || undefined,
        config: { ...config, dataTypes },
        pollInterval,
      };

      if (isEdit && existingConnector) {
        const body: Record<string, unknown> = { ...payload };
        if (replaceCredentials && Object.keys(credentials).length > 0) {
          body.credentials = credentials;
        }
        const res = await fetch(`/api/connectors/${existingConnector.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const err = await res.json();
          alert(err.error ?? "Could not update connector");
          return;
        }
      } else {
        const res = await fetch("/api/connectors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...payload,
            type: typeDef.id,
            authType: typeDef.authType,
            credentials,
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          alert(err.error ?? "Could not save connector");
          return;
        }
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const stepLabel = isEdit
    ? step === 2
      ? "Step 1 of 2"
      : "Step 2 of 2"
    : `Step ${step} of 3`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              {isEdit ? `Edit Connector — ${existingConnector?.name}` : "Add Connector"}
            </h2>
            <p className="text-sm text-gray-500">{stepLabel}</p>
          </div>
          <button onClick={onClose}><X className="h-5 w-5 text-gray-400" /></button>
        </div>

        <div className="p-6">
          {isEdit && (
            <div className="mb-6 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 flex items-center gap-3 opacity-70">
              <TypeIcon type={existingConnector!.type} />
              <div>
                <p className="text-xs font-semibold uppercase text-gray-500">Source type (locked)</p>
                <p className="font-semibold text-gray-900">{typeLabel(existingConnector!.type)}</p>
              </div>
            </div>
          )}

          {step === 1 && !isEdit && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {CONNECTOR_TYPES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  disabled={!t.available}
                  onClick={() => {
                    setSelectedType(t.id);
                    setPollInterval(t.defaultPollInterval);
                    setDataTypes(defaultDataTypesForType(t.id));
                    setStep(2);
                  }}
                  className={`rounded-xl border p-4 text-left transition-colors ${
                    t.available
                      ? "border-gray-200 hover:border-[#2548C9] hover:bg-blue-50/30 cursor-pointer"
                      : "border-gray-100 opacity-50 cursor-not-allowed"
                  }`}
                >
                  <TypeIcon type={t.id} />
                  <p className="mt-3 font-bold text-gray-900">{t.label}</p>
                  {!t.available && <p className="text-xs text-gray-500 mt-1">Coming soon</p>}
                </button>
              ))}
            </div>
          )}

          {step === 2 && typeDef && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Display name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={`e.g. Prod ${typeDef.label}`}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              {(typeDef.id === "jira" || typeDef.id === "jenkins") && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Base URL</label>
                  <input
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder={
                      typeDef.id === "jira"
                        ? "https://your-org.atlassian.net"
                        : "https://jenkins.example.com"
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
              )}
              {isEdit && !replaceCredentials && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
                  Credentials are saved securely.{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setReplaceCredentials(true);
                      setCredentials({});
                      setTestResult(null);
                    }}
                    className="font-semibold text-[#2548C9] hover:underline"
                  >
                    Replace credentials
                  </button>
                </div>
              )}
              {(!isEdit || replaceCredentials) &&
                typeDef.credentialFields.map((field) => (
                  <div key={field.key}>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">{field.label}</label>
                    <input
                      type={field.type === "password" ? "password" : "text"}
                      value={credentials[field.key] ?? ""}
                      onChange={(e) => {
                        setCredentials((prev) => ({ ...prev, [field.key]: e.target.value }));
                        setTestResult(null);
                      }}
                      placeholder={
                        isEdit && !replaceCredentials ? "••••••••" : field.placeholder
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                    {isEdit && replaceCredentials && field.type === "password" && (
                      <p className="text-xs text-gray-500 mt-1">
                        Test connection after entering a new token
                      </p>
                    )}
                  </div>
                ))}
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={runTest}
                  disabled={testing}
                  className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold hover:bg-gray-50"
                >
                  {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Test Connection
                </button>
                {testResult && (
                  <span className={`text-sm font-semibold ${testResult.ok ? "text-green-700" : "text-red-700"}`}>
                    {testResult.ok ? "✓ Connected" : testResult.message ?? "Connection failed"}
                  </span>
                )}
              </div>
              <div className="flex justify-between pt-4">
                {!isEdit ? (
                  <button type="button" onClick={() => setStep(1)} className="text-sm text-gray-600 hover:underline">
                    Back
                  </button>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  disabled={!canProceedStep2}
                  onClick={() => setStep(3)}
                  className="rounded-lg bg-[#2548C9] px-5 py-2 text-sm font-semibold text-white disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {step === 3 && typeDef && (
            <div className="space-y-4">
              {typeDef.configFields.map((field) => (
                <div key={field.key}>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">{field.label}</label>
                  <input
                    value={config[field.key] ?? ""}
                    onChange={(e) => setConfig((prev) => ({ ...prev, [field.key]: e.target.value }))}
                    placeholder={field.placeholder}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
              ))}

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">What should we sync?</label>
                {dataTypeOptions.map((opt) => (
                  <label key={opt.value} className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={dataTypes.includes(opt.value)}
                      disabled={opt.fixed}
                      onChange={(e) => toggleDataType(opt.value, e.target.checked)}
                    />
                    {opt.label}
                    {opt.fixed && <span className="text-xs text-gray-400">(always on)</span>}
                  </label>
                ))}
                {dataTypesError && <p className="text-sm text-red-600">{dataTypesError}</p>}
                {isEdit && (
                  <p className="text-xs text-gray-500">
                    Changes apply from the next sync only — past synced data is not removed or backfilled.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Sync frequency</label>
                <select
                  value={pollInterval}
                  onChange={(e) => setPollInterval(Number(e.target.value))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  {POLL_INTERVAL_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-between pt-4">
                <button type="button" onClick={() => setStep(2)} className="text-sm text-gray-600 hover:underline">
                  Back
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={save}
                  className="rounded-lg bg-[#2548C9] px-5 py-2 text-sm font-semibold text-white disabled:opacity-40"
                >
                  {saving ? "Saving…" : isEdit ? "Update Connector" : "Save Connector"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
