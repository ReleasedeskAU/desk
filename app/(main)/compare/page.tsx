"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { TopBar } from "@/components/layout/TopBar";
import { ReleaseCompareView } from "@/components/releases/ReleaseCompareView";
import { releases, services } from "@/lib/dummy-data";
import {
  buildCompareSnapshot,
  COMPARE_PRESETS,
} from "@/lib/release-comparison";
import { predictAllReleases } from "@/lib/predictive";
import { useReleaseStore } from "@/context/ReleaseStoreContext";

import { Columns2 } from "lucide-react";

export default function ComparePage() {
  const { getReleaseDecision } = useReleaseStore();
  const searchParams = useSearchParams();
  const leftParam = searchParams.get("left");
  const rightParam = searchParams.get("right");

  const [leftId, setLeftId] = useState("rel-v2140");
  const [rightId, setRightId] = useState("rel-v2141");

  useEffect(() => {
    if (leftParam && releases.some((r) => r.id === leftParam)) {
      setLeftId(leftParam);
    }
    if (rightParam && releases.some((r) => r.id === rightParam)) {
      setRightId(rightParam);
    }
  }, [leftParam, rightParam]);

  const unstableIds = useMemo(() => services.filter((s) => s.unstable).map((s) => s.id), []);
  const predictions = useMemo(() => predictAllReleases(releases, unstableIds), [unstableIds]);
  const predMap = useMemo(() => new Map(predictions.map((p) => [p.releaseId, p])), [predictions]);

  const leftRelease = releases.find((r) => r.id === leftId);
  const rightRelease = releases.find((r) => r.id === rightId);

  const leftSnap = leftRelease
    ? buildCompareSnapshot(leftRelease, predMap.get(leftId), getReleaseDecision(leftId)?.decision ?? null)
    : null;
  const rightSnap = rightRelease
    ? buildCompareSnapshot(rightRelease, predMap.get(rightId), getReleaseDecision(rightId)?.decision ?? null)
    : null;

  const activeReleases = releases.filter((r) => r.status !== "Shipped");

  return (
    <div className="w-full space-y-8 pb-24">
      <TopBar
        title="Release Comparison"
        subtitle="Side-by-side readiness, blockers, and ML forecasts — good vs bad"
        highlight
      />

      <div className="flex flex-wrap gap-3 items-center">
        <span className="text-sm font-semibold text-gray-500 mr-2 flex items-center gap-1.5"><Columns2 className="w-4 h-4" /> Presets:</span>
        {COMPARE_PRESETS.map((p) => {
          const isActive = leftId === p.leftId && rightId === p.rightId;
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                setLeftId(p.leftId);
                setRightId(p.rightId);
              }}
              className={`text-xs font-semibold rounded-full px-4 py-2 transition-all duration-300 shadow-sm border ${
                isActive
                  ? "bg-brand-500 text-white border-brand-500 shadow-brand-500/30 scale-105"
                  : "bg-white dark:bg-[var(--card)] border-gray-200 dark:border-[var(--border)] text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 hover:border-gray-300 hover:shadow-md"
              }`}
            >
              {p.label}
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 rounded-2xl border border-gray-200/80 dark:border-[var(--border)] bg-gradient-to-br from-white/60 to-gray-50/50 dark:from-[var(--card)] dark:to-[var(--card)] backdrop-blur-xl shadow-theme-sm relative overflow-hidden">
        
        <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.03] pointer-events-none mix-blend-overlay"></div>
        
        <div className="relative group">
          <label className="text-sm font-bold text-gray-700 dark:text-gray-200 block mb-2 tracking-wide uppercase text-[11px] ml-1">Baseline Release (Left)</label>
          <div className="relative">
            <select
              value={leftId}
              onChange={(e) => setLeftId(e.target.value)}
              className="w-full appearance-none rounded-xl border-2 border-gray-100 dark:border-gray-800 px-4 py-3.5 text-sm font-medium bg-white dark:bg-gray-900 shadow-sm focus:border-brand-500 focus:ring-4 focus:ring-brand-500/20 transition-all cursor-pointer group-hover:border-gray-200 dark:group-hover:border-gray-700"
            >
              {activeReleases.map((r) => (
                <option key={r.id} value={r.id}>{r.version} — {r.name} ({r.status})</option>
              ))}
            </select>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 group-hover:text-brand-500 transition-colors">
              <Columns2 className="w-4 h-4" />
            </div>
          </div>
        </div>

        <div className="relative group">
          <label className="text-sm font-bold text-gray-700 dark:text-gray-200 block mb-2 tracking-wide uppercase text-[11px] ml-1">Comparison Target (Right)</label>
          <div className="relative">
            <select
              value={rightId}
              onChange={(e) => setRightId(e.target.value)}
              className="w-full appearance-none rounded-xl border-2 border-gray-100 dark:border-gray-800 px-4 py-3.5 text-sm font-medium bg-white dark:bg-gray-900 shadow-sm focus:border-brand-500 focus:ring-4 focus:ring-brand-500/20 transition-all cursor-pointer group-hover:border-gray-200 dark:group-hover:border-gray-700"
            >
              {activeReleases.map((r) => (
                <option key={r.id} value={r.id}>{r.version} — {r.name} ({r.status})</option>
              ))}
            </select>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 group-hover:text-brand-500 transition-colors">
              <Columns2 className="w-4 h-4" />
            </div>
          </div>
        </div>
        
      </div>

      {leftSnap && rightSnap ? (
        <ReleaseCompareView left={leftSnap} right={rightSnap} />
      ) : (
        <div className="flex flex-col items-center justify-center py-20 rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50">
          <Columns2 className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-4" />
          <p className="text-gray-500 dark:text-gray-400 font-medium text-sm">Select two releases from the dropdowns above to begin comparison.</p>
        </div>
      )}
    </div>
  );
}
