"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { SearchableMultiSelect, SearchableSelect } from "@/components/ui/searchable-multi-select";
import { taBtnPrimary, taBtnSecondary, taInput } from "@/lib/styles";
import { generateReleaseId, normalizeProgramProject } from "@/lib/release-id";
import { cn } from "@/lib/utils";
import { loadJsonEffect, safeFetchJson } from "@/lib/safe-fetch";

/** Fields needed to create/update a release — not every table column. */
export type ReleaseFormData = {
  id?: string;
  releaseCode: string;
  name: string;
  programProject: string;
  owner: string;
  status: string;
  releaseDate: string;
  priority: string;
  impact: string;
  departmentId: string;
  applicationIds: string[];
  dependsOnReleaseIds: string[];
  notes: string;
  releaseSize: string;
  cabDate: string;
  startDate: string;
  testEnvRequired: string;
  uatEnvRequired: string;
  releaseOwnerId: string;
};

type Option = { value: string; label: string };

const STATUSES = [
  "Planned",
  "Scheduled",
  "Ready",
  "In Progress",
  "Approved",
  "Blocked",
  "At Risk",
  "Complete",
  "Shipped",
];
const PRIORITIES = ["P1 - Critical", "P2 - High", "P3 - Medium", "P4 - Low"];
const IMPACTS = ["High", "Medium", "Low"];
const RELEASE_SIZES = ["Small", "Medium", "Large"];

const EMPTY_FORM: ReleaseFormData = {
  releaseCode: "",
  name: "",
  programProject: "",
  owner: "",
  status: "Planned",
  releaseDate: new Date().toISOString().slice(0, 10),
  priority: "P3 - Medium",
  impact: "Medium",
  departmentId: "",
  applicationIds: [],
  dependsOnReleaseIds: [],
  notes: "",
  releaseSize: "Medium",
  cabDate: "",
  startDate: "",
  testEnvRequired: "",
  uatEnvRequired: "",
  releaseOwnerId: "",
};

function dateInput(value?: string | null) {
  return value ? value.slice(0, 10) : "";
}

export function ReleaseFormModal({
  open,
  initial,
  existingReleaseCodes,
  departments,
  applications,
  releases,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial?: Partial<ReleaseFormData> | null;
  existingReleaseCodes: string[];
  departments: Option[];
  applications: Option[];
  releases: Option[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<ReleaseFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [users, setUsers] = useState<Option[]>([]);
  const isEdit = Boolean(initial?.id);

  useEffect(() => {
    if (!open) return;
    return loadJsonEffect<{ id: string; userId: string; name: string }[]>(
      "/api/users",
      (rows) =>
        setUsers(
          rows.map((u) => ({
            value: u.id,
            label: `${u.userId} — ${u.name}`,
          }))
        ),
      { label: "release-form-users" }
    );
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const next: ReleaseFormData = {
      ...EMPTY_FORM,
      releaseCode: initial?.releaseCode ?? generateReleaseId(existingReleaseCodes),
      name: initial?.name ?? "",
      programProject: initial?.programProject ?? "",
      owner: initial?.owner ?? "",
      status: initial?.status ?? "Planned",
      releaseDate: dateInput(initial?.releaseDate) || new Date().toISOString().slice(0, 10),
      priority: initial?.priority ?? "P3 - Medium",
      impact: initial?.impact ?? "Medium",
      departmentId: initial?.departmentId ?? "",
      applicationIds: initial?.applicationIds ?? [],
      dependsOnReleaseIds: initial?.dependsOnReleaseIds ?? [],
      notes: initial?.notes ?? "",
      releaseSize: initial?.releaseSize ?? "Medium",
      cabDate: dateInput(initial?.cabDate),
      startDate: dateInput(initial?.startDate),
      testEnvRequired: initial?.testEnvRequired ?? "",
      uatEnvRequired: initial?.uatEnvRequired ?? "",
      releaseOwnerId: initial?.releaseOwnerId ?? "",
    };
    if (initial?.id) next.id = initial.id;
    setForm(next);
  }, [open, initial, existingReleaseCodes]);

  const releaseOptions = useMemo(
    () => releases.filter((r) => r.value !== initial?.id),
    [releases, initial?.id]
  );

  if (!open) return null;

  const regenerateId = () => {
    const codes = isEdit
      ? existingReleaseCodes.filter((c) => c !== initial?.releaseCode)
      : existingReleaseCodes;
    setForm((f) => ({ ...f, releaseCode: generateReleaseId(codes) }));
  };

  const set = <K extends keyof ReleaseFormData>(key: K, value: ReleaseFormData[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const save = async () => {
    setSaving(true);
    const ownerLabel = users.find((u) => u.value === form.releaseOwnerId)?.label;
    const ownerName = ownerLabel?.includes(" — ")
      ? ownerLabel.split(" — ").slice(1).join(" — ")
      : form.owner;
    const payload = {
      ...form,
      programProject: normalizeProgramProject(form.programProject) ?? "N/A",
      owner: ownerName || form.owner || "Unknown",
      cabDate: form.cabDate || null,
      startDate: form.startDate || null,
      releaseOwnerId: form.releaseOwnerId || null,
      notes: form.notes.trim() || null,
      testEnvRequired: form.testEnvRequired.trim() || null,
      uatEnvRequired: form.uatEnvRequired.trim() || null,
      releaseSize: form.releaseSize || null,
    };
    const result = await safeFetchJson(isEdit ? `/api/releases/${initial!.id}` : "/api/releases", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      label: "release-form-save",
    });
    setSaving(false);
    if (result.ok) {
      onSaved();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl rounded-2xl bg-white shadow-theme-lg p-6 max-h-[90vh] overflow-y-auto dark:bg-[var(--card)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-gray-800 dark:text-white mb-1">
          {isEdit ? "Edit release" : "New release"}
        </h2>
        <p className="text-xs text-gray-500 mb-4">
          Program / Project accepts N/A for hotfixes, infra, security, and independent releases.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-gray-500">Release ID</label>
            <div className="mt-1 flex gap-2">
              <input
                className={cn(taInput, "font-mono text-sm", !isEdit && "bg-gray-50")}
                value={form.releaseCode}
                onChange={(e) => set("releaseCode", e.target.value.toUpperCase())}
                readOnly={!isEdit}
                placeholder="Auto-generated unique ID"
              />
              {!isEdit && (
                <button
                  type="button"
                  onClick={regenerateId}
                  className="shrink-0 rounded-lg border border-gray-200 px-3 text-gray-500 hover:bg-brand-50 hover:text-brand-600"
                  title="Generate new ID"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          <Field label="Release Name" value={form.name} onChange={(v) => set("name", v)} />
          <Field
            label="Program / Project"
            value={form.programProject}
            onChange={(v) => set("programProject", v)}
            placeholder="N/A for hotfixes, infra, security…"
          />

          <div>
            <label className="text-xs font-medium text-gray-500">Department</label>
            <div className="mt-1">
              <SearchableSelect
                value={form.departmentId}
                onChange={(v) => set("departmentId", v)}
                options={departments}
                placeholder="Select department…"
                searchPlaceholder="Search departments…"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500">Release Owner</label>
            <div className="mt-1">
              <SearchableSelect
                value={form.releaseOwnerId}
                onChange={(v) => set("releaseOwnerId", v)}
                options={users}
                placeholder="Select owner…"
                searchPlaceholder="Search users…"
              />
            </div>
          </div>

          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-gray-500">Application/s</label>
            <div className="mt-1">
              <SearchableMultiSelect
                values={form.applicationIds}
                onChange={(v) => set("applicationIds", v)}
                options={applications}
                placeholder="Select applications…"
                searchPlaceholder="Search applications…"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500">Status</label>
            <select className={taInput} value={form.status} onChange={(e) => set("status", e.target.value)}>
              {[...new Set([...STATUSES, form.status].filter(Boolean))].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500">Release Size</label>
            <select className={taInput} value={form.releaseSize} onChange={(e) => set("releaseSize", e.target.value)}>
              {RELEASE_SIZES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500">Priority</label>
            <select className={taInput} value={form.priority} onChange={(e) => set("priority", e.target.value)}>
              {[...new Set([...PRIORITIES, form.priority].filter(Boolean))].map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500">Impact</label>
            <select className={taInput} value={form.impact} onChange={(e) => set("impact", e.target.value)}>
              {IMPACTS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500">CAB Date</label>
            <input type="date" className={taInput} value={form.cabDate} onChange={(e) => set("cabDate", e.target.value)} />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500">Start Date</label>
            <input type="date" className={taInput} value={form.startDate} onChange={(e) => set("startDate", e.target.value)} />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500">End Date</label>
            <input type="date" className={taInput} value={form.releaseDate} onChange={(e) => set("releaseDate", e.target.value)} />
          </div>

          <Field
            label="Test Env Required"
            value={form.testEnvRequired}
            onChange={(v) => set("testEnvRequired", v)}
            placeholder="e.g. FIN-TEST-01"
          />
          <Field
            label="UAT Env Required"
            value={form.uatEnvRequired}
            onChange={(v) => set("uatEnvRequired", v)}
            placeholder="e.g. FIN-UAT-01"
          />

          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-gray-500">Depends On</label>
            <div className="mt-1">
              <SearchableMultiSelect
                values={form.dependsOnReleaseIds}
                onChange={(v) => set("dependsOnReleaseIds", v)}
                options={releaseOptions}
                placeholder="Select dependent releases…"
                searchPlaceholder="Search releases…"
              />
            </div>
          </div>
        </div>

        <div className="mt-4">
          <label className="text-xs font-medium text-gray-500">Notes</label>
          <textarea
            className={`${taInput} min-h-[72px] mt-1`}
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className={taBtnSecondary} onClick={onClose}>Cancel</button>
          <button
            type="button"
            className={taBtnPrimary}
            onClick={save}
            disabled={saving || !form.releaseCode || !form.name || !form.departmentId || !form.releaseDate}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-500">{label}</label>
      <input className={taInput} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
