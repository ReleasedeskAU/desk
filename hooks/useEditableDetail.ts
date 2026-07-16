"use client";

import { useCallback, useEffect, useState } from "react";
import { diffDraftChanges, type FieldChange } from "@/lib/detail-edit-diff";

/**
 * Local edit-draft state for detail pages (modal edit + success confirmation).
 * Copies `source` into a draft when entering edit mode; discard restores source.
 */
export function useEditableDetail<T extends Record<string, unknown>>(source: T | null) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<T | null>(null);
  const [baseline, setBaseline] = useState<T | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successChanges, setSuccessChanges] = useState<FieldChange[] | null>(null);

  useEffect(() => {
    if (!editing) setDraft(null);
  }, [source, editing]);

  const startEdit = useCallback(() => {
    if (!source) return;
    const copy = { ...source };
    setDraft(copy);
    setBaseline(copy);
    setEditing(true);
    setSaveMessage(null);
    setSuccessChanges(null);
    setError(null);
  }, [source]);

  const discard = useCallback(() => {
    setDraft(null);
    setBaseline(null);
    setEditing(false);
    setError(null);
  }, []);

  const setField = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  }, []);

  /**
   * Closes the edit modal and opens the success confirmation with a field diff.
   * @param labels - Human labels for draft keys included in the confirmation (omit primary IDs).
   */
  const completeSaveSuccess = useCallback(
    (labels: Partial<Record<keyof T & string, string>>) => {
      const changes =
        baseline && draft ? diffDraftChanges(baseline, draft, labels) : [];
      setSuccessChanges(changes);
      setDraft(null);
      setBaseline(null);
      setEditing(false);
      setSaveMessage(null);
      setError(null);
    },
    [baseline, draft]
  );

  const dismissSuccess = useCallback(() => {
    setSuccessChanges(null);
  }, []);

  /** View mode always uses source; draft is only for the edit modal. */
  const values = source as T | null;

  return {
    editing,
    values,
    draft,
    baseline,
    saving,
    setSaving,
    deleting,
    setDeleting,
    deleteOpen,
    setDeleteOpen,
    saveMessage,
    setSaveMessage,
    error,
    setError,
    successChanges,
    startEdit,
    discard,
    setField,
    completeSaveSuccess,
    dismissSuccess,
  };
}
