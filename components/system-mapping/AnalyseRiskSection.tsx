"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, Loader2, Search } from "lucide-react";
import type { MappingRisk } from "@/lib/system-mapping-types";
import { formatDate } from "@/lib/utils";

type AnalyseRiskSectionProps = {
  onHighlightEdge?: (edgeId: string | null) => void;
  compact?: boolean;
};

const dateClass =
  "w-full rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm text-gray-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-[var(--border)] dark:bg-[var(--card)] dark:text-white";

/** Runs the real date-range booking-conflict analysis for mapped environments. */
export function AnalyseRiskSection({ onHighlightEdge = () => undefined, compact = false }: AnalyseRiskSectionProps) {
  const searchParams = useSearchParams();
  const [from, setFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [to, setTo] = useState(() => {
    const end = new Date();
    end.setDate(end.getDate() + 30);
    return end.toISOString().slice(0, 10);
  });
  const [urlDatesApplied, setUrlDatesApplied] = useState(false);
  const [analysing, setAnalysing] = useState(false);
  const [risks, setRisks] = useState<MappingRisk[]>([]);
  const [ran, setRan] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (urlDatesApplied) return;
    const urlFrom = searchParams.get("from");
    const urlTo = searchParams.get("to");
    if (urlFrom) setFrom(urlFrom);
    if (urlTo) setTo(urlTo);
    setUrlDatesApplied(true);
  }, [searchParams, urlDatesApplied]);

  const runAnalysis = async () => {
    if (from > to) {
      setError("The end date must be on or after the start date.");
      return;
    }
    setAnalysing(true);
    setError(null);
    onHighlightEdge(null);
    try {
      const response = await fetch("/api/system-mapping/analyse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Analysis failed.");
      setRisks(Array.isArray(data.risks) ? data.risks : []);
      setRan(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Request failed — please try again.");
      setRisks([]);
    } finally {
      setAnalysing(false);
    }
  };

  return (
    <section className={compact ? "" : "rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-[var(--border)] dark:bg-[var(--card)]"}>
      {!compact && <h2 className="text-base font-bold text-gray-900 dark:text-white">Booking conflicts</h2>}
      <div className={`grid gap-2 ${compact ? "grid-cols-2" : "mt-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"}`}>
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
          From
          <input type="date" className={`${dateClass} mt-1`} value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
          To
          <input type="date" className={`${dateClass} mt-1`} value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
        <button
          type="button"
          onClick={() => void runAnalysis()}
          disabled={analysing || !from || !to}
          className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50 ${compact ? "col-span-2" : ""}`}
        >
          {analysing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {analysing ? "Analysing…" : "Run analysis"}
        </button>
      </div>

      {error && <p role="alert" className="mt-3 text-sm text-error-700 dark:text-error-300">{error}</p>}
      {ran && risks.length === 0 && !error && <p className="mt-3 text-sm text-success-700 dark:text-success-300">No booking conflicts found.</p>}
      {risks.length > 0 && (
        <div className="mt-3 space-y-2">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-error-700 dark:text-error-300">
            <AlertTriangle className="h-4 w-4" />
            {risks.length} conflict{risks.length === 1 ? "" : "s"} found
          </p>
          {risks.map((risk, index) => (
            <button
              key={`${risk.edgeId}-${index}`}
              type="button"
              onClick={() => onHighlightEdge(risk.edgeId)}
              className="w-full rounded-lg border border-error-200 bg-error-50/60 p-3 text-left text-sm transition hover:border-error-300 dark:bg-error-500/10"
            >
              <p className="font-semibold text-error-800 dark:text-error-200">{risk.source} → {risk.target}</p>
              <p className="mt-1 text-xs text-error-700 dark:text-error-300">{risk.risk}</p>
              <p className="mt-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                {risk.conflictEnv} · {formatDate(risk.fromDate)} → {formatDate(risk.toDate)}
              </p>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
