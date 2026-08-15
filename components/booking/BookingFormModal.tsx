"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { SearchableSelect } from "@/components/ui/searchable-multi-select";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { bookingPhaseLabels } from "@/lib/booking-phase";
import { ConflictChoiceDialog } from "@/components/conflicts/ConflictChoiceDialog";
import type { ConflictFinding } from "@/lib/conflict-finding-types";
import { taBtnPrimary, taBtnSecondary, taInput } from "@/lib/styles";
import { cn } from "@/lib/utils";

export type BookingFormData = {
  applicationId: string;
  environmentId: string;
  releaseId: string;
  fromDate: string;
  toDate: string;
  purpose: string;
};

type Option = {
  value: string;
  label: string;
  departmentId?: string;
  applicationId?: string;
  applicationIds?: string[];
  /** Catalog environment type (Test, UAT, Pre-prod, DR, …). */
  type?: string;
};

type ConflictRow = {
  bookingCode?: string | null;
  applicationName?: string;
  releaseCode?: string | null;
  bookedBy?: string;
  team?: string;
  environmentName?: string | null;
  fromDate?: string;
  toDate?: string;
  purpose?: string | null;
};

type CreatedBooking = {
  id?: string;
  bookingCode?: string | null;
  purpose?: string | null;
  departmentName?: string | null;
  testEnvCode?: string | null;
  testStart?: string | null;
  testEnd?: string | null;
  testDays?: number | null;
  application?: { name?: string; department?: { name?: string } };
  release?: { releaseCode?: string } | null;
};

type BookingDetails = {
  id?: string;
  bookingCode?: string;
  application: string;
  department: string;
  release: string;
  envLabel: string;
  startLabel: string;
  endLabel: string;
  daysLabel: string;
  environment: string;
  startDate: string;
  endDate: string;
  days: string;
  notes: string;
  conflictCode?: string;
};

type ResultState =
  | { ok: true; details: BookingDetails }
  | { ok: false; message: string; details: BookingDetails; conflicts?: ConflictRow[] };

const today = () => new Date().toISOString().slice(0, 10);

const EMPTY: BookingFormData = {
  applicationId: "",
  environmentId: "",
  releaseId: "",
  fromDate: today(),
  toDate: today(),
  purpose: "",
};

function labelFor(options: Option[], value: string, fallback = "—") {
  if (!value) return fallback;
  return options.find((o) => o.value === value)?.label ?? fallback;
}

function spanDays(start: string, end: string): number | null {
  if (!start || !end) return null;
  const a = new Date(start);
  const b = new Date(end);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || b < a) return null;
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / dayMs) + 1);
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-2 text-sm">
      <dt className="text-gray-500 dark:text-white/50">{label}</dt>
      <dd className="font-medium text-gray-800 dark:text-white/90 break-words">{value || "—"}</dd>
    </div>
  );
}

/** Builds a precise required-field message for only the missing booking fields. */
function missingRequiredMessage(
  form: BookingFormData,
  labels: { startField: string; endField: string },
): string | null {
  const missing: string[] = [];
  if (!form.applicationId) missing.push("Application");
  if (!form.environmentId) missing.push("Environment");
  if (!form.releaseId) missing.push("Release ID");
  if (!form.fromDate) missing.push(labels.startField);
  if (!form.toDate) missing.push(labels.endField);
  if (!missing.length) return null;
  if (missing.length === 1) return `${missing[0]} is required.`;
  if (missing.length === 2) return `${missing[0]} and ${missing[1]} are required.`;
  return `${missing.slice(0, -1).join(", ")}, and ${missing[missing.length - 1]} are required.`;
}

export function BookingFormModal({
  open,
  departments,
  applications,
  environments,
  releases,
  onClose,
  onSaved,
}: {
  open: boolean;
  departments: Option[];
  applications: Option[];
  environments: Option[];
  releases: Option[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<BookingFormData>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<ConflictRow[]>([]);
  const [conflictPrompt, setConflictPrompt] = useState<string | null>(null);
  const [highlightDates, setHighlightDates] = useState(false);
  const [result, setResult] = useState<ResultState | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(EMPTY);
    setError(null);
    setConflicts([]);
    setConflictPrompt(null);
    setHighlightDates(false);
    setResult(null);
  }, [open]);

  const selectedApp = useMemo(
    () => applications.find((a) => a.value === form.applicationId),
    [applications, form.applicationId],
  );

  const departmentLabel = useMemo(() => {
    if (!selectedApp?.departmentId) return "—";
    return labelFor(departments, selectedApp.departmentId, "—");
  }, [departments, selectedApp]);

  const envOptions = useMemo(
    () =>
      form.applicationId
        ? environments.filter((e) => e.applicationId === form.applicationId)
        : [],
    [environments, form.applicationId],
  );

  const selectedEnv = useMemo(
    () => environments.find((e) => e.value === form.environmentId),
    [environments, form.environmentId],
  );

  const phaseLabels = useMemo(
    () => bookingPhaseLabels(selectedEnv?.label ?? "", selectedEnv?.type),
    [selectedEnv?.label, selectedEnv?.type],
  );

  const windowDays = spanDays(form.fromDate, form.toDate);

  const buildAttemptedDetails = (): BookingDetails => ({
    application: labelFor(applications, form.applicationId),
    department: departmentLabel,
    release: labelFor(releases, form.releaseId),
    envLabel: phaseLabels.envField,
    startLabel: phaseLabels.startField,
    endLabel: phaseLabels.endField,
    daysLabel: phaseLabels.daysField,
    environment: labelFor(environments, form.environmentId),
    startDate: form.fromDate,
    endDate: form.toDate,
    days: windowDays != null ? String(windowDays) : "—",
    notes: form.purpose.trim() || "End-to-end test window",
  });

  if (!open) return null;

  const dismissResult = () => {
    const wasSuccess = result?.ok === true;
    setResult(null);
    if (wasSuccess) {
      onSaved();
      onClose();
    }
  };

  const createBooking = async (confirmConflict = false, conflictNotes = "") => {
    setError(null);
    if (!confirmConflict) {
      setConflicts([]);
      setConflictPrompt(null);
    }

    const missingMessage = missingRequiredMessage(form, phaseLabels);
    if (missingMessage) {
      setError(missingMessage);
      return;
    }
    if (form.toDate < form.fromDate) {
      setError(`${phaseLabels.endField} must be on or after ${phaseLabels.startField}.`);
      return;
    }

    const attempted = buildAttemptedDetails();
    setSaving(true);
    try {
      const res = await fetch("/api/bookings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          applicationId: form.applicationId,
          environmentId: form.environmentId,
          releaseId: form.releaseId,
          fromDate: form.fromDate,
          toDate: form.toDate,
          purpose: form.purpose || undefined,
          confirmConflict: confirmConflict || undefined,
          conflictNotes: conflictNotes || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        conflicts?: ConflictRow[];
        requiresConfirmation?: boolean;
        bookings?: CreatedBooking[];
        conflictCode?: string | null;
      };

      if (res.status === 409 && data.requiresConfirmation) {
        setConflicts(data.conflicts ?? []);
        setConflictPrompt(
          data.error ||
            "This environment is already booked for overlapping dates. Create this booking anyway?",
        );
        setSaving(false);
        return;
      }

      if (res.status === 409) {
        const conflictRows = data.conflicts ?? [];
        setConflicts(conflictRows);
        setResult({
          ok: false,
          message: data.error || "Booking failed — environment conflict.",
          details: attempted,
          conflicts: conflictRows,
        });
        setSaving(false);
        return;
      }

      if (!res.ok) {
        const message = data.error || `Create failed (${res.status})`;
        setError(message);
        setResult({ ok: false, message, details: attempted });
        setSaving(false);
        return;
      }

      setConflictPrompt(null);
      setConflicts([]);
      const created = data.bookings?.[0];
      setResult({
        ok: true,
        details: {
          id: created?.id,
          bookingCode: created?.bookingCode ?? undefined,
          application: created?.application?.name || attempted.application,
          department:
            created?.departmentName ||
            created?.application?.department?.name ||
            attempted.department,
          release: created?.release?.releaseCode || attempted.release,
          envLabel: attempted.envLabel,
          startLabel: attempted.startLabel,
          endLabel: attempted.endLabel,
          daysLabel: attempted.daysLabel,
          environment: created?.testEnvCode || attempted.environment,
          startDate: created?.testStart?.slice(0, 10) || attempted.startDate,
          endDate: created?.testEnd?.slice(0, 10) || attempted.endDate,
          days:
            created?.testDays != null ? String(created.testDays) : attempted.days,
          notes: created?.purpose || attempted.notes,
          conflictCode: data.conflictCode ?? undefined,
        },
      });
      onSaved();
    } catch {
      const message = "Network error creating booking.";
      setError(message);
      setResult({ ok: false, message, details: attempted });
    } finally {
      setSaving(false);
    }
  };

  if (conflictPrompt) {
    const findings: ConflictFinding[] = conflicts.map((row) => ({
      typeKey: "environment_booking",
      release2Code: row.releaseCode || "UNLINKED",
      applicationName: row.applicationName || "Unknown",
      departmentName: "",
      conflictingEnvironment: row.environmentName || "Environment",
      notes: conflictPrompt,
      conflictPeriod:
        row.fromDate && row.toDate
          ? `${String(row.fromDate).slice(0, 10)} – ${String(row.toDate).slice(0, 10)}`
          : "",
      summary: `${row.bookingCode ?? "Existing booking"} on ${row.environmentName || "this environment"}${
        row.releaseCode ? ` (${row.releaseCode})` : ""
      }`,
    }));
    return (
      <ConflictChoiceDialog
        findings={
          findings.length > 0
            ? findings
            : [
                {
                  typeKey: "environment_booking",
                  release2Code: "UNLINKED",
                  applicationName: "Unknown",
                  departmentName: "",
                  conflictingEnvironment: "Environment",
                  notes: conflictPrompt,
                  conflictPeriod: "",
                  summary: conflictPrompt,
                },
              ]
        }
        busy={saving}
        highlightHint="Change my dates discards this booking — nothing was saved — and highlights the overlapping window so you can pick new dates."
        onModify={() => {
          setConflictPrompt(null);
          setHighlightDates(true);
        }}
        onRaise={(notes) => void createBooking(true, notes)}
      />
    );
  }

  if (result) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={dismissResult}>
        <div
          className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-theme-lg max-h-[90vh] overflow-y-auto dark:bg-[var(--card)]"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="booking-result-title"
        >
          <div className="mb-4 flex items-start gap-3">
            {result.ok ? (
              <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <XCircle className="mt-0.5 h-6 w-6 shrink-0 text-rose-600 dark:text-rose-400" />
            )}
            <div>
              <h2
                id="booking-result-title"
                className={cn(
                  "text-lg font-semibold",
                  result.ok
                    ? "text-emerald-800 dark:text-emerald-300"
                    : "text-rose-800 dark:text-rose-300",
                )}
              >
                {result.ok ? "Booking created successfully" : "Booking failed"}
              </h2>
              <p className="mt-1 text-sm text-gray-600 dark:text-white/60">
                {result.ok
                  ? result.details.conflictCode
                    ? `Booking saved and conflict ${result.details.conflictCode} was raised. The Release Manager has a notice in their inbox (bell icon).`
                    : "Your environment booking was saved. Details below."
                  : result.message}
              </p>
            </div>
          </div>

          <dl className="space-y-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-[var(--border)] dark:bg-white/5">
            {result.details.bookingCode && (
              <DetailRow label="Booking ID" value={result.details.bookingCode} />
            )}
            <DetailRow label="Application" value={result.details.application} />
            <DetailRow label="Department" value={result.details.department} />
            <DetailRow label="Release ID" value={result.details.release} />
            <DetailRow label={result.details.envLabel} value={result.details.environment} />
            <DetailRow label={result.details.startLabel} value={result.details.startDate} />
            <DetailRow label={result.details.endLabel} value={result.details.endDate} />
            <DetailRow label={result.details.daysLabel} value={result.details.days} />
            <DetailRow label="Notes" value={result.details.notes} />
          </dl>

          {!result.ok && result.conflicts && result.conflicts.length > 0 && (
            <ul className="mt-3 space-y-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
              {result.conflicts.map((c, i) => (
                <li key={i}>
                  <strong>{c.applicationName}</strong>
                  {c.environmentName ? ` · ${c.environmentName}` : ""} — booked by {c.bookedBy}
                  {c.team ? ` (${c.team})` : ""}
                  {c.fromDate && c.toDate
                    ? ` · ${String(c.fromDate).slice(0, 10)} → ${String(c.toDate).slice(0, 10)}`
                    : ""}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-5 flex flex-wrap justify-end gap-2">
            {!result.ok && (
              <button type="button" className={taBtnSecondary} onClick={() => setResult(null)}>
                Edit booking
              </button>
            )}
            {result.ok && result.details.id && (
              <ProgressLink
                href={`/booking/${result.details.id}`}
                className={cn(taBtnSecondary, "inline-flex items-center")}
              >
                View booking
              </ProgressLink>
            )}
            {result.ok && (
              <button
                type="button"
                className={taBtnSecondary}
                onClick={() => {
                  setResult(null);
                  setForm(EMPTY);
                  setError(null);
                  setConflicts([]);
                  setConflictPrompt(null);
                }}
              >
                Create another
              </button>
            )}
            <button type="button" className={taBtnPrimary} onClick={dismissResult}>
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-theme-lg max-h-[90vh] overflow-y-auto dark:bg-[var(--card)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-lg font-semibold text-gray-800 dark:text-white">New booking</h2>
        <p className="mb-4 text-xs text-gray-500 dark:text-white/55">
          One booking = one Application, one Environment, one Release. Date labels follow the selected
          environment (Test / UAT / Pre-Prod / Dev / Prod / DR).
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-gray-500">Application *</label>
            <div className="mt-1">
              <SearchableSelect
                value={form.applicationId}
                onChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    applicationId: v,
                    environmentId: "",
                  }))
                }
                options={applications}
                placeholder="Select application…"
                searchPlaceholder="Search applications…"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Department</label>
            <input className={cn(taInput, "bg-gray-50 dark:bg-white/5")} value={departmentLabel} readOnly />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500">Environment *</label>
            <div className="mt-1">
              <SearchableSelect
                value={form.environmentId}
                onChange={(v) => setForm((f) => ({ ...f, environmentId: v }))}
                options={envOptions}
                placeholder={form.applicationId ? "Select environment…" : "Select application first…"}
                searchPlaceholder="Search Dev, Test, UAT, Pre-prod, Prod, DR…"
                disabled={!form.applicationId}
              />
            </div>
            {phaseLabels.hint && (
              <p className="mt-1 text-[11px] text-gray-500 dark:text-white/50">{phaseLabels.hint}</p>
            )}
            {form.applicationId && envOptions.length === 0 && (
              <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">
                No environments exist for this application in master data.
              </p>
            )}
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Release ID *</label>
            <div className="mt-1">
              <SearchableSelect
                value={form.releaseId}
                onChange={(v) => setForm((f) => ({ ...f, releaseId: v }))}
                options={releases}
                placeholder="Select release…"
                searchPlaceholder="Search releases…"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500">{phaseLabels.startField} *</label>
            <input
              type="date"
              className={cn(taInput, highlightDates && "border-amber-400 ring-2 ring-amber-300")}
              value={form.fromDate}
              onChange={(e) => setForm((f) => ({ ...f, fromDate: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">
              {phaseLabels.endField} *
              {windowDays != null ? ` · ${windowDays} day${windowDays === 1 ? "" : "s"}` : ""}
            </label>
            <input
              type="date"
              className={cn(taInput, highlightDates && "border-amber-400 ring-2 ring-amber-300")}
              value={form.toDate}
              onChange={(e) => setForm((f) => ({ ...f, toDate: e.target.value }))}
            />
          </div>

          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-gray-500">Notes</label>
            <input
              className={taInput}
              value={form.purpose}
              onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))}
              placeholder="e.g. End-to-end test window"
            />
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
            {error}
          </div>
        )}
        {conflicts.length > 0 && (
          <ul className="mt-2 space-y-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            {conflicts.map((c, i) => (
              <li key={i}>
                <strong>{c.applicationName}</strong>
                {c.environmentName ? ` · ${c.environmentName}` : ""} — booked by {c.bookedBy}
                {c.team ? ` (${c.team})` : ""}
                {c.fromDate && c.toDate
                  ? ` · ${String(c.fromDate).slice(0, 10)} → ${String(c.toDate).slice(0, 10)}`
                  : ""}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className={taBtnSecondary} onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            className={cn(taBtnPrimary, saving && "opacity-70")}
            onClick={() => void createBooking(false)}
            disabled={saving}
          >
            {saving ? "Creating…" : "Create booking"}
          </button>
        </div>
      </div>
    </div>
  );
}
