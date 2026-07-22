"use client";

/**
 * Settings → Risk Engine — per-user Simple + Weighted band cutoffs/labels.
 * Does not edit the RiskFactor catalog (that remains under Risk Factors).
 */
import { useEffect, useMemo, useState } from "react";
import { Gauge, Save } from "lucide-react";
import {
  DEFAULT_RISK_ENGINE_CONFIG,
  normalizeRiskEngineConfig,
  resolveSimpleRiskLevel,
  resolveWeightedRiskLevel,
  simpleRiskLevelLabel,
  validateSimpleCutoffs,
  validateWeightedCutoffs,
  type RiskEngineConfig,
} from "@/lib/risk-engine-config";
import { taBtnPrimary, taInput } from "@/lib/styles";
import { cn } from "@/lib/utils";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </span>
      {children}
    </label>
  );
}

/**
 * Risk engine configuration panel with live Simple + Weighted previews.
 */
export function RiskEngineSettings() {
  const [config, setConfig] = useState<RiskEngineConfig>(DEFAULT_RISK_ENGINE_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sampleScore, setSampleScore] = useState(6);

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

  const simplePreview = useMemo(() => {
    const level = resolveSimpleRiskLevel(sampleScore, config);
    return { level, label: simpleRiskLevelLabel(level, config) };
  }, [config, sampleScore]);

  const weightedPreview = useMemo(() => {
    const sample = 3.6;
    const level = resolveWeightedRiskLevel(sample, config);
    const labelMap = {
      LOW: config.weightedBandLabels.low,
      MEDIUM: config.weightedBandLabels.medium,
      HIGH: config.weightedBandLabels.high,
      CRITICAL: config.weightedBandLabels.critical,
      SEVERE: config.weightedBandLabels.severe,
    };
    return { sample, level, label: labelMap[level] };
  }, [config]);

  const update = <K extends keyof RiskEngineConfig>(key: K, value: RiskEngineConfig[K]) => {
    setConfig((c) => ({ ...c, [key]: value }));
    setMessage(null);
    setError(null);
  };

  const save = async () => {
    const simpleErr = validateSimpleCutoffs(config.simpleBandCutoffs);
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
      setMessage("Saved. Risk list, heat map, and detail hero will use these bands.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-500">Loading risk engine settings…</p>;
  }

  return (
    <section className="font-sans text-gray-900 dark:text-white" aria-labelledby="risk-engine-title">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="risk-engine-title" className="flex items-center gap-2 text-[24px] font-bold tracking-[-0.02em]">
            <Gauge className="h-6 w-6 text-brand-600" aria-hidden />
            Risk Engine
          </h2>
          <p className="mt-1 max-w-2xl text-[14px] text-slate-500 dark:text-white/55">
            Configure Simple Risk (likelihood × impact) bands and Weighted Risk level
            thresholds for your user. The 44-factor catalog stays under{" "}
            <span className="font-semibold">Risk Factors</span> — this tab only controls
            labels and cutoffs.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className={cn(taBtnPrimary, "inline-flex items-center gap-2")}
        >
          <Save className="h-4 w-4" />
          {saving ? "Saving…" : "Save"}
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

      <div className="space-y-8">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-[var(--border)] dark:bg-[var(--card)]">
          <h3 className="text-[16px] font-bold">Simple Risk (System 1)</h3>
          <p className="mt-1 text-[13px] text-slate-500 dark:text-white/50">
            Defaults: scale 1–5, cutoffs ≤5 / ≤11 / ≤19 (LOW / MEDIUM / HIGH / CRITICAL).
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Likelihood max">
              <input
                type="number"
                min={2}
                max={10}
                className={taInput}
                value={config.likelihoodMax}
                onChange={(e) => update("likelihoodMax", Number(e.target.value))}
              />
            </Field>
            <Field label="Impact max">
              <input
                type="number"
                min={2}
                max={10}
                className={taInput}
                value={config.impactMax}
                onChange={(e) => update("impactMax", Number(e.target.value))}
              />
            </Field>
            <Field label="Low cutoff (≤)">
              <input
                type="number"
                className={taInput}
                value={config.simpleBandCutoffs.low}
                onChange={(e) =>
                  update("simpleBandCutoffs", {
                    ...config.simpleBandCutoffs,
                    low: Number(e.target.value),
                  })
                }
              />
            </Field>
            <Field label="Medium cutoff (≤)">
              <input
                type="number"
                className={taInput}
                value={config.simpleBandCutoffs.medium}
                onChange={(e) =>
                  update("simpleBandCutoffs", {
                    ...config.simpleBandCutoffs,
                    medium: Number(e.target.value),
                  })
                }
              />
            </Field>
            <Field label="High cutoff (≤)">
              <input
                type="number"
                className={taInput}
                value={config.simpleBandCutoffs.high}
                onChange={(e) =>
                  update("simpleBandCutoffs", {
                    ...config.simpleBandCutoffs,
                    high: Number(e.target.value),
                  })
                }
              />
            </Field>
            {(["low", "medium", "high", "critical"] as const).map((key) => (
              <Field key={key} label={`${key} label`}>
                <input
                  className={taInput}
                  value={config.simpleBandLabels[key]}
                  onChange={(e) =>
                    update("simpleBandLabels", {
                      ...config.simpleBandLabels,
                      [key]: e.target.value,
                    })
                  }
                />
              </Field>
            ))}
          </div>

          <div className="mt-5 rounded-xl bg-slate-50 px-4 py-3 dark:bg-white/5">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Live preview score">
                <input
                  type="number"
                  className={cn(taInput, "w-28")}
                  value={sampleScore}
                  onChange={(e) => setSampleScore(Number(e.target.value))}
                />
              </Field>
              <p className="pb-2 text-sm font-semibold text-slate-700 dark:text-white/80">
                Score {sampleScore} → {simplePreview.label}{" "}
                <span className="font-mono text-xs text-slate-400">({simplePreview.level})</span>
              </p>
            </div>
            <p className="mt-2 text-[12px] text-slate-500 dark:text-white/45">
              List chips, heat map cells, and the detail hero all use this same classifier —
              they cannot disagree.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-[var(--border)] dark:bg-[var(--card)]">
          <h3 className="text-[16px] font-bold">Weighted Risk (System 2)</h3>
          <p className="mt-1 text-[13px] text-slate-500 dark:text-white/50">
            Exclusive upper bounds (defaults &lt;1.5 / &lt;2.5 / &lt;3.5 / &lt;4.0 → SEVERE). Factor
            catalog and per-factor band rules are unchanged in this pass.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(["low", "medium", "high", "critical"] as const).map((key) => (
              <Field key={key} label={`${key} cutoff (&lt;)`}>
                <input
                  type="number"
                  step="0.1"
                  className={taInput}
                  value={config.weightedBandCutoffs[key]}
                  onChange={(e) =>
                    update("weightedBandCutoffs", {
                      ...config.weightedBandCutoffs,
                      [key]: Number(e.target.value),
                    })
                  }
                />
              </Field>
            ))}
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
          <p className="mt-4 text-sm text-slate-600 dark:text-white/70">
            Preview: weighted score {weightedPreview.sample} → {weightedPreview.label}{" "}
            <span className="font-mono text-xs text-slate-400">({weightedPreview.level})</span>
          </p>
        </div>
      </div>
    </section>
  );
}
