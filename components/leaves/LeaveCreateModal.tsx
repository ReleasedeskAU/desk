"use client";

import { useEffect, useState } from "react";
import { SearchableMultiSelect, SearchableSelect } from "@/components/ui/searchable-multi-select";
import { CreateConfirmation, CreateModalShell, FieldError, RequiredMark, SummaryRow } from "@/components/create-flow/CreateFlowUi";
import { taBtnPrimary, taBtnSecondary, taInput } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { safeFetchJson } from "@/lib/safe-fetch";
import { LEAVE_TYPES } from "@/lib/validation/leave";

type UserOption = { id: string; userId: string; name: string; department: string };
type ReleaseOption = { id: string; releaseCode: string; name: string };
type CreatedLeave = {
  id: string;
  leaveCode: string;
  leaveStart: string;
  leaveEnd: string;
  leaveType: string;
  days: number;
  riskScore: number;
  user: { userId: string; name: string };
  affectedReleases: { release: { releaseCode: string; name: string } }[];
};

const emptyForm = () => ({
  userId: "",
  leaveStart: "",
  leaveEnd: "",
  leaveType: "Annual",
  days: "1",
  riskImpact: "",
  riskScore: "0",
  releaseIds: [] as string[],
});

/** Creates a leave record with user and affected-release links and a generated Leave ID. */
export function LeaveCreateModal({ open, onClose, onCreated, leaveTypes = [] }: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  leaveTypes?: string[];
}) {
  const [form, setForm] = useState(emptyForm);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [releases, setReleases] = useState<ReleaseOption[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<CreatedLeave | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(emptyForm());
    setErrors({});
    setError(null);
    setCreated(null);
    setLoading(true);
    const ac = new AbortController();
    void (async () => {
      const [userResult, releaseResult] = await Promise.all([
        safeFetchJson<UserOption[]>("/api/users", { signal: ac.signal, label: "leave-create-users" }),
        safeFetchJson<ReleaseOption[]>("/api/releases", { signal: ac.signal, label: "leave-create-releases" }),
      ]);
      if (ac.signal.aborted) return;
      setLoading(false);
      if (userResult.ok) setUsers(userResult.data);
      if (releaseResult.ok) setReleases(releaseResult.data);
      if (!userResult.ok || !releaseResult.ok) setError("Could not load required lookup data.");
    })();
    return () => ac.abort();
  }, [open]);

  if (!open) return null;
  const selectedUser = users.find((user) => user.id === form.userId);
  const typeOptions = [...new Set([...LEAVE_TYPES, ...leaveTypes].filter(Boolean))].sort();

  const set = (key: keyof ReturnType<typeof emptyForm>, value: string | string[]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    const days = Number(form.days);
    const riskScore = Number(form.riskScore);
    if (!form.userId) nextErrors.userId = "Staff member is required";
    if (!form.leaveStart) nextErrors.leaveStart = "Start date is required";
    if (!form.leaveEnd) nextErrors.leaveEnd = "End date is required";
    if (form.leaveStart && form.leaveEnd && form.leaveEnd < form.leaveStart) nextErrors.leaveEnd = "End date must be on or after start date";
    if (!form.leaveType) nextErrors.leaveType = "Leave type is required";
    if (!Number.isInteger(days) || days < 1) nextErrors.days = "Days must be a whole number of at least 1";
    if (!Number.isInteger(riskScore) || riskScore < 0 || riskScore > 10) nextErrors.riskScore = "Risk score must be from 0 to 10";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setError("Please correct the highlighted fields.");
      return;
    }

    setSaving(true);
    setError(null);
    const result = await safeFetchJson<CreatedLeave & { error?: string }>("/api/leaves", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: form.userId,
        leaveStart: form.leaveStart,
        leaveEnd: form.leaveEnd,
        leaveType: form.leaveType,
        days,
        riskImpact: form.riskImpact.trim() || null,
        riskScore,
        releaseIds: form.releaseIds,
      }),
      label: "create-leave",
      rejectHttpErrors: false,
    });
    setSaving(false);
    if (!result.ok || result.status >= 300) {
      setError(result.ok && result.data.error ? result.data.error : "Failed to create leave record");
      return;
    }
    onCreated();
    setCreated(result.data);
  };

  if (created) {
    return (
      <CreateConfirmation entity="Leave" viewHref={`/leaves/${created.id}`} onClose={onClose} onCreateAnother={() => { setCreated(null); setForm(emptyForm()); setError(null); }}>
        <SummaryRow label="Leave ID" value={created.leaveCode} mono />
        <SummaryRow label="Staff member" value={`${created.user.userId} — ${created.user.name}`} />
        <SummaryRow label="Type" value={created.leaveType} />
        <SummaryRow label="Dates" value={`${created.leaveStart.slice(0, 10)} to ${created.leaveEnd.slice(0, 10)}`} />
        <SummaryRow label="Days / risk" value={`${created.days} day(s) · ${created.riskScore}/10`} />
        <SummaryRow label="Affected releases" value={created.affectedReleases.map((item) => item.release.releaseCode).join(", ") || "—"} />
      </CreateConfirmation>
    );
  }

  return (
    <CreateModalShell title="New Leave Record" description="Leave ID is assigned automatically. Fields marked * are required." onClose={onClose}>
      <form onSubmit={submit} className="mt-5 space-y-4">
        <label className="block text-xs font-medium text-gray-600 dark:text-white/70">
          Staff member<RequiredMark />
          <div className="mt-1">
            <SearchableSelect
              value={form.userId}
              onChange={(value) => set("userId", value)}
              options={users.map((user) => ({ value: user.id, label: `${user.userId} — ${user.name} · ${user.department}` }))}
              placeholder={loading ? "Loading…" : "Select staff member…"}
              disabled={loading}
              className={errors.userId ? "[&_button]:border-rose-400" : undefined}
            />
          </div>
          <FieldError message={errors.userId} />
          {selectedUser ? <span className="mt-1 block text-[11px] text-gray-500">Department: {selectedUser.department || "Not set"}</span> : null}
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-xs font-medium text-gray-600 dark:text-white/70">
            Start date<RequiredMark />
            <input type="date" className={cn(taInput, "mt-1", errors.leaveStart && "border-rose-400")} value={form.leaveStart} onChange={(e) => set("leaveStart", e.target.value)} />
            <FieldError message={errors.leaveStart} />
          </label>
          <label className="block text-xs font-medium text-gray-600 dark:text-white/70">
            End date<RequiredMark />
            <input type="date" min={form.leaveStart || undefined} className={cn(taInput, "mt-1", errors.leaveEnd && "border-rose-400")} value={form.leaveEnd} onChange={(e) => set("leaveEnd", e.target.value)} />
            <FieldError message={errors.leaveEnd} />
          </label>
          <label className="block text-xs font-medium text-gray-600 dark:text-white/70">
            Leave type<RequiredMark />
            <select className={cn(taInput, "mt-1", errors.leaveType && "border-rose-400")} value={form.leaveType} onChange={(e) => set("leaveType", e.target.value)}>
              {typeOptions.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
            <FieldError message={errors.leaveType} />
          </label>
          <label className="block text-xs font-medium text-gray-600 dark:text-white/70">
            Days<RequiredMark />
            <input type="number" min={1} max={3650} step={1} className={cn(taInput, "mt-1", errors.days && "border-rose-400")} value={form.days} onChange={(e) => set("days", e.target.value)} />
            <FieldError message={errors.days} />
          </label>
          <label className="block text-xs font-medium text-gray-600 dark:text-white/70">
            Risk score
            <input type="number" min={0} max={10} step={1} className={cn(taInput, "mt-1", errors.riskScore && "border-rose-400")} value={form.riskScore} onChange={(e) => set("riskScore", e.target.value)} />
            <FieldError message={errors.riskScore} />
          </label>
        </div>

        <label className="block text-xs font-medium text-gray-600 dark:text-white/70">
          Affected releases
          <div className="mt-1">
            <SearchableMultiSelect
              values={form.releaseIds}
              onChange={(values) => set("releaseIds", values)}
              options={releases.map((release) => ({ value: release.id, label: `${release.releaseCode} — ${release.name}` }))}
              placeholder={loading ? "Loading…" : "Select releases…"}
              disabled={loading}
            />
          </div>
        </label>
        <label className="block text-xs font-medium text-gray-600 dark:text-white/70">
          Risk impact
          <textarea className={cn(taInput, "mt-1 min-h-[72px]")} maxLength={2000} value={form.riskImpact} onChange={(e) => set("riskImpact", e.target.value)} />
        </label>
        {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <button type="button" className={taBtnSecondary} onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className={taBtnPrimary} disabled={saving || loading}>{saving ? "Creating…" : "Create leave"}</button>
        </div>
      </form>
    </CreateModalShell>
  );
}
