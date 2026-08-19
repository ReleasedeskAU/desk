"use client";

import { useEffect, useMemo, useState } from "react";
import {
  FormError,
  SelectField,
  TextField,
} from "@/components/forms/create-modal-primitives";
import { CreateConfirmation, CreateModalShell, SummaryRow } from "@/components/create-flow/CreateFlowUi";
import { taBtnPrimary, taBtnSecondary } from "@/lib/styles";
import { safeFetchJson } from "@/lib/safe-fetch";
import { formatDate } from "@/lib/utils";
import { manualAlertCreateFields } from "@/lib/alert-source";

const ALERT_SEVERITIES = ["Critical", "Warning"] as const;
/** Fallback status labels before alert lifecycle config loads. */
const ALERT_STATUSES = [
  "Active",
  "Acknowledged",
  "Investigating",
  "Escalated",
  "Resolved",
  "Suppressed",
  "Closed",
] as const;

type Department = { id: string; name: string };
type Application = { id: string; name: string; departmentId: string };
type Environment = { id: string; name: string; applicationId: string };

type FormValues = {
  departmentId: string;
  applicationId: string;
  environmentName: string;
  timestamp: string;
  alertType: string;
  severity: (typeof ALERT_SEVERITIES)[number];
  metric: string;
  threshold: string;
  currentValue: string;
  status: string;
  assignedTo: string;
};

type CreatedAlert = {
  id: string;
  alertCode: string;
  timestamp: string;
  alertType: string;
  severity: string;
  metric: string;
  threshold: string | null;
  currentValue: string | null;
  status: string;
  assignedTo: string | null;
  environmentName: string;
  departmentName: string | null;
  application: { id: string; name: string };
};

const nowLocalDatetime = () => {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
};

const emptyForm = (defaultStatus = "Active"): FormValues => ({
  departmentId: "",
  applicationId: "",
  environmentName: "",
  timestamp: nowLocalDatetime(),
  alertType: "",
  severity: "Critical",
  metric: "",
  threshold: "",
  currentValue: "",
  status: defaultStatus,
  assignedTo: "",
});

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  alertTypeOptions?: string[];
  /** Enabled labels from alert lifecycle config. */
  statusOptions?: string[];
  /** Enabled default status from alert lifecycle config. */
  defaultStatus?: string;
  /** When set, department / application are fixed to this release's app. */
  lockTo?: { departmentId: string; applicationId: string } | null;
};

/** Creates a validated monitoring alert with department/application/environment chain. */
export function MonitoringAlertFormModal({
  open,
  onClose,
  onCreated,
  alertTypeOptions = [],
  statusOptions: statusOptionsProp = [],
  defaultStatus = "Active",
  lockTo = null,
}: Props) {
  const statusOptions = useMemo(
    () => (statusOptionsProp.length > 0 ? statusOptionsProp : [...ALERT_STATUSES]),
    [statusOptionsProp]
  );
  const [form, setForm] = useState<FormValues>(() => emptyForm(defaultStatus));
  const [departments, setDepartments] = useState<Department[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [loadingLookups, setLoadingLookups] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormValues, string>>>({});
  const [created, setCreated] = useState<CreatedAlert | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm({
      ...emptyForm(defaultStatus || "Active"),
      departmentId: lockTo?.departmentId ?? "",
      applicationId: lockTo?.applicationId ?? "",
    });
    setCreated(null);
    setFormError(null);
    setFieldErrors({});
    setLoadingLookups(true);
    const ac = new AbortController();
    void (async () => {
      const [departmentResult, applicationResult, environmentResult] = await Promise.all([
        safeFetchJson<Department[]>("/api/departments", { signal: ac.signal, label: "alert-form-departments" }),
        safeFetchJson<Application[]>("/api/applications", { signal: ac.signal, label: "alert-form-applications" }),
        safeFetchJson<Environment[]>("/api/environments", { signal: ac.signal, label: "alert-form-environments" }),
      ]);
      if (ac.signal.aborted) return;
      setLoadingLookups(false);
      if (!departmentResult.ok || !applicationResult.ok || !environmentResult.ok) {
        setFormError("Could not load the form lookups. Close and try again.");
        return;
      }
      setDepartments(departmentResult.data);
      setApplications(applicationResult.data);
      setEnvironments(environmentResult.data);
    })();
    return () => ac.abort();
  }, [open, defaultStatus, lockTo?.departmentId, lockTo?.applicationId]);

  const filteredApplications = useMemo(
    () => applications.filter((application) => application.departmentId === form.departmentId),
    [applications, form.departmentId]
  );
  const filteredEnvironments = useMemo(
    () => environments.filter((environment) => environment.applicationId === form.applicationId),
    [environments, form.applicationId]
  );
  const departmentName = departments.find((item) => item.id === form.departmentId)?.name ?? "";

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
    if (!form.environmentName) errors.environmentName = "Environment is required";
    if (!form.timestamp) errors.timestamp = "Timestamp is required";
    if (form.timestamp && Number.isNaN(new Date(form.timestamp).getTime())) {
      errors.timestamp = "Timestamp must be a valid date and time";
    }
    if (!form.alertType.trim()) errors.alertType = "Alert type is required";
    if (!form.severity) errors.severity = "Severity is required";
    if (!form.metric.trim()) errors.metric = "Metric is required";
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
    const result = await safeFetchJson<CreatedAlert & { error?: string }>("/api/monitoring-alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        timestamp: new Date(form.timestamp).toISOString(),
        applicationId: form.applicationId,
        departmentName: departmentName || null,
        alertType: form.alertType.trim(),
        severity: form.severity,
        metric: form.metric.trim(),
        threshold: form.threshold.trim() || null,
        currentValue: form.currentValue.trim() || null,
        status: form.status,
        assignedTo: form.assignedTo.trim() || null,
        environmentName: form.environmentName,
        ...manualAlertCreateFields(),
      }),
      label: "create-monitoring-alert",
      rejectHttpErrors: false,
    });
    setSaving(false);
    if (!result.ok || result.status >= 300) {
      setFormError(
        result.ok && result.data?.error
          ? result.data.error
          : "Failed to create monitoring alert. Check the form and try again."
      );
      return;
    }
    onCreated();
    setCreated(result.data);
  };

  if (created) {
    return (
      <CreateConfirmation
        entity="Alert"
        viewHref={`/monitoring-alerts/${created.id}`}
        onClose={onClose}
        onCreateAnother={() => {
          setCreated(null);
          setForm({
            ...emptyForm(defaultStatus || "Active"),
            departmentId: lockTo?.departmentId ?? "",
            applicationId: lockTo?.applicationId ?? "",
          });
        }}
      >
        <SummaryRow label="Alert ID" value={created.alertCode} mono />
        <SummaryRow label="Timestamp" value={formatDate(created.timestamp)} />
        <SummaryRow label="Application" value={created.application.name} />
        <SummaryRow label="Department" value={created.departmentName ?? "—"} />
        <SummaryRow label="Environment" value={created.environmentName} />
        <SummaryRow label="Alert type" value={created.alertType} />
        <SummaryRow label="Severity" value={created.severity} />
        <SummaryRow label="Metric" value={created.metric} />
        <SummaryRow label="Status" value={created.status} />
      </CreateConfirmation>
    );
  }

  const scoped = Boolean(lockTo);
  const applicationName = applications.find((item) => item.id === form.applicationId)?.name ?? "";
  const typeChoices = alertTypeOptions.length > 0 ? alertTypeOptions : ["Reminder", "Warning", "Escalation", "Notification"];

  return (
    <CreateModalShell
      title="New Monitoring Alert"
      description={
        scoped
          ? "This alert is for the open release’s application. Alert ID is assigned automatically."
          : "Fields marked * are required. Alert ID is generated by the server."
      }
      onClose={onClose}
      footer={
        <>
          <button type="button" className={taBtnSecondary} onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            type="submit"
            form="alert-create-form"
            className={taBtnPrimary}
            disabled={saving || loadingLookups}
          >
            {saving ? "Creating…" : "Create Alert"}
          </button>
        </>
      }
    >
      {formError ? <FormError message={formError} onDismiss={() => setFormError(null)} /> : null}
      <form id="alert-create-form" onSubmit={submit} className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
        {scoped ? (
          <div className="rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-600 sm:col-span-2 dark:bg-white/5 dark:text-white/70">
            <p className="font-medium text-slate-800 dark:text-white">
              {[departmentName, applicationName].filter(Boolean).join(" · ") || "Loading…"}
            </p>
          </div>
        ) : (
          <>
        <SelectField
          label="Department"
          required
          value={form.departmentId}
          error={fieldErrors.departmentId}
          disabled={loadingLookups}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              departmentId: event.target.value,
              applicationId: "",
              environmentName: "",
            }))
          }
        >
          <option value="">{loadingLookups ? "Loading…" : "Select department…"}</option>
          {departments.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Application"
          required
          value={form.applicationId}
          error={fieldErrors.applicationId}
          disabled={!form.departmentId}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              applicationId: event.target.value,
              environmentName: "",
            }))
          }
        >
          <option value="">{form.departmentId ? "Select application…" : "Select department first…"}</option>
          {filteredApplications.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </SelectField>
          </>
        )}
        <SelectField
          label="Environment"
          required
          value={form.environmentName}
          error={fieldErrors.environmentName}
          disabled={!form.applicationId}
          onChange={(event) => set("environmentName", event.target.value)}
        >
          <option value="">{form.applicationId ? "Select environment…" : "Select application first…"}</option>
          {filteredEnvironments.map((item) => (
            <option key={item.id} value={item.name}>
              {item.name}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Timestamp"
          type="datetime-local"
          required
          value={form.timestamp}
          error={fieldErrors.timestamp}
          onChange={(event) => set("timestamp", event.target.value)}
        />
        <SelectField
          label="Alert type"
          required
          value={form.alertType}
          error={fieldErrors.alertType}
          onChange={(event) => set("alertType", event.target.value)}
        >
          <option value="">Select type…</option>
          {typeChoices.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Severity"
          required
          value={form.severity}
          error={fieldErrors.severity}
          onChange={(event) => set("severity", event.target.value as FormValues["severity"])}
        >
          {ALERT_SEVERITIES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Metric"
          required
          value={form.metric}
          error={fieldErrors.metric}
          onChange={(event) => set("metric", event.target.value)}
          maxLength={200}
        />
        <TextField
          label="Threshold"
          value={form.threshold}
          onChange={(event) => set("threshold", event.target.value)}
          maxLength={4000}
        />
        <TextField
          label="Current value"
          value={form.currentValue}
          onChange={(event) => set("currentValue", event.target.value)}
          maxLength={4000}
        />
        <SelectField
          label="Status"
          required
          value={form.status}
          error={fieldErrors.status}
          onChange={(event) => set("status", event.target.value)}
        >
          {statusOptions.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Assigned to"
          value={form.assignedTo}
          onChange={(event) => set("assignedTo", event.target.value)}
          maxLength={4000}
        />
      </form>
    </CreateModalShell>
  );
}
