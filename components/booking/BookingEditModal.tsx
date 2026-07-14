"use client";

import { useEffect, useMemo, useState } from "react";
import { taBtnPrimary, taBtnSecondary, taInput } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { safeFetchJson } from "@/lib/safe-fetch";

export type BookingEditValues = {
  releaseId: string;
  releaseSize: string;
  dependencies: string;
  purpose: string;
  prodReleaseDate: string;
  cabDate: string;
  testEnvCode: string;
  testStart: string;
  testEnd: string;
  uatEnvCode: string;
  uatStart: string;
  uatEnd: string;
  preProdEnvCode: string;
  preProdStart: string;
  preProdEnd: string;
  conflictFlag: boolean;
  environmentConflictId: string;
};

type ReleaseOption = { id: string; releaseCode: string; name: string };

type Props = {
  open: boolean;
  bookingId: string;
  bookingCode: string;
  initial: BookingEditValues;
  onClose: () => void;
  onSaved: () => void;
};

function toDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

/**
 * Edit modal for an existing env booking (detail-page fields).
 */
export function BookingEditModal({
  open,
  bookingId,
  bookingCode,
  initial,
  onClose,
  onSaved,
}: Props) {
  const defaults = useMemo(
    () => ({
      ...initial,
      prodReleaseDate: toDateInput(initial.prodReleaseDate),
      cabDate: toDateInput(initial.cabDate),
      testStart: toDateInput(initial.testStart),
      testEnd: toDateInput(initial.testEnd),
      uatStart: toDateInput(initial.uatStart),
      uatEnd: toDateInput(initial.uatEnd),
      preProdStart: toDateInput(initial.preProdStart),
      preProdEnd: toDateInput(initial.preProdEnd),
    }),
    [initial]
  );

  const [form, setForm] = useState(defaults);
  const [releases, setReleases] = useState<ReleaseOption[]>([]);
  const [loadingReleases, setLoadingReleases] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(defaults);
    setError(null);
    setLoadingReleases(true);
    const ac = new AbortController();
    void (async () => {
      const result = await safeFetchJson<{ id: string; releaseCode: string; name: string }[]>(
        "/api/releases",
        { signal: ac.signal, label: "booking-edit-releases" }
      );
      if (ac.signal.aborted) return;
      setLoadingReleases(false);
      if (!result.ok) {
        setError("Could not load releases");
        return;
      }
      setReleases(
        (result.data ?? [])
          .map((r) => ({ id: r.id, releaseCode: r.releaseCode, name: r.name }))
          .sort((a, b) => a.releaseCode.localeCompare(b.releaseCode))
      );
    })();
    return () => ac.abort();
  }, [open, defaults]);

  if (!open) return null;

  const set =
    (key: keyof BookingEditValues) =>
    (value: string | boolean) =>
      setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const result = await safeFetchJson(`/api/bookings/${bookingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        releaseId: form.releaseId || null,
        releaseSize: form.releaseSize.trim() || null,
        dependencies: form.dependencies.trim() || null,
        purpose: form.purpose.trim() || null,
        prodReleaseDate: form.prodReleaseDate || null,
        cabDate: form.cabDate || null,
        testEnvCode: form.testEnvCode.trim() || null,
        testStart: form.testStart || null,
        testEnd: form.testEnd || null,
        uatEnvCode: form.uatEnvCode.trim() || null,
        uatStart: form.uatStart || null,
        uatEnd: form.uatEnd || null,
        preProdEnvCode: form.preProdEnvCode.trim() || null,
        preProdStart: form.preProdStart || null,
        preProdEnd: form.preProdEnd || null,
        conflictFlag: form.conflictFlag,
        environmentConflictId: form.environmentConflictId.trim() || null,
      }),
      label: "update-booking",
      rejectHttpErrors: false,
    });
    setSaving(false);
    if (!result.ok || result.status >= 300) {
      const data = result.ok ? result.data : null;
      const msg =
        data && typeof data === "object" && data !== null && "error" in data
          ? String((data as { error?: string }).error)
          : "Failed to update booking";
      setError(msg);
      return;
    }
    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl dark:bg-[var(--card)]">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Edit {bookingCode}</h2>
          <p className="mt-1 text-xs text-gray-500 dark:text-white/55">
            Update phase windows, key dates, and conflict notes. Booking ID stays the same.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <label className="block text-xs font-medium text-gray-600 dark:text-white/70">
            Release
            <select
              className={cn(taInput, "mt-1")}
              value={form.releaseId}
              onChange={(e) => set("releaseId")(e.target.value)}
              disabled={loadingReleases}
            >
              <option value="">{loadingReleases ? "Loading…" : "No release linked"}</option>
              {releases.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.releaseCode} — {r.name}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-gray-600 dark:text-white/70">
              Release size
              <input
                className={cn(taInput, "mt-1")}
                value={form.releaseSize}
                onChange={(e) => set("releaseSize")(e.target.value)}
              />
            </label>
            <label className="block text-xs font-medium text-gray-600 dark:text-white/70">
              Dependencies
              <input
                className={cn(taInput, "mt-1")}
                value={form.dependencies}
                onChange={(e) => set("dependencies")(e.target.value)}
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-gray-600 dark:text-white/70">
              Prod release date
              <input
                type="date"
                className={cn(taInput, "mt-1")}
                value={form.prodReleaseDate}
                onChange={(e) => set("prodReleaseDate")(e.target.value)}
              />
            </label>
            <label className="block text-xs font-medium text-gray-600 dark:text-white/70">
              CAB date
              <input
                type="date"
                className={cn(taInput, "mt-1")}
                value={form.cabDate}
                onChange={(e) => set("cabDate")(e.target.value)}
              />
            </label>
          </div>

          <fieldset className="rounded-lg border border-gray-200 p-3 dark:border-[var(--border)]">
            <legend className="px-1 text-xs font-semibold text-gray-700 dark:text-white/80">Test</legend>
            <div className="grid grid-cols-3 gap-2">
              <label className="block text-xs font-medium text-gray-600 dark:text-white/70">
                Env
                <input
                  className={cn(taInput, "mt-1")}
                  value={form.testEnvCode}
                  onChange={(e) => set("testEnvCode")(e.target.value)}
                />
              </label>
              <label className="block text-xs font-medium text-gray-600 dark:text-white/70">
                Start
                <input
                  type="date"
                  className={cn(taInput, "mt-1")}
                  value={form.testStart}
                  onChange={(e) => set("testStart")(e.target.value)}
                />
              </label>
              <label className="block text-xs font-medium text-gray-600 dark:text-white/70">
                End
                <input
                  type="date"
                  className={cn(taInput, "mt-1")}
                  value={form.testEnd}
                  onChange={(e) => set("testEnd")(e.target.value)}
                />
              </label>
            </div>
          </fieldset>

          <fieldset className="rounded-lg border border-gray-200 p-3 dark:border-[var(--border)]">
            <legend className="px-1 text-xs font-semibold text-gray-700 dark:text-white/80">UAT</legend>
            <div className="grid grid-cols-3 gap-2">
              <label className="block text-xs font-medium text-gray-600 dark:text-white/70">
                Env
                <input
                  className={cn(taInput, "mt-1")}
                  value={form.uatEnvCode}
                  onChange={(e) => set("uatEnvCode")(e.target.value)}
                />
              </label>
              <label className="block text-xs font-medium text-gray-600 dark:text-white/70">
                Start
                <input
                  type="date"
                  className={cn(taInput, "mt-1")}
                  value={form.uatStart}
                  onChange={(e) => set("uatStart")(e.target.value)}
                />
              </label>
              <label className="block text-xs font-medium text-gray-600 dark:text-white/70">
                End
                <input
                  type="date"
                  className={cn(taInput, "mt-1")}
                  value={form.uatEnd}
                  onChange={(e) => set("uatEnd")(e.target.value)}
                />
              </label>
            </div>
          </fieldset>

          <fieldset className="rounded-lg border border-gray-200 p-3 dark:border-[var(--border)]">
            <legend className="px-1 text-xs font-semibold text-gray-700 dark:text-white/80">Pre-Prod</legend>
            <div className="grid grid-cols-3 gap-2">
              <label className="block text-xs font-medium text-gray-600 dark:text-white/70">
                Env
                <input
                  className={cn(taInput, "mt-1")}
                  value={form.preProdEnvCode}
                  onChange={(e) => set("preProdEnvCode")(e.target.value)}
                />
              </label>
              <label className="block text-xs font-medium text-gray-600 dark:text-white/70">
                Start
                <input
                  type="date"
                  className={cn(taInput, "mt-1")}
                  value={form.preProdStart}
                  onChange={(e) => set("preProdStart")(e.target.value)}
                />
              </label>
              <label className="block text-xs font-medium text-gray-600 dark:text-white/70">
                End
                <input
                  type="date"
                  className={cn(taInput, "mt-1")}
                  value={form.preProdEnd}
                  onChange={(e) => set("preProdEnd")(e.target.value)}
                />
              </label>
            </div>
          </fieldset>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center gap-2 text-xs font-medium text-gray-600 dark:text-white/70">
              <input
                type="checkbox"
                checked={form.conflictFlag}
                onChange={(e) => set("conflictFlag")(e.target.checked)}
              />
              Conflict flag
            </label>
            <label className="block text-xs font-medium text-gray-600 dark:text-white/70">
              Conflict ID(s)
              <input
                className={cn(taInput, "mt-1")}
                value={form.environmentConflictId}
                onChange={(e) => set("environmentConflictId")(e.target.value)}
                placeholder="CNF-0001, …"
              />
            </label>
          </div>

          <label className="block text-xs font-medium text-gray-600 dark:text-white/70">
            Notes
            <textarea
              className={cn(taInput, "mt-1 min-h-[72px]")}
              value={form.purpose}
              onChange={(e) => set("purpose")(e.target.value)}
            />
          </label>

          {error && <p className="text-sm text-error-600 dark:text-rose-400">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className={taBtnSecondary} onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className={taBtnPrimary} disabled={saving || loadingReleases}>
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
