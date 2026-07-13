"use client";

import { useEffect, useMemo, useState } from "react";
import { taBtnPrimary, taBtnSecondary, taInput } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { safeFetchJson } from "@/lib/safe-fetch";

const BLOCKER_TYPES = [
  "Environment",
  "Technical",
  "Dependency",
  "Resource",
  "Business",
  "Testing",
  "Security",
  "Infrastructure",
  "Defect",
  "Compliance",
  "Documentation",
  "External",
] as const;

const SEVERITIES = ["Critical", "High", "Medium", "Low"] as const;
const ESCALATIONS = ["L1 - Team Lead", "L2 - Manager", "L3 - Director"] as const;

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  releaseCode: string;
  releaseName: string;
  departmentName: string;
  applicationName: string;
  raisedByDefault?: string;
};

const today = () => new Date().toISOString().slice(0, 10);

export function BlockerFormModal({
  open,
  onClose,
  onCreated,
  releaseCode,
  releaseName,
  departmentName,
  applicationName,
  raisedByDefault = "",
}: Props) {
  const defaults = useMemo(
    () => ({
      blockerType: "Environment",
      blockerDescription: "",
      severity: "High",
      raisedDate: today(),
      raisedBy: raisedByDefault,
      assignedTo: "",
      targetResolutionDate: "",
      escalationLevel: "L1 - Team Lead",
      rootCause: "",
      impactOnRelease: "",
      applicationName,
    }),
    [applicationName, raisedByDefault]
  );

  const [form, setForm] = useState(defaults);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(defaults);
      setError(null);
    }
  }, [open, defaults]);

  if (!open) return null;

  const set =
    (key: keyof typeof defaults) =>
    (value: string) =>
      setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const result = await safeFetchJson("/api/blockers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        releaseCode,
        departmentName,
        applicationName: form.applicationName || applicationName,
        blockerType: form.blockerType,
        blockerDescription: form.blockerDescription,
        severity: form.severity,
        raisedDate: form.raisedDate,
        raisedBy: form.raisedBy,
        assignedTo: form.assignedTo || null,
        targetResolutionDate: form.targetResolutionDate || null,
        escalationLevel: form.escalationLevel,
        rootCause: form.rootCause || null,
        impactOnRelease: form.impactOnRelease,
        status: "Open",
        daysOpen: 0,
      }),
      label: "create-blocker",
      rejectHttpErrors: false,
    });
    setSaving(false);
    if (!result.ok || result.status >= 300) {
      const msg =
        result.ok && result.data && typeof result.data === "object" && "error" in result.data
          ? String((result.data as { error?: string }).error)
          : "Failed to create blocker";
      setError(msg);
      return;
    }
    setForm(defaults);
    onCreated();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl dark:bg-[var(--card)]">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Add Blocker</h2>
          <p className="text-xs text-gray-500 dark:text-white/55 mt-1">
            {releaseCode} — {releaseName}
          </p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <label className="block text-xs font-medium text-gray-600 dark:text-white/70">
            Blocker type
            <select
              className={cn(taInput, "mt-1")}
              value={form.blockerType}
              onChange={(e) => set("blockerType")(e.target.value)}
              required
            >
              {BLOCKER_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs font-medium text-gray-600 dark:text-white/70">
            Description
            <textarea
              className={cn(taInput, "mt-1 min-h-[72px]")}
              value={form.blockerDescription}
              onChange={(e) => set("blockerDescription")(e.target.value)}
              required
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-gray-600 dark:text-white/70">
              Severity
              <select
                className={cn(taInput, "mt-1")}
                value={form.severity}
                onChange={(e) => set("severity")(e.target.value)}
                required
              >
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-gray-600 dark:text-white/70">
              Escalation
              <select
                className={cn(taInput, "mt-1")}
                value={form.escalationLevel}
                onChange={(e) => set("escalationLevel")(e.target.value)}
              >
                {ESCALATIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block text-xs font-medium text-gray-600 dark:text-white/70">
            Impact on release
            <input
              className={cn(taInput, "mt-1")}
              value={form.impactOnRelease}
              onChange={(e) => set("impactOnRelease")(e.target.value)}
              required
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-gray-600 dark:text-white/70">
              Raised date
              <input
                type="date"
                className={cn(taInput, "mt-1")}
                value={form.raisedDate}
                onChange={(e) => set("raisedDate")(e.target.value)}
                required
              />
            </label>
            <label className="block text-xs font-medium text-gray-600 dark:text-white/70">
              Target resolution
              <input
                type="date"
                className={cn(taInput, "mt-1")}
                value={form.targetResolutionDate}
                onChange={(e) => set("targetResolutionDate")(e.target.value)}
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-gray-600 dark:text-white/70">
              Raised by
              <input
                className={cn(taInput, "mt-1")}
                value={form.raisedBy}
                onChange={(e) => set("raisedBy")(e.target.value)}
              />
            </label>
            <label className="block text-xs font-medium text-gray-600 dark:text-white/70">
              Assigned to
              <input
                className={cn(taInput, "mt-1")}
                value={form.assignedTo}
                onChange={(e) => set("assignedTo")(e.target.value)}
              />
            </label>
          </div>

          <label className="block text-xs font-medium text-gray-600 dark:text-white/70">
            Application
            <input
              className={cn(taInput, "mt-1")}
              value={form.applicationName}
              onChange={(e) => set("applicationName")(e.target.value)}
            />
          </label>

          <label className="block text-xs font-medium text-gray-600 dark:text-white/70">
            Root cause (optional)
            <input
              className={cn(taInput, "mt-1")}
              value={form.rootCause}
              onChange={(e) => set("rootCause")(e.target.value)}
            />
          </label>

          {error && <p className="text-sm text-error-600 dark:text-rose-400">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className={taBtnSecondary} onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className={taBtnPrimary} disabled={saving}>
              {saving ? "Saving…" : "Create blocker"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
