"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { taBtnPrimary, taBtnSecondary, taInput } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { safeFetchJson } from "@/lib/safe-fetch";
import { DRIFT_SEVERITIES, DRIFT_STATUSES } from "@/lib/validation/drift";

type Department = { id: string; name: string };
type Application = { id: string; name: string; departmentId: string };
type Environment = { id: string; name: string; applicationId: string };
type Release = {
  id: string;
  releaseCode: string;
  name: string;
  departmentId: string;
  applications: { application: { id: string; name: string } }[];
};
type ReferenceData = { id: string; value: string; active: boolean };

type FormValues = {
  departmentId: string;
  applicationId: string;
  releaseId: string;
  environmentName: string;
  driftType: string;
  driftCategory: string;
  detectedDate: string;
  severity: (typeof DRIFT_SEVERITIES)[number];
  description: string;
  impactOnRelease: string;
  remediationAction: string;
  status: (typeof DRIFT_STATUSES)[number];
  etaToFix: string;
};

type CreatedDrift = {
  id: string;
  driftCode: string;
  environmentName: string;
  driftType: string;
  detectedDate: string;
  severity: string;
  description: string;
  status: string;
  departmentName: string | null;
  release: { releaseCode: string; name: string };
  application: { name: string };
};

const today = () => new Date().toISOString().slice(0, 10);
const emptyForm = (): FormValues => ({
  departmentId: "",
  applicationId: "",
  releaseId: "",
  environmentName: "",
  driftType: "",
  driftCategory: "",
  detectedDate: today(),
  severity: "Medium",
  description: "",
  impactOnRelease: "",
  remediationAction: "",
  status: "Open",
  etaToFix: "",
});

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  categoryOptions: string[];
};

/** Creates a validated drift with real org/application/release/environment dependencies. */
export function DriftFormModal({ open, onClose, onCreated, categoryOptions }: Props) {
  const [form, setForm] = useState<FormValues>(emptyForm);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [releases, setReleases] = useState<Release[]>([]);
  const [driftTypes, setDriftTypes] = useState<ReferenceData[]>([]);
  const [loadingLookups, setLoadingLookups] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormValues, string>>>({});
  const [created, setCreated] = useState<CreatedDrift | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(emptyForm());
    setCreated(null);
    setFormError(null);
    setFieldErrors({});
    setLoadingLookups(true);
    const ac = new AbortController();
    void (async () => {
      const [departmentResult, applicationResult, environmentResult, releaseResult, typeResult] = await Promise.all([
        safeFetchJson<Department[]>("/api/departments", { signal: ac.signal, label: "drift-form-departments" }),
        safeFetchJson<Application[]>("/api/applications", { signal: ac.signal, label: "drift-form-applications" }),
        safeFetchJson<Environment[]>("/api/environments", { signal: ac.signal, label: "drift-form-environments" }),
        safeFetchJson<Release[]>("/api/releases", { signal: ac.signal, label: "drift-form-releases" }),
        safeFetchJson<ReferenceData[]>("/api/reference-data?category=drift_type", { signal: ac.signal, label: "drift-form-types" }),
      ]);
      if (ac.signal.aborted) return;
      setLoadingLookups(false);
      if (!departmentResult.ok || !applicationResult.ok || !environmentResult.ok || !releaseResult.ok || !typeResult.ok) {
        setFormError("Could not load the form lookups. Close and try again.");
        return;
      }
      setDepartments(departmentResult.data);
      setApplications(applicationResult.data);
      setEnvironments(environmentResult.data);
      setReleases(releaseResult.data);
      setDriftTypes(typeResult.data.filter((item) => item.active));
    })();
    return () => ac.abort();
  }, [open]);

  const filteredApplications = useMemo(
    () => applications.filter((application) => application.departmentId === form.departmentId),
    [applications, form.departmentId]
  );
  const filteredReleases = useMemo(
    () =>
      releases.filter(
        (release) =>
          release.departmentId === form.departmentId &&
          release.applications.some((link) => link.application.id === form.applicationId)
      ),
    [releases, form.departmentId, form.applicationId]
  );
  const filteredEnvironments = useMemo(
    () => environments.filter((environment) => environment.applicationId === form.applicationId),
    [environments, form.applicationId]
  );

  if (!open) return null;

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const validate = () => {
    const errors: Partial<Record<keyof FormValues, string>> = {};
    if (!form.departmentId) errors.departmentId = "Department is required";
    if (!form.applicationId) errors.applicationId = "Application is required";
    if (!form.releaseId) errors.releaseId = "Release is required";
    if (!form.environmentName) errors.environmentName = "Environment is required";
    if (!form.driftType) errors.driftType = "Drift type is required";
    if (!form.detectedDate) errors.detectedDate = "Detected date is required";
    if (!form.severity) errors.severity = "Severity is required";
    if (!form.description.trim()) errors.description = "Description is required";
    if (!form.status) errors.status = "Status is required";
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      setFormError("Please fill in the required fields highlighted below.");
      return false;
    }
    setFormError(null);
    return true;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validate()) return;
    setSaving(true);
    setFormError(null);
    const result = await safeFetchJson<CreatedDrift & { error?: string }>("/api/drifts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        releaseId: form.releaseId,
        applicationId: form.applicationId,
        environmentName: form.environmentName,
        driftType: form.driftType,
        driftCategory: form.driftCategory.trim() || null,
        detectedDate: form.detectedDate,
        severity: form.severity,
        description: form.description.trim(),
        impactOnRelease: form.impactOnRelease.trim() || null,
        remediationAction: form.remediationAction.trim() || null,
        status: form.status,
        etaToFix: form.etaToFix || null,
      }),
      label: "create-drift",
      rejectHttpErrors: false,
    });
    setSaving(false);
    if (!result.ok || result.status >= 300) {
      setFormError(
        result.ok && result.data?.error ? result.data.error : "Failed to create drift. Check the form and try again."
      );
      return;
    }
    onCreated();
    setCreated(result.data);
  };

  if (created) {
    return (
      <ModalFrame onClose={onClose} labelledBy="drift-created-title">
        <div className="mb-4 flex items-start gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
            <CheckCircle2 className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h2 id="drift-created-title" className="text-lg font-semibold text-gray-900 dark:text-white">Drift created</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-white/60">The drift dashboard has been refreshed.</p>
          </div>
        </div>
        <dl className="space-y-2 rounded-xl border border-gray-200 bg-gray-50/80 px-4 py-3 text-sm dark:border-[var(--border)] dark:bg-white/5">
          <SummaryRow label="Drift ID" value={created.driftCode} mono />
          <SummaryRow label="Description" value={created.description} />
          <SummaryRow label="Release" value={created.release.releaseCode} mono />
          <SummaryRow label="Application" value={created.application.name} />
          <SummaryRow label="Environment" value={created.environmentName} />
          <SummaryRow label="Type" value={created.driftType} />
          <SummaryRow label="Severity" value={created.severity} />
          <SummaryRow label="Status" value={created.status} />
        </dl>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" className={taBtnSecondary} onClick={() => { setCreated(null); setForm(emptyForm()); }}>
            Create another
          </button>
          <ProgressLink href={`/drifts/${created.id}`} className={cn(taBtnSecondary, "inline-flex items-center")}>
            View Drift
          </ProgressLink>
          <button type="button" className={taBtnPrimary} onClick={onClose}>Close</button>
        </div>
      </ModalFrame>
    );
  }

  return (
    <ModalFrame onClose={onClose} labelledBy="new-drift-title" wide>
      <h2 id="new-drift-title" className="text-lg font-semibold text-gray-900 dark:text-white">New Drift</h2>
      <p className="mt-1 text-xs text-gray-500 dark:text-white/55">
        Fields marked <RequiredMark /> are required. Drift ID is generated by the server.
      </p>
      {formError && <FormError message={formError} />}
      <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2">
        <SelectField label="Department" required value={form.departmentId} error={fieldErrors.departmentId}
          disabled={loadingLookups} onChange={(event) => setForm((current) => ({ ...current, departmentId: event.target.value, applicationId: "", releaseId: "", environmentName: "" }))}>
          <option value="">{loadingLookups ? "Loading…" : "Select department…"}</option>
          {departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </SelectField>
        <SelectField label="Application" required value={form.applicationId} error={fieldErrors.applicationId}
          disabled={!form.departmentId} onChange={(event) => setForm((current) => ({ ...current, applicationId: event.target.value, releaseId: "", environmentName: "" }))}>
          <option value="">{form.departmentId ? "Select application…" : "Select department first…"}</option>
          {filteredApplications.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </SelectField>
        <SelectField label="Release" required value={form.releaseId} error={fieldErrors.releaseId}
          disabled={!form.applicationId} onChange={(event) => set("releaseId", event.target.value)}>
          <option value="">{form.applicationId ? "Select linked release…" : "Select application first…"}</option>
          {filteredReleases.map((item) => <option key={item.id} value={item.id}>{item.releaseCode} — {item.name}</option>)}
        </SelectField>
        <SelectField label="Environment" required value={form.environmentName} error={fieldErrors.environmentName}
          disabled={!form.applicationId} onChange={(event) => set("environmentName", event.target.value)}>
          <option value="">{form.applicationId ? "Select environment…" : "Select application first…"}</option>
          {filteredEnvironments.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}
        </SelectField>
        <SelectField label="Drift type" required value={form.driftType} error={fieldErrors.driftType}
          onChange={(event) => set("driftType", event.target.value)}>
          <option value="">Select drift type…</option>
          {driftTypes.map((item) => <option key={item.id} value={item.value}>{item.value}</option>)}
        </SelectField>
        <TextField label="Drift category" value={form.driftCategory} onChange={(event) => set("driftCategory", event.target.value)}
          list="drift-category-options" maxLength={4000} />
        <datalist id="drift-category-options">{categoryOptions.map((category) => <option key={category} value={category} />)}</datalist>
        <SelectField label="Severity" required value={form.severity} error={fieldErrors.severity}
          onChange={(event) => set("severity", event.target.value as FormValues["severity"])}>
          {DRIFT_SEVERITIES.map((value) => <option key={value} value={value}>{value}</option>)}
        </SelectField>
        <SelectField label="Status" required value={form.status} error={fieldErrors.status}
          onChange={(event) => set("status", event.target.value as FormValues["status"])}>
          {DRIFT_STATUSES.map((value) => <option key={value} value={value}>{value}</option>)}
        </SelectField>
        <TextField label="Detected date" type="date" required value={form.detectedDate} error={fieldErrors.detectedDate}
          onChange={(event) => set("detectedDate", event.target.value)} />
        <TextField label="ETA to fix" type="date" value={form.etaToFix}
          onChange={(event) => set("etaToFix", event.target.value)} />
        <TextareaField label="Description" required value={form.description} error={fieldErrors.description}
          onChange={(event) => set("description", event.target.value)} />
        <TextareaField label="Impact on release" value={form.impactOnRelease}
          onChange={(event) => set("impactOnRelease", event.target.value)} />
        <TextareaField label="Remediation action" value={form.remediationAction}
          onChange={(event) => set("remediationAction", event.target.value)} />
        <div className="sm:col-span-2 mt-2 flex justify-end gap-2">
          <button type="button" className={taBtnSecondary} onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className={taBtnPrimary} disabled={saving || loadingLookups}>
            {saving ? "Creating…" : "Create Drift"}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}

function ModalFrame({ children, onClose, labelledBy, wide = false }: { children: React.ReactNode; onClose: () => void; labelledBy: string; wide?: boolean }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
    <div role="dialog" aria-modal="true" aria-labelledby={labelledBy} onClick={(event) => event.stopPropagation()}
      className={cn("max-h-[90vh] w-full overflow-y-auto rounded-2xl bg-white p-6 shadow-theme-lg dark:bg-[var(--card)]", wide ? "max-w-2xl" : "max-w-lg")}>
      {children}
    </div>
  </div>;
}
function RequiredMark() { return <span className="text-rose-500">*</span>; }
function FormError({ message }: { message: string }) {
  return <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">{message}</div>;
}
function FieldError({ message }: { message?: string }) {
  return message ? <p className="mt-1 text-[11px] font-medium text-rose-600 dark:text-rose-400">{message}</p> : null;
}
function SelectField({ label, required, error, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; error?: string }) {
  return <label className="block text-xs font-medium text-gray-600 dark:text-white/70">{label}{required ? <> <RequiredMark /></> : null}
    <select {...props} className={cn(taInput, "mt-1", error && "border-rose-400")}>{children}</select><FieldError message={error} />
  </label>;
}
function TextField({ label, required, error, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  return <label className="block text-xs font-medium text-gray-600 dark:text-white/70">{label}{required ? <> <RequiredMark /></> : null}
    <input {...props} className={cn(taInput, "mt-1", error && "border-rose-400")} /><FieldError message={error} />
  </label>;
}
function TextareaField({ label, required, error, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string }) {
  return <label className="block text-xs font-medium text-gray-600 dark:text-white/70 sm:col-span-2">{label}{required ? <> <RequiredMark /></> : null}
    <textarea {...props} maxLength={4000} className={cn(taInput, "mt-1 min-h-[76px]", error && "border-rose-400")} /><FieldError message={error} />
  </label>;
}
function SummaryRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return <div className="flex justify-between gap-3"><dt className="text-gray-500 dark:text-white/55">{label}</dt>
    <dd className={cn("max-w-[70%] text-right font-medium text-gray-900 dark:text-white", mono && "font-mono text-xs")}>{value}</dd>
  </div>;
}
