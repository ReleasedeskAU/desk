"use client";

import { useEffect, useMemo, useState } from "react";
import { SearchableSelect } from "@/components/ui/searchable-multi-select";
import { CreateConfirmation, CreateModalShell, FieldError, RequiredMark, SummaryRow } from "@/components/create-flow/CreateFlowUi";
import { taBtnPrimary, taBtnSecondary, taInput } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { safeFetchJson } from "@/lib/safe-fetch";
import { ENVIRONMENT_VERSION_STATUSES } from "@/lib/validation/environment-version";

type Department = { id: string; name: string };
type Application = { id: string; name: string; departmentId?: string };
type Environment = { id: string; name: string; type: string; applicationId?: string };
type CreatedVersion = {
  id: string;
  version: string;
  buildNumber: string | null;
  deployDate: string | null;
  status: string | null;
  updatedBy: string | null;
  application: { name: string; department: { name: string } };
  environment: { name: string; type: string };
};

const emptyForm = () => ({
  departmentId: "",
  applicationId: "",
  environmentId: "",
  version: "",
  buildNumber: "",
  deployDate: "",
  status: "Current",
  notes: "",
});

/** Creates a version using real department → application → environment relationships. */
export function EnvironmentVersionCreateModal({
  open,
  onClose,
  onCreated,
  departments,
  applications,
  environments,
  statuses = [],
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  departments: Department[];
  applications: Application[];
  environments: Environment[];
  statuses?: string[];
}) {
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<CreatedVersion | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(emptyForm());
    setErrors({});
    setError(null);
    setCreated(null);
  }, [open]);

  const appOptions = useMemo(
    () => applications.filter((app) => app.departmentId === form.departmentId),
    [applications, form.departmentId]
  );
  const environmentOptions = useMemo(
    () => environments.filter((environment) => environment.applicationId === form.applicationId),
    [environments, form.applicationId]
  );
  const statusOptions = useMemo(
    () => [...new Set([...ENVIRONMENT_VERSION_STATUSES, ...statuses].filter(Boolean))].sort(),
    [statuses]
  );

  if (!open) return null;

  const clearError = (key: string) => setErrors((current) => {
    const next = { ...current };
    delete next[key];
    return next;
  });
  const set = (key: keyof ReturnType<typeof emptyForm>, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    clearError(key);
  };
  const selectDepartment = (departmentId: string) => {
    setForm((current) => ({ ...current, departmentId, applicationId: "", environmentId: "" }));
    clearError("departmentId");
  };
  const selectApplication = (applicationId: string) => {
    setForm((current) => ({ ...current, applicationId, environmentId: "" }));
    clearError("applicationId");
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!form.departmentId) nextErrors.departmentId = "Department is required";
    if (!form.applicationId) nextErrors.applicationId = "Application is required";
    if (!form.environmentId) nextErrors.environmentId = "Environment is required";
    if (!form.version.trim()) nextErrors.version = "Version is required";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setError("Please fill in the required fields highlighted below.");
      return;
    }

    setSaving(true);
    setError(null);
    const result = await safeFetchJson<CreatedVersion & { error?: string }>("/api/environment-versions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        applicationId: form.applicationId,
        environmentId: form.environmentId,
        version: form.version.trim(),
        buildNumber: form.buildNumber.trim() || null,
        deployDate: form.deployDate || null,
        status: form.status || null,
        notes: form.notes.trim() || null,
      }),
      label: "create-environment-version",
      rejectHttpErrors: false,
    });
    setSaving(false);
    if (!result.ok || result.status >= 300) {
      setError(result.ok && result.data.error ? result.data.error : "Failed to create environment version");
      return;
    }
    onCreated();
    setCreated(result.data);
  };

  if (created) {
    return (
      <CreateConfirmation entity="Environment version" viewHref={`/environments/versions/${created.id}`} onClose={onClose} onCreateAnother={() => { setCreated(null); setForm(emptyForm()); setError(null); }}>
        <SummaryRow label="Version ID" value={created.id} mono />
        <SummaryRow label="Application" value={created.application.name} />
        <SummaryRow label="Environment" value={`${created.environment.name} (${created.environment.type})`} />
        <SummaryRow label="Version / build" value={`${created.version}${created.buildNumber ? ` · ${created.buildNumber}` : ""}`} />
        <SummaryRow label="Status" value={created.status || "—"} />
        <SummaryRow label="Deployed by" value={created.updatedBy || "—"} />
      </CreateConfirmation>
    );
  }

  return (
    <CreateModalShell title="New Environment Version" description="Version ID and deployed-by identity are assigned by the server. Fields marked * are required." onClose={onClose}>
      <form onSubmit={submit} className="mt-5 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-xs font-medium text-gray-600 dark:text-white/70">
            Department<RequiredMark />
            <div className="mt-1">
              <SearchableSelect
                value={form.departmentId}
                onChange={selectDepartment}
                options={departments.map((department) => ({ value: department.id, label: department.name }))}
                placeholder="Select department…"
                className={errors.departmentId ? "[&_button]:border-rose-400" : undefined}
              />
            </div>
            <FieldError message={errors.departmentId} />
          </label>
          <label className="block text-xs font-medium text-gray-600 dark:text-white/70">
            Application<RequiredMark />
            <div className="mt-1">
              <SearchableSelect
                value={form.applicationId}
                onChange={selectApplication}
                options={appOptions.map((app) => ({ value: app.id, label: app.name }))}
                placeholder={form.departmentId ? "Select application…" : "Select department first…"}
                disabled={!form.departmentId}
                className={errors.applicationId ? "[&_button]:border-rose-400" : undefined}
              />
            </div>
            <FieldError message={errors.applicationId} />
          </label>
          <label className="block text-xs font-medium text-gray-600 dark:text-white/70">
            Environment<RequiredMark />
            <div className="mt-1">
              <SearchableSelect
                value={form.environmentId}
                onChange={(value) => set("environmentId", value)}
                options={environmentOptions.map((environment) => ({ value: environment.id, label: `${environment.name} — ${environment.type}` }))}
                placeholder={form.applicationId ? "Select environment…" : "Select application first…"}
                disabled={!form.applicationId}
                className={errors.environmentId ? "[&_button]:border-rose-400" : undefined}
              />
            </div>
            <FieldError message={errors.environmentId} />
            {form.applicationId && environmentOptions.length === 0 ? <span className="mt-1 block text-[11px] text-amber-700 dark:text-amber-300">No environments belong to this application.</span> : null}
          </label>
          <label className="block text-xs font-medium text-gray-600 dark:text-white/70">
            Version<RequiredMark />
            <input className={cn(taInput, "mt-1", errors.version && "border-rose-400")} maxLength={120} value={form.version} onChange={(e) => set("version", e.target.value)} placeholder="e.g. 2.4.1" />
            <FieldError message={errors.version} />
          </label>
          <label className="block text-xs font-medium text-gray-600 dark:text-white/70">
            Build number
            <input className={cn(taInput, "mt-1")} maxLength={120} value={form.buildNumber} onChange={(e) => set("buildNumber", e.target.value)} />
          </label>
          <label className="block text-xs font-medium text-gray-600 dark:text-white/70">
            Deploy date
            <input type="date" className={cn(taInput, "mt-1")} value={form.deployDate} onChange={(e) => set("deployDate", e.target.value)} />
          </label>
          <label className="block text-xs font-medium text-gray-600 dark:text-white/70">
            Status
            <select className={cn(taInput, "mt-1")} value={form.status} onChange={(e) => set("status", e.target.value)}>
              {statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </label>
        </div>
        <label className="block text-xs font-medium text-gray-600 dark:text-white/70">
          Notes
          <textarea className={cn(taInput, "mt-1 min-h-[80px]")} maxLength={4000} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </label>
        {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <button type="button" className={taBtnSecondary} onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className={taBtnPrimary} disabled={saving}>{saving ? "Creating…" : "Create version"}</button>
        </div>
      </form>
    </CreateModalShell>
  );
}
