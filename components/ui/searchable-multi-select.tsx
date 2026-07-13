"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronsUpDown, X } from "lucide-react";
import { taInput } from "@/lib/styles";
import { cn } from "@/lib/utils";

export type SearchableOption = { value: string; label: string };

export function SearchableMultiSelect({
  values,
  onChange,
  options,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  disabled,
  className,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  options: SearchableOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const selected = useMemo(
    () => options.filter((o) => values.includes(o.value)),
    [options, values]
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(needle) || o.value.toLowerCase().includes(needle)
    );
  }, [options, q]);

  const toggle = (id: string) => {
    onChange(values.includes(id) ? values.filter((v) => v !== id) : [...values, id]);
  };

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(taInput, "flex min-h-[42px] items-center justify-between gap-2 text-left")}
      >
        <span className="flex min-w-0 flex-1 flex-wrap gap-1">
          {selected.length === 0 ? (
            <span className="text-gray-400">{placeholder}</span>
          ) : (
            selected.map((o) => (
              <span
                key={o.value}
                className="inline-flex max-w-full items-center gap-1 rounded-md bg-brand-50 px-1.5 py-0.5 text-xs text-brand-700 dark:bg-brand-900/40 dark:text-brand-200"
                onClick={(e) => e.stopPropagation()}
              >
                <span className="truncate">{o.label}</span>
                <span
                  role="button"
                  tabIndex={0}
                  className="shrink-0 rounded hover:bg-brand-100 dark:hover:bg-brand-800/50"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(o.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      toggle(o.value);
                    }
                  }}
                >
                  <X className="h-3 w-3" />
                </span>
              </span>
            ))
          )}
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-gray-400" />
      </button>
      {open && (
        <div className="absolute left-0 z-50 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-[var(--border)] dark:bg-[var(--card)]">
          <div className="border-b border-gray-100 p-2 dark:border-white/10">
            <input
              autoFocus
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={searchPlaceholder}
              className={cn(taInput, "w-full")}
            />
          </div>
          <div className="max-h-52 overflow-y-auto py-1">
            {filtered.map((o) => {
              const checked = values.includes(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-gray-50 dark:hover:bg-white/5",
                    checked
                      ? "bg-brand-50 font-medium text-brand-700 dark:bg-brand-900/30 dark:text-brand-200"
                      : "text-gray-700 dark:text-white/90"
                  )}
                  onClick={() => toggle(o.value)}
                >
                  <span
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px]",
                      checked
                        ? "border-brand-500 bg-brand-500 text-white"
                        : "border-gray-300 text-transparent"
                    )}
                  >
                    ✓
                  </span>
                  <span className="truncate">{o.label}</span>
                </button>
              );
            })}
            {!filtered.length && (
              <p className="px-3 py-2 text-xs text-gray-400">No matches</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  disabled,
  className,
  allowClear = true,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SearchableOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  className?: string;
  allowClear?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(needle) || o.value.toLowerCase().includes(needle)
    );
  }, [options, q]);

  const selectedLabel = options.find((o) => o.value === value)?.label;

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(taInput, "flex items-center justify-between gap-2 text-left")}
      >
        <span className={cn("truncate", !selectedLabel && "text-gray-400")}>
          {selectedLabel ?? placeholder}
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-gray-400" />
      </button>
      {open && (
        <div className="absolute left-0 z-50 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-[var(--border)] dark:bg-[var(--card)]">
          <div className="border-b border-gray-100 p-2 dark:border-white/10">
            <input
              autoFocus
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={searchPlaceholder}
              className={cn(taInput, "w-full")}
            />
          </div>
          <div className="max-h-52 overflow-y-auto py-1">
            {allowClear && (
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left text-sm text-gray-500 hover:bg-gray-50 dark:hover:bg-white/5"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                  setQ("");
                }}
              >
                {placeholder}
              </button>
            )}
            {filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                className={cn(
                  "block w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50 dark:hover:bg-white/5",
                  o.value === value
                    ? "bg-brand-50 font-medium text-brand-700 dark:bg-brand-900/30 dark:text-brand-200"
                    : "text-gray-700 dark:text-white/90"
                )}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                  setQ("");
                }}
              >
                {o.label}
              </button>
            ))}
            {!filtered.length && (
              <p className="px-3 py-2 text-xs text-gray-400">No matches</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
