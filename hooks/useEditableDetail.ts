"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Local edit-draft state for detail pages.
 * Copies `source` into a draft when entering edit mode; discard restores source.
 */
export function useEditableDetail<T extends Record<string, unknown>>(source: T | null) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<T | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) setDraft(null);
  }, [source, editing]);

  const startEdit = useCallback(() => {
    if (!source) return;
    setDraft({ ...source });
    setEditing(true);
    setSaveMessage(null);
    setError(null);
  }, [source]);

  const discard = useCallback(() => {
    setDraft(null);
    setEditing(false);
    setError(null);
  }, []);

  const setField = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  }, []);

  const values = (editing && draft ? draft : source) as T | null;

  return {
    editing,
    values,
    draft,
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
    startEdit,
    discard,
    setField,
  };
}
