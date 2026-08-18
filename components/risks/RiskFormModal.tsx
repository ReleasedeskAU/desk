"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { FormAlertDialog } from "@/components/ui/FormAlertDialog";
import { buildFormSaveAlert } from "@/lib/form-save-alert";
import { taBtnPrimary, taBtnSecondary, taInput } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { safeFetchJson } from "@/lib/safe-fetch";
import { scaleAxisValues } from "@/lib/risk-engine-config";
import { useRiskEngineConfig } from "@/hooks/useRiskEngineConfig";
import { useEntityLifecycleStatuses } from "@/hooks/useEntityLifecycleStatuses";
import { RISK_STATUSES } from "@/lib/validation/risk";

type Department = { id: string; name: string };
type Application = { id: string; name: string; departmentId: string };
type Release = {
  id: string;
  releaseCode: string;
  name: string;
  departmentId: string;
  applications: { application: { id: string; name: string } }[];
};
type User = { id: string; userId: string; name: string; department: string };

type FormValues = {
  departmentId: string;
  applicationId: string;
  releaseId: string;
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

type CreatedRisk = {
  id: string;
  riskCode: string;
  description: string;
  category: string;
  likelihood: number;
  impact: number;
  riskScore: number;
  status: string;
  applicationName: string | null;
  departmentName: string | null;
  release: { releaseCode: string; name: string };
};

const EMPTY_FORM: FormValues = {
  departmentId: "",
  applicationId: "",
  releaseId: "",
  category: "",
  description: "",
  likelihood: "3",
  impact: "3",
  affectedArea: "",
  mitigationStrategy: "",
  riskOwnerId: "",
  status: "Identified",
  notes: "",
};

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  categoryOptions: string[];
  /** Enabled lifecycle status labels from parent (SSOT). */
  statusOptions?: string[];
  /** Enabled default status from risk lifecycle config. */
  defaultStatus?: string;
  /** When set, department / application / release are fixed to this release. */
  lockTo?: { releaseId: string; departmentId: string; applicationId: string } | null;
};

/** Creates a validated risk and keeps its generated-ID confirmation visible after list refresh. */
export function RiskFormModal({
  open,
  onClose,
  onCreated,
  categoryOptions,
  statusOptions: statusOptionsProp,
  defaultStatus: defaultStatusProp,
  lockTo = null,
}: Props) {
  const { config: riskConfig } = useRiskEngineConfig();
  const likelihoodOptions = scaleAxisValues(riskConfig.likelihoodMax);
  const impactOptions = scaleAxisValues(riskConfig.impactMax);
  const lifecycle = useEntityLifecycleStatuses("/api/risk-lifecycle-config");
  const defaultStatus =
    (defaultStatusProp && defaultStatusProp.trim()) ||
    lifecycle.defaultStatus ||
    "Identified";
  const [form, setForm] = useState<FormValues>({ ...EMPTY_FORM, status: defaultStatus });
  const [departments, setDepartments] = useState<Department[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [releases, setReleases] = useState<Release[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loadingLookups, setLoadingLookups] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormValues, string>>>({});
  const [created, setCreated] = useState<CreatedRisk | null>(null);

  const statusOptions = useMemo(() => {
    const base =
      statusOptionsProp && statusOptionsProp.length > 0
        ? statusOptionsProp
        : lifecycle.createOptions.length > 0
          ? lifecycle.createOptions
          : [...RISK_STATUSES];
    return [...new Set([...base, form.status].filter(Boolean))];
  }, [form.status, lifecycle.createOptions, statusOptionsProp]);

  useEffect(() => {
    if (!open) return;
    setForm({
      ...EMPTY_FORM,
      status: defaultStatus,
      releaseId: lockTo?.releaseId ?? "",
      departmentId: lockTo?.departmentId ?? "",
      applicationId: lockTo?.applicationId ?? "",
    });
    setCreated(null);
    setFormError(null);
    setFieldErrors({});
    setLoadingLookups(true);
    const ac = new AbortController();
    void (async () => {
      const [departmentResult, applicationResult, releaseResult, userResult] = await Promise.all([
        safeFetchJson<Department[]>("/api/departments", { signal: ac.signal, label: "risk-form-departments" }),
        safeFetchJson<Application[]>("/api/applications", { signal: ac.signal, label: "risk-form-applications" }),
        safeFetchJson<Release[]>("/api/releases", { signal: ac.signal, label: "risk-form-releases" }),
        safeFetchJson<User[]>("/api/users", { signal: ac.signal, label: "risk-form-users" }),
      ]);
      if (ac.signal.aborted) return;
      setLoadingLookups(false);
      if (!departmentResult.ok || !applicationResult.ok || !releaseResult.ok || !userResult.ok) {
        setFormError("Could not load the form lookups. Close and try again.");
        return;
      }
      setDepartments(departmentResult.data);
      setApplications(applicationResult.data);
      setReleases(releaseResult.data);
      setUsers(userResult.data);
    })();
    return () => ac.abort();
  }, [open, defaultStatus]);

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
  const filteredUsers = useMemo(() => {
    const department = departments.find((item) => item.id === form.departmentId)?.name.toLowerCase();
    return department ? users.filter((user) => user.department.toLowerCase() === department) : [];
  }, [departments, form.departmentId, users]);

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
    if (!form.category.trim()) errors.category = "Category is required";
    if (!form.description.trim()) errors.description = "Description is required";
    if (!form.likelihood) errors.likelihood = "Likelihood is required";
    if (!form.impact) errors.impact = "Impact is required";
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
    const result = await safeFetchJson<CreatedRisk & { error?: string }>("/api/risks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        releaseId: form.releaseId,
        applicationId: form.applicationId,
        category: form.category.trim(),
        description: form.description.trim(),
        likelihood: Number(form.likelihood),
        impact: Number(form.impact),
        affectedArea: form.affectedArea.trim() || null,
        mitigationStrategy: form.mitigationStrategy.trim() || null,
        riskOwnerId: form.riskOwnerId || null,
        status: form.status,
        notes: form.notes.trim() || null,
      }),
      label: "create-risk",
      rejectHttpErrors: false,
    });
    setSaving(false);
    if (!result.ok || result.status >= 300) {
      setFormError(
        result.ok && result.data?.error ? result.data.error : "Failed to create risk. Check the form and try again."
      );
      return;
    }
    onCreated();
    setCreated(result.data);
  };

  if (created) {
    return (
      <ModalFrame onClose={onClose} labelledBy="risk-created-title">
        <div className="mb-4 flex items-start gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
            <CheckCircle2 className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h2 id="risk-created-title" className="text-lg font-semibold text-gray-900 dark:text-white">Risk created</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-white/60">The risk register has been refreshed.</p>
          </div>
        </div>
        <dl className="space-y-2 rounded-xl border border-gray-200 bg-gray-50/80 px-4 py-3 text-sm dark:border-[var(--border)] dark:bg-white/5">
          <SummaryRow label="Risk ID" value={created.riskCode} mono />
          <SummaryRow label="Description" value={created.description} />
          <SummaryRow label="Release" value={created.release.releaseCode} mono />
          <SummaryRow label="Application" value={created.applicationName ?? "—"} />
          <SummaryRow label="Category" value={created.category} />
          <SummaryRow label="Risk score" value={`${created.riskScore} (${created.likelihood} × ${created.impact})`} />
          <SummaryRow label="Status" value={created.status} />
        </dl>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" className={taBtnSecondary} onClick={() => { setCreated(null); setForm({ ...EMPTY_FORM, status: defaultStatus }); }}>
            Create another
          </button>
          <ProgressLink href={`/risks/${created.id}`} className={cn(taBtnSecondary, "inline-flex items-center")}>
            View Risk
          </ProgressLink>
          <button type="button" className={taBtnPrimary} onClick={onClose}>Close</button>
        </div>
      </ModalFrame>
    );
  }

  return (
    <ModalFrame onClose={onClose} labelledBy="new-risk-title" wide>
      <h2 id="new-risk-title" className="text-lg font-semibold text-gray-900 dark:text-white">New Risk</h2>
      <p className="mt-1 text-xs text-gray-500 dark:text-white/55">
        Fields marked <RequiredMark /> are required. Risk ID and score are generated by the server.
      </p>
      {formError ? <FormError message={formError} onDismiss={() => setFormError(null)} /> : null}
      <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2">
        <SelectField label="Department" required value={form.departmentId} error={fieldErrors.departmentId}
          disabled={loadingLookups || Boolean(lockTo)} onChange={(event) => setForm((current) => ({ ...current, departmentId: event.target.value, applicationId: "", releaseId: "", riskOwnerId: "" }))}>
          <option value="">{loadingLookups ? "Loading…" : "Select department…"}</option>
          {departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </SelectField>
        <SelectField label="Application" required value={form.applicationId} error={fieldErrors.applicationId}
          disabled={!form.departmentId || Boolean(lockTo)} onChange={(event) => setForm((current) => ({ ...current, applicationId: event.target.value, releaseId: "" }))}>
          <option value="">{form.departmentId ? "Select application…" : "Select department first…"}</option>
          {filteredApplications.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </SelectField>
        <SelectField label="Release" required value={form.releaseId} error={fieldErrors.releaseId}
          disabled={!form.applicationId || Boolean(lockTo)} onChange={(event) => set("releaseId", event.target.value)}>
          <option value="">{form.applicationId ? "Select linked release…" : "Select application first…"}</option>
          {filteredReleases.map((item) => <option key={item.id} value={item.id}>{item.releaseCode} — {item.name}</option>)}
        </SelectField>
        <SelectField label="Risk owner" value={form.riskOwnerId} disabled={!form.departmentId} onChange={(event) => set("riskOwnerId", event.target.value)}>
          <option value="">Unassigned</option>
          {filteredUsers.map((item) => <option key={item.id} value={item.id}>{item.userId} — {item.name}</option>)}
        </SelectField>
        <TextField label="Category" required value={form.category} error={fieldErrors.category}
          onChange={(event) => set("category", event.target.value)} list="risk-category-options" maxLength={120} />
        <datalist id="risk-category-options">{categoryOptions.map((category) => <option key={category} value={category} />)}</datalist>
        <TextField label="Affected area" value={form.affectedArea} onChange={(event) => set("affectedArea", event.target.value)} maxLength={500} />
        <SelectField label="Likelihood" required value={form.likelihood} error={fieldErrors.likelihood} onChange={(event) => set("likelihood", event.target.value)}>
          {likelihoodOptions.map((value) => <option key={value} value={value}>{value}</option>)}
        </SelectField>
        <SelectField label="Impact" required value={form.impact} error={fieldErrors.impact} onChange={(event) => set("impact", event.target.value)}>
          {impactOptions.map((value) => <option key={value} value={value}>{value}</option>)}
        </SelectField>
        <SelectField label="Status" required value={form.status} error={fieldErrors.status} onChange={(event) => set("status", event.target.value)}>
          {statusOptions.map((value) => <option key={value} value={value}>{value}</option>)}
        </SelectField>
        <div className="hidden sm:block" />
        <TextareaField label="Description" required value={form.description} error={fieldErrors.description}
          onChange={(event) => set("description", event.target.value)} />
        <TextareaField label="Mitigation strategy" value={form.mitigationStrategy} onChange={(event) => set("mitigationStrategy", event.target.value)} />
        <TextareaField label="Notes" value={form.notes} onChange={(event) => set("notes", event.target.value)} />
        <div className="sm:col-span-2 mt-2 flex justify-end gap-2">
          <button type="button" className={taBtnSecondary} onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className={taBtnPrimary} disabled={saving || loadingLookups}>
            {saving ? "Creating…" : "Create Risk"}
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
function FormError({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  return (
    <FormAlertDialog
      alert={buildFormSaveAlert(null, message, { entityLabel: "risk" })}
      onDismiss={onDismiss}
    />
  );
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
