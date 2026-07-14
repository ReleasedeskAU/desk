"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SELECT_CLASS } from "@/lib/table-filters";
import { cn } from "@/lib/utils";

export { SELECT_CLASS as filterSelectClass };

export function FilterSelect({
  value,
  onChange,
  disabled,
  children,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={cn(SELECT_CLASS, className)}
    >
      {children}
    </select>
  );
}

export function FilterTextInput({
  value,
  onChange,
  placeholder,
  disabled,
  className,
  debounceMs = 300,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  debounceMs?: number;
}) {
  const [local, setLocal] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  return (
    <input
      type="search"
      value={local}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => {
        const next = e.target.value;
        setLocal(next);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => onChange(next), debounceMs);
      }}
      className={cn(SELECT_CLASS, "min-w-[min(100%,140px)]", className)}
    />
  );
}

export function FilterRangeInputs({
  minValue,
  maxValue,
  onMinChange,
  onMaxChange,
  minPlaceholder = "Min",
  maxPlaceholder = "Max",
  disabled,
  className,
}: {
  minValue: string;
  maxValue: string;
  onMinChange: (value: string) => void;
  onMaxChange: (value: string) => void;
  minPlaceholder?: string;
  maxPlaceholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex items-center gap-1", className)}>
      <input
        type="number"
        inputMode="decimal"
        value={minValue}
        disabled={disabled}
        placeholder={minPlaceholder}
        onChange={(e) => onMinChange(e.target.value)}
        className={cn(SELECT_CLASS, "w-[72px]")}
      />
      <span className="text-xs text-gray-400">–</span>
      <input
        type="number"
        inputMode="decimal"
        value={maxValue}
        disabled={disabled}
        placeholder={maxPlaceholder}
        onChange={(e) => onMaxChange(e.target.value)}
        className={cn(SELECT_CLASS, "w-[72px]")}
      />
    </div>
  );
}

export function FilterTriState({
  value,
  onChange,
  yesLabel = "Yes",
  noLabel = "No",
  allLabel = "All",
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  yesLabel?: string;
  noLabel?: string;
  allLabel?: string;
  disabled?: boolean;
}) {
  return (
    <FilterSelect value={value} onChange={onChange} disabled={disabled}>
      <option value="">{allLabel}</option>
      <option value="1">{yesLabel}</option>
      <option value="0">{noLabel}</option>
    </FilterSelect>
  );
}

export function FilterSearchableSelect({
  value,
  onChange,
  options,
  placeholder = "All",
  searchPlaceholder = "Search…",
  disabled,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
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
        className={cn(SELECT_CLASS, "min-w-[160px] text-left")}
      >
        {selectedLabel ?? placeholder}
      </button>
      {open && (
        <div className="absolute left-0 z-50 mt-1 w-[min(100vw-1.5rem,18rem)] min-w-[12rem] max-h-64 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-[var(--border)] dark:bg-[var(--card)]">
          <div className="border-b border-gray-100 p-2 dark:border-white/10">
            <input
              autoFocus
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={searchPlaceholder}
              className={cn(SELECT_CLASS, "w-full")}
            />
          </div>
          <div className="max-h-48 overflow-y-auto py-1">
            <button
              type="button"
              className="block w-full px-3 py-1.5 text-left text-sm text-gray-600 hover:bg-gray-50 dark:text-white/80 dark:hover:bg-white/5"
              onClick={() => {
                onChange("");
                setOpen(false);
                setQ("");
              }}
            >
              {placeholder}
            </button>
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

export function FilterPills<T extends string>({
  options,
  value,
  onChange,
  allLabel = "All",
}: {
  options: { value: T; label: string }[];
  value: T | "";
  onChange: (value: T | "") => void;
  allLabel?: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => onChange("")}
        className={cn(
          "rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors",
          !value
            ? "bg-brand-500 text-white border-brand-500"
            : "border-gray-200 text-gray-600 dark:border-gray-700 dark:text-gray-300"
        )}
      >
        {allLabel}
      </button>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors",
            value === o.value
              ? "bg-brand-500 text-white border-brand-500"
              : "border-gray-200 text-gray-600 dark:border-gray-700 dark:text-gray-300"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
