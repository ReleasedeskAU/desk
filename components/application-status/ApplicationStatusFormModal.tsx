"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CreatedConfirmation,
  FormError,
  ModalFrame,
  RequiredMark,
  SelectField,
  TextField,
  TextareaField,
} from "@/components/forms/create-modal-primitives";
import { taBtnPrimary, taBtnSecondary } from "@/lib/styles";
import { safeFetchJson } from "@/lib/safe-fetch";

type Application = { id: string; name: string };
type Environment = { id: string; name: string; applicationId: string };

const STATUSES = ["Up", "Down", "Degraded", "Maintenance"] as const;

type FormValues = {
  applicationId: string;
  environmentName: string;
  status: (typeof STATUSES)[number];
  lastCheck: string;
  uptimePercent: string;
  notes: string;
};

type RecordedStatus = {
  id: string;
  application: { id: string; name: string };
  environmentName: string;
  status: string;
  lastCheck: string;
  uptimePercent: number | null;
  notes: string | null;
};

const nowLocal = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const emptyForm = (): FormValues => ({
  applicationId: "",
  environmentName: "",
  status: "Up",
  lastCheck: nowLocal(),
  uptimePercent: "",
  notes: "",
});

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
};

/** Upserts current application health for one application/environment pair. */
export function ApplicationStatusFormModal({ open, onClose, onCreated }: Props) {
  const [form, setForm] = useState<FormValues>(emptyForm);
  const [applications, setApplications] = useState<Application[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [loadingLookups, setLoadingLookups] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormValues, string>>>({});
  const [recorded, setRecorded] = useState<RecordedStatus | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(emptyForm());
    setRecorded(null);
    setFormError(null);
    setFieldErrors({});
    setLoadingLookups(true);
    const ac = new AbortController();
    void (async () => {
      const [appResult, envResult] = await Promise.all([
        safeFetchJson<Application[]>("/api/applications", { signal: ac.signal, label: "app-status-form-applications" }),
        safeFetchJson<Environment[]>("/api/environments", { signal: ac.signal, label: "app-status-form-environments" }),
      ]);
      if (ac.signal.aborted) return;
      setLoadingLookups(false);
      if (!appResult.ok || !envResult.ok) {
        setFormError("Could not load the form lookups. Close and try again.");
        return;
      }
      setApplications(appResult.data);
      setEnvironments(envResult.data);
    })();
    return () => ac.abort();
  }, [open]);

  const filteredEnvironments = useMemo(
    () => environments.filter((env) => env.applicationId === form.applicationId),
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
    if (!form.applicationId) errors.applicationId = "Application is required";
    if (!form.environmentName) errors.environmentName = "Environment is required";
    if (!form.status) errors.status = "Status is required";
    if (!form.lastCheck) errors.lastCheck = "Last check is required";
    if (form.uptimePercent.trim()) {
      const n = Number(form.uptimePercent);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        errors.uptimePercent = "Must be between 0 and 100";
      }
    }
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
    const uptime = form.uptimePercent.trim();
    const result = await safeFetchJson<RecordedStatus & { error?: string }>("/api/application-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        applicationId: form.applicationId,
        environmentName: form.environmentName,
        status: form.status,
        lastCheck: form.lastCheck,
        uptimePercent: uptime ? Number(uptime) : null,
        notes: form.notes.trim() || null,
      }),
      label: "record-application-status",
      rejectHttpErrors: false,
    });
    setSaving(false);
    if (!result.ok || result.status >= 300) {
      setFormError(
        result.ok && result.data?.error
          ? result.data.error
          : "Failed to record status. Check the form and try again."
      );
      return;
    }
    onCreated();
    setRecorded(result.data);
  };

  if (recorded) {
    return (
      <CreatedConfirmation
        title="Status recorded"
        subtitle="The application status list has been refreshed."
        labelledBy="app-status-recorded-title"
        onClose={onClose}
        onCreateAnother={() => {
          setRecorded(null);
          setForm(emptyForm());
        }}
        rows={[
          { label: "Application", value: recorded.application.name },
          { label: "Environment", value: recorded.environmentName },
          { label: "Status", value: recorded.status },
          {
            label: "Uptime",
            value: recorded.uptimePercent != null ? `${recorded.uptimePercent}%` : "—",
          },
        ]}
      />
    );
  }

  return (
    <ModalFrame onClose={onClose} labelledBy="record-app-status-title" wide>
      <h2 id="record-app-status-title" className="text-lg font-semibold text-gray-900 dark:text-white">
        Record Application Status
      </h2>
      <p className="mt-1 text-xs text-gray-500 dark:text-white/55">
        Fields marked <RequiredMark /> are required. One row per application × environment — existing rows are updated.
      </p>
      {formError ? <FormError message={formError} /> : null}
      <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2">
        <SelectField
          label="Application"
          required
          value={form.applicationId}
          error={fieldErrors.applicationId}
          disabled={loadingLookups}
          onChange={(event) =>
            setForm((current) => ({ ...current, applicationId: event.target.value, environmentName: "" }))
          }
        >
          <option value="">{loadingLookups ? "Loading…" : "Select application…"}</option>
          {applications.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </SelectField>
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
        <SelectField
          label="Status"
          required
          value={form.status}
          error={fieldErrors.status}
          onChange={(event) => set("status", event.target.value as FormValues["status"])}
        >
          {STATUSES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Last check"
          type="datetime-local"
          required
          value={form.lastCheck}
          error={fieldErrors.lastCheck}
          onChange={(event) => set("lastCheck", event.target.value)}
        />
        <TextField
          label="Uptime %"
          type="number"
          min={0}
          max={100}
          step="0.01"
          value={form.uptimePercent}
          error={fieldErrors.uptimePercent}
          placeholder="Optional"
          onChange={(event) => set("uptimePercent", event.target.value)}
        />
        <TextareaField
          label="Notes"
          value={form.notes}
          onChange={(event) => set("notes", event.target.value)}
        />
        <div className="mt-2 flex justify-end gap-2 sm:col-span-2">
          <button type="button" className={taBtnSecondary} onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className={taBtnPrimary} disabled={saving || loadingLookups}>
            {saving ? "Saving…" : "Record Status"}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}
