"use client";

/**
 * Settings → Risk Engine — per-user Simple (3–6 dynamic bands) + Weighted labels/cutoffs.
 * Soft number inputs avoid leading-zero glitches; add/remove require confirmation.
 */
import { useEffect, useMemo, useState } from "react";
import { Gauge, Plus, Save, Trash2 } from "lucide-react";
import {
  DEFAULT_RISK_ENGINE_CONFIG,
  MAX_SIMPLE_BANDS,
  MIN_SIMPLE_BANDS,
  createSimpleBandId,
  normalizeRiskEngineConfig,
  resolveSimpleRiskLevel,
  resolveWeightedRiskLevel,
  simpleBandScoreRanges,
  simpleRiskLevelLabel,
  validateSimpleBands,
  validateWeightedCutoffs,
  type RiskEngineConfig,
  type SimpleBand,
  type WeightedRiskLevel,
} from "@/lib/risk-engine-config";
import { taBtnPrimary, taBtnSecondary, taInput } from "@/lib/styles";
import { cn } from "@/lib/utils";

const WEIGHTED_BANDS: WeightedRiskLevel[] = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
  "SEVERE",
];

type ConfirmState =
  | { kind: "add" }
  | { kind: "remove"; index: number; label: string }
  | null;

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-[13px] font-semibold text-slate-700 dark:text-white/85">
        {label}
      </span>
      {children}
      {hint ? (
        <span className="block text-[12px] leading-snug text-slate-500 dark:text-white/45">
          {hint}
        </span>
      ) : null}
    </label>
  );
}

function SectionCard({
  step,
  title,
  subtitle,
  children,
}: {
  step?: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-[var(--border)] dark:bg-[var(--card)]">
      <div className="mb-4 flex items-start gap-3">
        {step ? (
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-[12px] font-bold text-brand-700 dark:text-brand-300">
            {step}
          </span>
        ) : null}
        <div className="min-w-0">
          <h3 className="text-[16px] font-bold tracking-tight">{title}</h3>
          <p className="mt-1 text-[13px] leading-relaxed text-slate-500 dark:text-white/50">
            {subtitle}
          </p>
        </div>
      </div>
      {children}
    </div>
  );
}

/**
 * Text-backed numeric input — commits on blur so typing "11" never becomes "011".
 */
function SoftNumberInput({
  value,
  onCommit,
  integer = true,
  min,
  max,
  className,
  disabled,
  placeholder,
}: {
  value: number;
  onCommit: (n: number) => void;
  integer?: boolean;
  min?: number;
  max?: number;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [text, setText] = useState(() => String(value));

  useEffect(() => {
    setText(String(value));
  }, [value]);

  const commit = () => {
    const trimmed = text.trim();
    if (trimmed === "" || trimmed === "-" || trimmed === ".") {
      setText(String(value));
      return;
    }
    let n = integer ? Number.parseInt(trimmed, 10) : Number(trimmed);
    if (!Number.isFinite(n)) {
      setText(String(value));
      return;
    }
    if (typeof min === "number") n = Math.max(min, n);
    if (typeof max === "number") n = Math.min(max, n);
    onCommit(n);
    setText(String(n));
  };

  return (
    <input
      type="text"
      inputMode={integer ? "numeric" : "decimal"}
      disabled={disabled}
      placeholder={placeholder}
      className={cn(taInput, className)}
      value={text}
      onChange={(e) => {
        const next = e.target.value;
        if (integer) {
          if (next === "" || /^-?\d*$/.test(next)) setText(next);
        } else if (next === "" || /^-?\d*\.?\d*$/.test(next)) {
          setText(next);
        }
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.currentTarget.blur();
        }
      }}
    />
  );
}

function ConfirmDialog({
  title,
  body,
  confirmLabel,
  danger,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onCancel}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="risk-engine-confirm-title"
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-theme-lg dark:border-[var(--border)] dark:bg-[var(--card)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="risk-engine-confirm-title" className="text-[16px] font-bold text-slate-900 dark:text-white">
          {title}
        </h3>
        <p className="mt-2 text-[14px] leading-relaxed text-slate-600 dark:text-white/65">{body}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className={taBtnSecondary} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={cn(
              danger ? taBtnSecondary : taBtnPrimary,
              danger &&
                "border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100 dark:border-rose-500/40 dark:bg-rose-500/15 dark:text-rose-200"
            )}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Risk engine configuration panel with dynamic Simple bands + Weighted preview.
 */
export function RiskEngineSettings() {
  const [config, setConfig] = useState<RiskEngineConfig>(DEFAULT_RISK_ENGINE_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sampleScore, setSampleScore] = useState(6);
  const [weightedSample, setWeightedSample] = useState(3.6);
  const [confirm, setConfirm] = useState<ConfirmState>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/risk-engine-config")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setConfig(normalizeRiskEngineConfig(data.config ?? data));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const maxScore = config.likelihoodMax * config.impactMax;
  const ranges = useMemo(() => simpleBandScoreRanges(config), [config]);
  const cutoffError = useMemo(
    () => validateSimpleBands(config.simpleBands),
    [config.simpleBands]
  );
  const weightedCutoffError = useMemo(
    () => validateWeightedCutoffs(config.weightedBandCutoffs),
    [config.weightedBandCutoffs]
  );

  const simplePreview = useMemo(() => {
    const level = resolveSimpleRiskLevel(sampleScore, config);
    return { level, label: simpleRiskLevelLabel(level, config) };
  }, [config, sampleScore]);

  const weightedPreview = useMemo(() => {
    const level = resolveWeightedRiskLevel(weightedSample, config);
    const labelMap = {
      LOW: config.weightedBandLabels.low,
      MEDIUM: config.weightedBandLabels.medium,
      HIGH: config.weightedBandLabels.high,
      CRITICAL: config.weightedBandLabels.critical,
      SEVERE: config.weightedBandLabels.severe,
    };
    return { level, label: labelMap[level] };
  }, [config, weightedSample]);

  const touch = () => {
    setMessage(null);
    setError(null);
  };

  const update = <K extends keyof RiskEngineConfig>(key: K, value: RiskEngineConfig[K]) => {
    setConfig((c) => ({ ...c, [key]: value }));
    touch();
  };

  const setBands = (bands: SimpleBand[]) => {
    setConfig((c) => ({ ...c, simpleBands: bands }));
    touch();
  };

  const updateBand = (index: number, patch: Partial<SimpleBand>) => {
    setBands(
      config.simpleBands.map((b, i) => {
        if (i !== index) return b;
        const next = { ...b, ...patch };
        // Top band always stays open-ended.
        if (i === config.simpleBands.length - 1) next.maxScore = null;
        return next;
      })
    );
  };

  /**
   * Insert a new editable band *before* the open-ended top.
   * Existing labels (including top) are never rewritten.
   */
  const applyAddBand = () => {
    if (config.simpleBands.length >= MAX_SIMPLE_BANDS) return;
    const bands = config.simpleBands.map((b) => ({ ...b }));
    const top = bands[bands.length - 1]!;
    const below = bands.length >= 2 ? bands[bands.length - 2]! : null;
    const floor = typeof below?.maxScore === "number" ? below.maxScore : 0;
    const suggested = Math.max(
      floor + 1,
      Math.min(maxScore - 1, Math.floor((floor + maxScore) / 2) || floor + 1)
    );
    const nextLabel = "New band";
    bands.splice(bands.length - 1, 0, {
      id: createSimpleBandId(bands),
      label: nextLabel,
      maxScore: suggested,
    });
    bands[bands.length - 1] = { ...top, maxScore: null };
    setBands(bands);
  };

  const applyRemoveBand = (index: number) => {
    if (config.simpleBands.length <= MIN_SIMPLE_BANDS) return;
    const bands = config.simpleBands.filter((_, i) => i !== index).map((b) => ({ ...b }));
    if (bands.length) bands[bands.length - 1] = { ...bands[bands.length - 1]!, maxScore: null };
    setBands(bands);
  };

  const save = async () => {
    const simpleErr = validateSimpleBands(config.simpleBands);
    if (simpleErr) {
      setError(simpleErr);
      return;
    }
    const weightedErr = validateWeightedCutoffs(config.weightedBandCutoffs);
    if (weightedErr) {
      setError(weightedErr);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/risk-engine-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Save failed");
        return;
      }
      setConfig(normalizeRiskEngineConfig(data.config));
      setMessage(
        "Saved. Open Risk list, heat map, Risk detail, or Dashboard — they reload your bands/labels."
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-500">Loading risk engine settings…</p>;
  }

  return (
    <section className="font-sans text-gray-900 dark:text-white" aria-labelledby="risk-engine-title">
      {confirm?.kind === "add" ? (
        <ConfirmDialog
          title="Add a risk band?"
          body={`A new band will be inserted just below your top band (“${config.simpleBands[config.simpleBands.length - 1]?.label ?? "top"}”), with an editable Score ≤ cutoff. Existing names stay as they are. Remember to Save when you are done.`}
          confirmLabel="Add band"
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            applyAddBand();
            setConfirm(null);
          }}
        />
      ) : null}
      {confirm?.kind === "remove" ? (
        <ConfirmDialog
          title={`Remove “${confirm.label}”?`}
          body="This band is removed from your ladder. Scores will fall into the remaining bands using their cutoffs. You can still Cancel Save by leaving the page without saving — but once you Save, Risk list and heat map use the new ladder."
          confirmLabel="Remove band"
          danger
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            applyRemoveBand(confirm.index);
            setConfirm(null);
          }}
        />
      ) : null}

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h2
            id="risk-engine-title"
            className="flex items-center gap-2 text-[24px] font-bold tracking-[-0.02em]"
          >
            <Gauge className="h-6 w-6 text-brand-600" aria-hidden />
            Risk Engine
          </h2>
          <p className="mt-1 text-[14px] leading-relaxed text-slate-500 dark:text-white/55">
            Score ={" "}
            <span className="font-semibold text-slate-700 dark:text-white/80">
              Likelihood × Impact
            </span>
            . Build {MIN_SIMPLE_BANDS}–{MAX_SIMPLE_BANDS} Simple bands with your own names and
            cutoffs. Click <span className="font-semibold">Save changes</span> before checking Risk
            list or heat map.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className={cn(taBtnPrimary, "inline-flex items-center gap-2")}
        >
          <Save className="h-4 w-4" />
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>

      {error ? (
        <p className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
          {message}
        </p>
      ) : null}

      <div className="space-y-6">
        <SectionCard
          step="1"
          title="Scale"
          subtitle={`How high can Likelihood and Impact go? Max score = ${config.likelihoodMax} × ${config.impactMax} = ${maxScore}.`}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Likelihood max" hint="Highest Likelihood on create/edit forms (2–10).">
              <SoftNumberInput
                value={config.likelihoodMax}
                min={2}
                max={10}
                onCommit={(n) => update("likelihoodMax", n)}
              />
            </Field>
            <Field label="Impact max" hint="Highest Impact on create/edit forms (2–10).">
              <SoftNumberInput
                value={config.impactMax}
                min={2}
                max={10}
                onCommit={(n) => update("impactMax", n)}
              />
            </Field>
          </div>
        </SectionCard>

        <SectionCard
          step="2"
          title="Simple Risk bands"
          subtitle="Lowest → highest. Each band except the top has Score ≤ cutoff. The top band catches everything above the previous cutoff (no upper score to edit)."
        >
          <div
            className="mb-4 overflow-x-auto overflow-hidden rounded-xl border border-slate-200 dark:border-[var(--border)]"
          >
            <div
              className="min-w-[280px]"
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${config.simpleBands.length}, minmax(4.5rem, 1fr))`,
              }}
            >
              {config.simpleBands.map((band) => (
                <div
                  key={band.id}
                  className={cn(
                    "border-r border-slate-200 px-2 py-3 text-center last:border-r-0 dark:border-[var(--border)]",
                    simplePreview.level === band.id && "bg-brand-500/10"
                  )}
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    {ranges[band.id]}
                  </p>
                  <p className="mt-1 truncate text-[13px] font-bold text-slate-800 dark:text-white/90">
                    {band.label}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            {config.simpleBands.map((band, index) => {
              const isLast = index === config.simpleBands.length - 1;
              return (
                <div
                  key={band.id}
                  className={cn(
                    "grid gap-3 rounded-xl border p-3 sm:grid-cols-[minmax(0,1fr)_9rem_auto] dark:border-[var(--border)]",
                    isLast
                      ? "border-brand-300/80 bg-brand-50/40 dark:border-brand-500/30 dark:bg-brand-500/5"
                      : "border-slate-200"
                  )}
                >
                  <Field
                    label="Display name"
                    hint={
                      isLast
                        ? `Top band · ${index + 1} of ${config.simpleBands.length}`
                        : `Band ${index + 1} of ${config.simpleBands.length}`
                    }
                  >
                    <input
                      className={taInput}
                      value={band.label}
                      onChange={(e) => updateBand(index, { label: e.target.value })}
                      placeholder="e.g. VERY LOW"
                    />
                  </Field>
                  {isLast ? (
                    <Field
                      label="Upper score"
                      hint="Open-ended — not editable"
                    >
                      <input
                        className={cn(taInput, "cursor-not-allowed opacity-70")}
                        value="No limit"
                        disabled
                        readOnly
                      />
                    </Field>
                  ) : (
                    <Field label="Score ≤" hint="Inclusive cutoff">
                      <SoftNumberInput
                        value={band.maxScore ?? 0}
                        min={1}
                        max={1000}
                        onCommit={(n) => updateBand(index, { maxScore: n })}
                      />
                    </Field>
                  )}
                  <div className="flex items-end">
                    <button
                      type="button"
                      className={cn(
                        taBtnSecondary,
                        "inline-flex items-center gap-1.5 px-3 py-2.5 text-rose-700 disabled:opacity-40 dark:text-rose-300"
                      )}
                      disabled={config.simpleBands.length <= MIN_SIMPLE_BANDS}
                      onClick={() =>
                        setConfirm({ kind: "remove", index, label: band.label || `Band ${index + 1}` })
                      }
                      aria-label={`Remove ${band.label}`}
                    >
                      <Trash2 className="h-4 w-4" />
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              className={cn(taBtnSecondary, "inline-flex items-center gap-1.5")}
              disabled={config.simpleBands.length >= MAX_SIMPLE_BANDS}
              onClick={() => setConfirm({ kind: "add" })}
            >
              <Plus className="h-4 w-4" />
              Add band
            </button>
            <p className="text-[12px] text-slate-500 dark:text-white/45">
              {config.simpleBands.length} / {MAX_SIMPLE_BANDS} bands
              {config.simpleBands.length <= MIN_SIMPLE_BANDS
                ? ` · keep at least ${MIN_SIMPLE_BANDS}`
                : " · new band is inserted under the top (editable Score ≤)"}
            </p>
          </div>
          {cutoffError ? (
            <p className="mt-3 text-[13px] text-rose-600 dark:text-rose-300">{cutoffError}</p>
          ) : null}
        </SectionCard>

        <SectionCard
          step="3"
          title="Try a score"
          subtitle="Preview which band a Likelihood × Impact score would use (before Save)."
        >
          <div className="flex flex-wrap items-end gap-4">
            <Field label="Example score" hint={`Typical range 1–${maxScore}`}>
              <SoftNumberInput
                value={sampleScore}
                min={0}
                max={1000}
                className="w-32"
                onCommit={setSampleScore}
              />
            </Field>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-[var(--border)] dark:bg-white/5">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-400">
                Result
              </p>
              <p className="mt-1 text-[18px] font-bold text-slate-900 dark:text-white">
                {simplePreview.label}
              </p>
              <p className="mt-0.5 text-[12px] text-slate-500 dark:text-white/45">
                Score {sampleScore}
              </p>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Weighted Risk (System 2)"
          subtitle="Separate from Simple Risk. Fixed five levels — factor catalog unchanged."
        >
          <div className="mb-4 overflow-hidden rounded-xl border border-slate-200 dark:border-[var(--border)]">
            <div className="grid grid-cols-2 divide-x divide-y divide-slate-200 sm:grid-cols-5 sm:divide-y-0 dark:divide-[var(--border)]">
              {WEIGHTED_BANDS.map((band) => {
                const labelMap = {
                  LOW: config.weightedBandLabels.low,
                  MEDIUM: config.weightedBandLabels.medium,
                  HIGH: config.weightedBandLabels.high,
                  CRITICAL: config.weightedBandLabels.critical,
                  SEVERE: config.weightedBandLabels.severe,
                };
                const rangeMap = {
                  LOW: `< ${config.weightedBandCutoffs.low}`,
                  MEDIUM: `< ${config.weightedBandCutoffs.medium}`,
                  HIGH: `< ${config.weightedBandCutoffs.high}`,
                  CRITICAL: `< ${config.weightedBandCutoffs.critical}`,
                  SEVERE: `≥ ${config.weightedBandCutoffs.critical}`,
                };
                return (
                  <div
                    key={band}
                    className={cn(
                      "px-3 py-3 text-center",
                      weightedPreview.level === band && "bg-brand-500/10"
                    )}
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      {rangeMap[band]}
                    </p>
                    <p className="mt-1 text-[13px] font-bold text-slate-800 dark:text-white/90">
                      {labelMap[band]}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          <p className="mb-3 text-[13px] font-semibold text-slate-700 dark:text-white/80">
            Cutoffs (exclusive)
          </p>
          <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                ["low", config.weightedBandLabels.low],
                ["medium", config.weightedBandLabels.medium],
                ["high", config.weightedBandLabels.high],
                ["critical", config.weightedBandLabels.critical],
              ] as const
            ).map(([key, label]) => (
              <Field
                key={key}
                label={`Below this → ${label}`}
                hint={
                  key === "critical"
                    ? `At/above → ${config.weightedBandLabels.severe}`
                    : "Must increase left to right"
                }
              >
                <SoftNumberInput
                  value={config.weightedBandCutoffs[key]}
                  integer={false}
                  min={0.1}
                  max={100}
                  onCommit={(n) =>
                    update("weightedBandCutoffs", {
                      ...config.weightedBandCutoffs,
                      [key]: n,
                    })
                  }
                />
              </Field>
            ))}
          </div>
          {weightedCutoffError ? (
            <p className="mb-4 text-[13px] text-rose-600 dark:text-rose-300">
              {weightedCutoffError}
            </p>
          ) : null}

          <p className="mb-3 text-[13px] font-semibold text-slate-700 dark:text-white/80">
            Display names
          </p>
          <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {(["low", "medium", "high", "critical", "severe"] as const).map((key) => (
              <Field key={key} label={`${key} label`}>
                <input
                  className={taInput}
                  value={config.weightedBandLabels[key]}
                  onChange={(e) =>
                    update("weightedBandLabels", {
                      ...config.weightedBandLabels,
                      [key]: e.target.value,
                    })
                  }
                />
              </Field>
            ))}
          </div>

          <div className="flex flex-wrap items-end gap-4 rounded-xl bg-slate-50 px-4 py-3 dark:bg-white/5">
            <Field label="Try a weighted score" hint="Example: 3.6">
              <SoftNumberInput
                value={weightedSample}
                integer={false}
                className="w-32"
                onCommit={setWeightedSample}
              />
            </Field>
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-400">
                Result
              </p>
              <p className="mt-1 text-[16px] font-bold text-slate-900 dark:text-white">
                {weightedPreview.label}
              </p>
              <p className="text-[12px] text-slate-500 dark:text-white/45">
                Score {weightedSample}
              </p>
            </div>
          </div>
        </SectionCard>
      </div>
    </section>
  );
}
