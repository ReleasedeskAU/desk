"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronRight,
  Circle,
  Flame,
  Grid3x3,
  Plus,
  User,
} from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { TablePageToolbar } from "@/components/filters/TablePageToolbar";
import { RISK_SORT_PRESETS } from "@/lib/table-sort-presets";
import { DataTable, DataTableHeadRow, dataTableTableClass, tableCell, tableRow } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/badges/StatusBadge";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { cn, formatDate } from "@/lib/utils";
import { getRiskLevel, riskLevelChipClass, type RiskLevel } from "@/lib/risk-level";
import {
  DEFAULT_RISK_ENGINE_CONFIG,
  simpleBandScoreRanges,
  simpleRiskLevelLabel,
  scaleAxisValues,
  type RiskEngineConfig,
} from "@/lib/risk-engine-config";
import { useRiskEngineConfig } from "@/hooks/useRiskEngineConfig";
import { FilterPills, FilterRangeInputs, FilterSelect, FilterTextInput, TableFilterBar } from "@/components/filters/TableFilterBar";
import {
  RISK_COLUMNS,
  RISK_DEFAULT_HIDDEN_COLUMN_KEYS,
  RISK_DEFAULT_HIDDEN_FILTER_KEYS,
  RISK_FILTER_FIELDS,
} from "@/lib/table-page-columns";
import { useFilteredFetch } from "@/hooks/useTableFilters";
import { useTablePageLoading } from "@/hooks/useTablePageLoading";
import { loadJsonEffect, safeFetchJson } from "@/lib/safe-fetch";
import { useTablePagePreferences } from "@/hooks/useTablePagePreferences";
import { useHoverCapable } from "@/hooks/useHoverCapable";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { PageDocumentation } from "@/components/help/PageDocumentation";
import { RISKS_FILTER_SCHEMA } from "@/lib/table-filters";
import { RiskFormModal } from "@/components/risks/RiskFormModal";
import { canEdit as sessionCanEdit, type SessionUser } from "@/lib/auth/roles";
import { taBtnPrimary } from "@/lib/styles";

/** Calendar days from today to prod/start date (can be negative if past). */
function daysOutFrom(iso: string | null | undefined): number {
  if (!iso) return 0;
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export type RiskRow = {
  id: string;
  riskCode: string;
  releaseId: string;
  release: {
    id: string;
    releaseCode: string;
    name: string;
    status: string;
    startDate: string | null;
    releaseDate: string;
  };
  applicationName: string | null;
  departmentName: string | null;
  category: string;
  description: string;
  likelihood: number;
  impact: number;
  riskScore: number;
  affectedArea: string | null;
  mitigationStrategy: string | null;
  riskOwner: { id: string; userId: string; name: string; email: string } | null;
  status: string;
  notes: string | null;
};

type StatusFilter = "Open" | "Monitoring" | "Mitigating" | "In Progress" | "Escalated" | "Accepted";
type HeatMapView = "matrix" | "bubble" | "density";

/** Ownership is "concentrated" when one person owns more than half of owned risks. */
const OWNERSHIP_CONCENTRATION_THRESHOLD = 0.5;

/**
 * Empty cells use treatment, not a competing fifth fill.
 * #B6B2B2 is outline-only so LOW (#A8AFB1) stays clearly filled vs "nothing."
 */
const EMPTY_CELL = {
  bg: "transparent",
  border: "#B6B2B2",
  darkBg: "transparent",
  darkBorder: "#B6B2B2",
} as const;

/**
 * Heat-map band palette by index (0 = lowest). Supports up to 6 Simple bands.
 */
const BAND_PALETTE = [
  {
    bg: "#A8AFB1",
    text: "#1e293b",
    solid: "#A8AFB1",
    darkBg: "#B8BFC2",
    darkText: "#0f172a",
    darkSolid: "#B8BFC2",
  },
  {
    bg: "#959CA3",
    text: "#0f172a",
    solid: "#959CA3",
    darkBg: "#A8AFB6",
    darkText: "#0f172a",
    darkSolid: "#A8AFB6",
  },
  {
    bg: "#858C92",
    text: "#0f172a",
    solid: "#858C92",
    darkBg: "#9AA1A7",
    darkText: "#0f172a",
    darkSolid: "#9AA1A7",
  },
  {
    bg: "#6A655F",
    text: "#ffffff",
    solid: "#6A655F",
    darkBg: "#8B837A",
    darkText: "#ffffff",
    darkSolid: "#8B837A",
  },
  {
    bg: "#4A5158",
    text: "#ffffff",
    solid: "#4A5158",
    darkBg: "#636B73",
    darkText: "#f8fafc",
    darkSolid: "#636B73",
  },
  {
    bg: "#333A40",
    text: "#ffffff",
    solid: "#333A40",
    darkBg: "#4B545C",
    darkText: "#f8fafc",
    darkSolid: "#4B545C",
  },
] as const;

type BandPalette = (typeof BAND_PALETTE)[number];

function bandPaletteFor(
  bandId: RiskLevel,
  config: RiskEngineConfig
): BandPalette {
  const idx = config.simpleBands.findIndex((b) => b.id === bandId);
  const i = idx < 0 ? Math.max(0, config.simpleBands.length - 1) : idx;
  return BAND_PALETTE[Math.min(i, BAND_PALETTE.length - 1)]!;
}

function bandGuide(index: number, total: number): string {
  if (index <= 0) return "Monitor in normal process";
  if (index >= total - 1) return "Escalate — may block deploy";
  if (index >= total - 2) return "Active owner + mitigation needed";
  return "Plan mitigation before CAB";
}

function useIsDarkMode() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setDark(root.classList.contains("dark") || root.classList.contains("theme-dark"));
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);
  return dark;
}

function clampToScale(n: number, max: number) {
  return Math.min(max, Math.max(1, n));
}

/** rows: likelihood max→1, cols: impact 1→max */
function buildGrid(
  risks: RiskRow[],
  likelihoodMax: number,
  impactMax: number
): number[][] {
  const maxL = Math.max(2, Math.min(10, likelihoodMax));
  const maxI = Math.max(2, Math.min(10, impactMax));
  const grid = Array.from({ length: maxL }, () =>
    Array.from({ length: maxI }, (): number => 0)
  );
  for (const r of risks) {
    const li = clampToScale(r.likelihood, maxL);
    const im = clampToScale(r.impact, maxI);
    grid[maxL - li][im - 1]++;
  }
  return grid;
}

function bandCounts(
  risks: RiskRow[],
  config: RiskEngineConfig = DEFAULT_RISK_ENGINE_CONFIG
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const b of config.simpleBands) counts[b.id] = 0;
  for (const r of risks) {
    const id = getRiskLevel(r.riskScore, config);
    counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}

function maxCellCount(grid: number[][]): number {
  let max = 0;
  for (const row of grid) for (const c of row) if (c > max) max = c;
  return max;
}

/**
 * Biggest cluster: highest cell count. Ties broken by scan order —
 * likelihood 5→1 (top→bottom), then impact 1→5 (left→right); first max wins.
 */
function findBiggestCluster(
  grid: number[][],
  config: RiskEngineConfig = DEFAULT_RISK_ENGINE_CONFIG
): {
  likelihood: number;
  impact: number;
  count: number;
  band: RiskLevel;
} | null {
  const maxL = grid.length;
  let best: { likelihood: number; impact: number; count: number; band: RiskLevel } | null = null;
  for (let row = 0; row < maxL; row++) {
    const maxI = grid[row]?.length ?? 0;
    for (let col = 0; col < maxI; col++) {
      const count = grid[row][col];
      if (count === 0) continue;
      if (!best || count > best.count) {
        const likelihood = maxL - row;
        const impact = col + 1;
        best = {
          likelihood,
          impact,
          count,
          band: getRiskLevel(likelihood * impact, config),
        };
      }
    }
  }
  return best;
}

type OwnershipInsight =
  | {
      kind: "concentrated";
      ownerId: string;
      ownerName: string;
      ownedCount: number;
      totalOwned: number;
      pct: number;
      distinctOwners: number;
    }
  | {
      kind: "even";
      distinctOwners: number;
      totalOwned: number;
    }
  | { kind: "none" };

function ownershipInsight(risks: RiskRow[]): OwnershipInsight {
  const byOwner = new Map<string, { id: string; name: string; count: number }>();
  for (const r of risks) {
    if (!r.riskOwner) continue;
    const key = r.riskOwner.id;
    const existing = byOwner.get(key);
    if (existing) {
      existing.count++;
    } else {
      byOwner.set(key, {
        id: r.riskOwner.id,
        name: r.riskOwner.name || r.riskOwner.userId || "Unknown",
        count: 1,
      });
    }
  }

  const owners = [...byOwner.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.name.localeCompare(b.name);
  });

  const totalOwned = owners.reduce((sum, o) => sum + o.count, 0);
  if (totalOwned === 0 || owners.length === 0) return { kind: "none" };

  const top = owners[0];
  const pct = top.count / totalOwned;
  if (pct > OWNERSHIP_CONCENTRATION_THRESHOLD) {
    return {
      kind: "concentrated",
      ownerId: top.id,
      ownerName: top.name,
      ownedCount: top.count,
      totalOwned,
      pct: Math.round(pct * 100),
      distinctOwners: owners.length,
    };
  }

  return {
    kind: "even",
    distinctOwners: owners.length,
    totalOwned,
  };
}

function HeatMapCell({
  likelihood,
  impact,
  count,
  active,
  onSelect,
  dark,
  config = DEFAULT_RISK_ENGINE_CONFIG,
}: {
  likelihood: number;
  impact: number;
  count: number;
  active: boolean;
  onSelect: (likelihood: number, impact: number) => void;
  dark: boolean;
  config?: RiskEngineConfig;
}) {
  const [tipOpen, setTipOpen] = useState(false);
  const hoverCapable = useHoverCapable();
  const score = likelihood * impact;
  const band = getRiskLevel(score, config);
  const empty = count === 0;
  const c = bandPaletteFor(band, config);

  return (
    <button
      type="button"
      onClick={() => {
        if (empty) return;
        if (!hoverCapable) setTipOpen((v) => !v);
        onSelect(likelihood, impact);
      }}
      onMouseEnter={() => {
        if (hoverCapable && !empty) setTipOpen(true);
      }}
      onMouseLeave={() => {
        if (hoverCapable) setTipOpen(false);
      }}
      disabled={empty}
      aria-label={
        empty
          ? `Likelihood ${likelihood}, Impact ${impact}: no risks`
          : `Likelihood ${likelihood}, Impact ${impact}: ${count} risk${count === 1 ? "" : "s"}, ${simpleRiskLevelLabel(band, config)}`
      }
      className={cn(
        "group relative flex h-full w-full min-h-0 min-w-0 items-center justify-center rounded-2xl text-[clamp(13px,2.4vw,17px)] font-bold transition-all duration-150",
        "hover:z-10 hover:scale-[1.03] hover:shadow-md disabled:cursor-default disabled:hover:scale-100 disabled:hover:shadow-none",
        active && !empty && "ring-2 ring-brand-500 ring-offset-2 dark:ring-brand-400 dark:ring-offset-[var(--card)]"
      )}
      style={
        empty
          ? {
              background: dark ? EMPTY_CELL.darkBg : EMPTY_CELL.bg,
              border: `1.5px solid ${dark ? EMPTY_CELL.darkBorder : EMPTY_CELL.border}`,
            }
          : { background: dark ? c.darkBg : c.bg, color: dark ? c.darkText : c.text }
      }
    >
      {count > 0 ? count : ""}
      {tipOpen && !empty && (
        <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-44 -translate-x-1/2 rounded-xl bg-slate-900 p-2.5 text-left text-[11px] leading-snug text-white shadow-xl dark:bg-slate-950">
          <div className="font-bold">
            {count} risk{count !== 1 ? "s" : ""} · Score {score}
          </div>
          <div className="mt-0.5" style={{ color: dark ? c.darkSolid : c.solid }}>
            {simpleRiskLevelLabel(band, config)}
          </div>
          <div className="mt-1 text-white/60">
            Likelihood {likelihood} × Impact {impact}
          </div>
        </div>
      )}
    </button>
  );
}

function MatrixView({
  grid,
  selLi,
  selIm,
  onSelect,
  dark,
  config = DEFAULT_RISK_ENGINE_CONFIG,
}: {
  grid: number[][];
  selLi: number;
  selIm: number;
  onSelect: (likelihood: number, impact: number) => void;
  dark: boolean;
  config?: RiskEngineConfig;
}) {
  const maxL = grid.length;
  const maxI = grid[0]?.length ?? maxL;
  const likelihoodAxis = Array.from({ length: maxL }, (_, i) => maxL - i);
  const impactAxis = scaleAxisValues(maxI);

  return (
    <div className="grid h-full w-full grid-cols-[auto_minmax(0,1fr)] grid-rows-[minmax(0,1fr)_auto] gap-x-2 gap-y-1.5">
      <div className="flex items-center justify-center">
        <span
          className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500"
          style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
        >
          Likelihood
        </span>
      </div>

      <div className="grid min-h-0 min-w-0 grid-cols-[1.25rem_minmax(0,1fr)] grid-rows-[minmax(0,1fr)_auto] gap-x-1.5 gap-y-1">
        <div
          className="grid gap-1.5"
          style={{ gridTemplateRows: `repeat(${maxL}, minmax(0, 1fr))` }}
        >
          {likelihoodAxis.map((n) => (
            <span
              key={n}
              className="flex items-center justify-center text-[11px] font-bold tabular-nums text-slate-400 dark:text-slate-500"
            >
              {n}
            </span>
          ))}
        </div>
        <div
          className="grid min-h-0 min-w-0 gap-1.5"
          style={{
            gridTemplateColumns: `repeat(${maxI}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${maxL}, minmax(0, 1fr))`,
          }}
        >
          {grid.flatMap((row, rowIdx) => {
            const likelihood = maxL - rowIdx;
            return row.map((count, colIdx) => {
              const impact = colIdx + 1;
              return (
                <HeatMapCell
                  key={`${likelihood}-${impact}`}
                  likelihood={likelihood}
                  impact={impact}
                  count={count}
                  active={selLi === likelihood && selIm === impact}
                  onSelect={onSelect}
                  dark={dark}
                  config={config}
                />
              );
            });
          })}
        </div>
        <div />
        <div className="min-w-0">
          <div
            className="grid gap-1.5"
            style={{ gridTemplateColumns: `repeat(${maxI}, minmax(0, 1fr))` }}
          >
            {impactAxis.map((n) => (
              <span
                key={n}
                className="text-center text-[11px] font-bold tabular-nums text-slate-400 dark:text-slate-500"
              >
                {n}
              </span>
            ))}
          </div>
          <div className="mt-0.5 text-center text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
            Impact
          </div>
        </div>
      </div>
    </div>
  );
}

function BubbleView({
  grid,
  maxCount,
  onSelect,
  dark,
  config = DEFAULT_RISK_ENGINE_CONFIG,
}: {
  grid: number[][];
  maxCount: number;
  onSelect: (likelihood: number, impact: number) => void;
  dark: boolean;
  config?: RiskEngineConfig;
}) {
  const maxL = grid.length;
  const maxI = grid[0]?.length ?? maxL;
  const size = 420;
  const pad = 48;
  const step = (size - pad * 1.5) / Math.max(maxL, maxI);
  const pos = (likelihood: number, impact: number) => ({
    x: pad + (impact - 0.5) * step,
    y: size - pad - (likelihood - 0.5) * step,
  });
  const scale = maxCount > 0 ? maxCount : 1;
  const hoverCapable = useHoverCapable();
  const [tip, setTip] = useState<{
    x: number;
    y: number;
    count: number;
    score: number;
    band: RiskLevel;
    likelihood: number;
    impact: number;
  } | null>(null);

  return (
    <div className="relative h-full w-full">
      <svg viewBox={`0 0 ${size + 16} ${size}`} width="100%" height="100%" className="overflow-visible" preserveAspectRatio="xMidYMid meet">
        <rect
          x={pad}
          y={0}
          width={size - pad}
          height={size - pad}
          fill={dark ? "#1e293b" : "transparent"}
          stroke={EMPTY_CELL.border}
          strokeWidth={1}
        />
        {scaleAxisValues(Math.max(maxL, maxI)).map((n) => (
          <g key={n}>
            {n <= maxL ? (
              <line
                x1={pad}
                y1={size - pad - (n - 0.5) * step}
                x2={size}
                y2={size - pad - (n - 0.5) * step}
                className="stroke-slate-100 dark:stroke-slate-700"
              />
            ) : null}
            {n <= maxI ? (
              <line
                x1={pad + (n - 0.5) * step}
                y1={0}
                x2={pad + (n - 0.5) * step}
                y2={size - pad}
                className="stroke-slate-100 dark:stroke-slate-700"
              />
            ) : null}
          </g>
        ))}
        <line x1={pad} y1={0} x2={pad} y2={size - pad} className="stroke-slate-300 dark:stroke-slate-500" strokeWidth={1.5} />
        <line x1={pad} y1={size - pad} x2={size} y2={size - pad} className="stroke-slate-300 dark:stroke-slate-500" strokeWidth={1.5} />
        {scaleAxisValues(maxI).map((n) => (
          <text
            key={`xl${n}`}
            x={pad + (n - 0.5) * step}
            y={size - pad + 20}
            textAnchor="middle"
            fontSize="11"
            fontWeight="700"
            className="fill-slate-400 dark:fill-slate-500"
          >
            {n}
          </text>
        ))}
        {scaleAxisValues(maxL).map((n) => (
          <text
            key={`yl${n}`}
            x={pad - 14}
            y={size - pad - (n - 0.5) * step + 4}
            textAnchor="middle"
            fontSize="11"
            fontWeight="700"
            className="fill-slate-400 dark:fill-slate-500"
          >
            {n}
          </text>
        ))}

        {grid.flatMap((row, rowIdx) =>
          row.map((count, colIdx) => {
            if (count === 0) return null;
            const likelihood = maxL - rowIdx;
            const impact = colIdx + 1;
            const p = pos(likelihood, impact);
            const score = likelihood * impact;
            const band = getRiskLevel(score, config);
            const palette = bandPaletteFor(band, config);
            const solid = dark ? palette.darkSolid : palette.solid;
            const label = dark ? palette.darkText : palette.text;
            const r = 9 + (count / scale) * 26;
            const tipPayload = { x: p.x, y: p.y - r, count, score, band, likelihood, impact };
            return (
              <g
                key={`${likelihood}-${impact}`}
                className="cursor-pointer"
                onClick={() => {
                  onSelect(likelihood, impact);
                  if (!hoverCapable) {
                    setTip((prev) =>
                      prev?.likelihood === likelihood && prev?.impact === impact ? null : tipPayload
                    );
                  }
                }}
                onMouseEnter={() => {
                  if (hoverCapable) setTip(tipPayload);
                }}
                onMouseLeave={() => {
                  if (hoverCapable) setTip(null);
                }}
              >
                <circle cx={p.x} cy={p.y} r={r} fill={solid} stroke={solid} strokeWidth={2} />
                <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize="12" fontWeight="800" fill={label}>
                  {count}
                </text>
              </g>
            );
          })
        )}
      </svg>
      {tip && (
        <div
          className="pointer-events-none absolute z-20 w-44 -translate-x-1/2 -translate-y-full rounded-xl bg-slate-900 p-2.5 text-left text-[11px] leading-snug text-white shadow-xl dark:bg-slate-950"
          style={{
            left: `${(tip.x / (size + 16)) * 100}%`,
            top: `${(tip.y / size) * 100}%`,
          }}
        >
          <div className="font-bold">
            {tip.count} risk{tip.count !== 1 ? "s" : ""} · Score {tip.score}
          </div>
          <div
            className="mt-0.5"
            style={{
              color: dark
                ? bandPaletteFor(tip.band, config).darkSolid
                : bandPaletteFor(tip.band, config).solid,
            }}
          >
            {simpleRiskLevelLabel(tip.band, config)}
          </div>
          <div className="mt-1 text-white/60">
            Likelihood {tip.likelihood} × Impact {tip.impact}
          </div>
        </div>
      )}
    </div>
  );
}

function DensityView({
  grid,
  maxCount,
  onSelect,
  dark,
  config = DEFAULT_RISK_ENGINE_CONFIG,
}: {
  grid: number[][];
  maxCount: number;
  onSelect: (likelihood: number, impact: number) => void;
  dark: boolean;
  config?: RiskEngineConfig;
}) {
  const maxL = grid.length;
  const maxI = grid[0]?.length ?? maxL;
  const size = 420;
  const pad = 48;
  const step = (size - pad * 1.5) / Math.max(maxL, maxI);
  const pos = (likelihood: number, impact: number) => ({
    x: pad + (impact - 0.5) * step,
    y: size - pad - (likelihood - 0.5) * step,
  });
  const scale = maxCount > 0 ? maxCount : 1;

  const cells = (() => {
    const out: {
      likelihood: number;
      impact: number;
      count: number;
      band: RiskLevel;
      p: { x: number; y: number };
      r: number;
    }[] = [];
    grid.forEach((row, rowIdx) => {
      row.forEach((count, colIdx) => {
        if (count === 0) return;
        const likelihood = maxL - rowIdx;
        const impact = colIdx + 1;
        out.push({
          likelihood,
          impact,
          count,
          band: getRiskLevel(likelihood * impact, config),
          p: pos(likelihood, impact),
          r: 26 + (count / scale) * 50,
        });
      });
    });
    return out;
  })();

  return (
    <div className="h-full w-full">
      <svg viewBox={`0 0 ${size + 16} ${size}`} width="100%" height="100%" className="overflow-visible" preserveAspectRatio="xMidYMid meet">
        <defs>
          {cells.map((c) => (
            <radialGradient key={`g-${c.likelihood}-${c.impact}`} id={`risk-density-${c.likelihood}-${c.impact}`}>
              <stop
                offset="0%"
                stopColor={
                  dark
                    ? bandPaletteFor(c.band, config).darkSolid
                    : bandPaletteFor(c.band, config).solid
                }
                stopOpacity={dark ? 0.72 : 0.88}
              />
              <stop
                offset="100%"
                stopColor={
                  dark
                    ? bandPaletteFor(c.band, config).darkSolid
                    : bandPaletteFor(c.band, config).solid
                }
                stopOpacity={0}
              />
            </radialGradient>
          ))}
        </defs>
        <rect
          x={pad}
          y={0}
          width={size - pad}
          height={size - pad}
          fill={dark ? "#1e293b" : "#fafbfd"}
          stroke={EMPTY_CELL.border}
          strokeWidth={1}
        />
        <g style={{ mixBlendMode: "normal" }}>
          {cells.map((c) => (
            <circle
              key={`glow-${c.likelihood}-${c.impact}`}
              cx={c.p.x}
              cy={c.p.y}
              r={c.r}
              fill={`url(#risk-density-${c.likelihood}-${c.impact})`}
            />
          ))}
        </g>
        <g stroke={EMPTY_CELL.border} strokeWidth={1} opacity={0.85}>
          {Array.from({ length: maxI + 1 }, (_, n) => (
            <line key={`gx${n}`} x1={pad + n * step} y1={0} x2={pad + n * step} y2={size - pad} />
          ))}
          {Array.from({ length: maxL + 1 }, (_, n) => (
            <line key={`gy${n}`} x1={pad} y1={n * step} x2={size} y2={n * step} />
          ))}
        </g>
        {cells.map((c) => (
          <g
            key={`pt-${c.likelihood}-${c.impact}`}
            className="cursor-pointer"
            onClick={() => onSelect(c.likelihood, c.impact)}
          >
            <circle cx={c.p.x} cy={c.p.y} r={3} fill={dark ? "#e2e8f0" : "#1e293b"} />
            <text
              x={c.p.x}
              y={c.p.y - 10}
              textAnchor="middle"
              fontSize="12"
              fontWeight="800"
              fill={dark ? "#f1f5f9" : "#1e293b"}
            >
              {c.count}
            </text>
          </g>
        ))}
        <line x1={pad} y1={0} x2={pad} y2={size - pad} className="stroke-slate-300 dark:stroke-slate-500" strokeWidth={1.5} />
        <line x1={pad} y1={size - pad} x2={size} y2={size - pad} className="stroke-slate-300 dark:stroke-slate-500" strokeWidth={1.5} />
        {scaleAxisValues(maxI).map((n) => (
          <text
            key={`xl${n}`}
            x={pad + (n - 0.5) * step}
            y={size - pad + 20}
            textAnchor="middle"
            fontSize="11"
            fontWeight="700"
            className="fill-slate-400 dark:fill-slate-500"
          >
            {n}
          </text>
        ))}
        {scaleAxisValues(maxL).map((n) => (
          <text
            key={`yl${n}`}
            x={pad - 14}
            y={size - pad - (n - 0.5) * step + 4}
            textAnchor="middle"
            fontSize="11"
            fontWeight="700"
            className="fill-slate-400 dark:fill-slate-500"
          >
            {n}
          </text>
        ))}
      </svg>
    </div>
  );
}

function LegendRow({
  band,
  count,
  total,
  dark,
  config = DEFAULT_RISK_ENGINE_CONFIG,
}: {
  band: RiskLevel;
  count: number;
  total: number;
  dark: boolean;
  config?: RiskEngineConfig;
}) {
  const c = bandPaletteFor(band, config);
  const bandColor = dark ? c.darkSolid : c.solid;
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  const ranges = simpleBandScoreRanges(config);
  const bandIndex = config.simpleBands.findIndex((b) => b.id === band);
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
      <span className="h-3 w-3 shrink-0 rounded-md" style={{ background: bandColor }} />
      <span
        className="text-[12px] font-semibold text-slate-700 dark:text-slate-200"
        style={dark ? { color: c.darkText } : undefined}
      >
        {simpleRiskLevelLabel(band, config)}
      </span>
      <span className="text-[11px] tabular-nums text-slate-400 dark:text-slate-500">
        {ranges[band]}
      </span>
      <div className="h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: bandColor }} />
      </div>
      <span className="min-w-0 flex-1 basis-full text-[11px] text-slate-500 sm:basis-auto dark:text-slate-400">
        {bandGuide(bandIndex < 0 ? 0 : bandIndex, config.simpleBands.length)}
      </span>
    </div>
  );
}

export function RiskHeatMapSection({
  risks,
  selectedLikelihood,
  selectedImpact,
  onCellSelect,
  onOwnerSelect,
}: {
  risks: RiskRow[];
  selectedLikelihood: string;
  selectedImpact: string;
  onCellSelect: (likelihood: number, impact: number) => void;
  onOwnerSelect: (ownerId: string) => void;
}) {
  const { config: riskConfig } = useRiskEngineConfig();
  const [view, setView] = useState<HeatMapView>("matrix");
  const dark = useIsDarkMode();
  const grid = useMemo(
    () => buildGrid(risks, riskConfig.likelihoodMax, riskConfig.impactMax),
    [risks, riskConfig.likelihoodMax, riskConfig.impactMax]
  );
  const counts = useMemo(() => bandCounts(risks, riskConfig), [risks, riskConfig]);
  const total = useMemo(
    () => riskConfig.simpleBands.reduce((sum, b) => sum + (counts[b.id] ?? 0), 0),
    [counts, riskConfig.simpleBands]
  );
  const maxCount = useMemo(() => maxCellCount(grid), [grid]);
  const cluster = useMemo(() => findBiggestCluster(grid, riskConfig), [grid, riskConfig]);
  const ownership = useMemo(() => ownershipInsight(risks), [risks]);

  const selLi = selectedLikelihood ? parseInt(selectedLikelihood, 10) : NaN;
  const selIm = selectedImpact ? parseInt(selectedImpact, 10) : NaN;

  const VIEWS: { key: HeatMapView; label: string; icon: typeof Grid3x3 }[] = [
    { key: "matrix", label: "Matrix", icon: Grid3x3 },
    { key: "bubble", label: "Bubble", icon: Circle },
    { key: "density", label: "Density", icon: Flame },
  ];

  return (
    <div className="mb-4 w-full overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm dark:border-[var(--border)] dark:bg-[var(--card)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3.5 sm:px-5 dark:border-[var(--border)]">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-tight text-slate-900 dark:text-white">
            Risk Heat Map
          </h2>
          <p className="mt-0.5 text-[12px] text-slate-500 dark:text-slate-400">
            Qualitative risks for the filtered set · tap a cell to filter the table below
          </p>
        </div>
        <div className="flex rounded-lg bg-slate-100/90 p-0.5 dark:bg-slate-800">
          {VIEWS.map((v) => {
            const Icon = v.icon;
            return (
              <button
                key={v.key}
                type="button"
                onClick={() => setView(v.key)}
                aria-label={v.label}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-semibold transition-colors sm:px-3",
                  view === v.key
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white"
                    : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                )}
              >
                <Icon size={13} />
                <span className="hidden sm:inline">{v.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 lg:items-stretch">
        <div className="flex min-h-[240px] items-stretch justify-stretch border-b border-slate-100 bg-[#f8fafc] p-3 sm:min-h-[320px] sm:p-4 dark:border-[var(--border)] dark:bg-slate-900/40 lg:min-h-[380px] lg:border-b-0 lg:border-r">
          <div className="h-full min-h-[200px] w-full sm:min-h-[280px] lg:min-h-[348px]">
            {view === "matrix" && (
              <MatrixView
                grid={grid}
                selLi={selLi}
                selIm={selIm}
                onSelect={onCellSelect}
                dark={dark}
                config={riskConfig}
              />
            )}
            {view === "bubble" && (
              <BubbleView
                grid={grid}
                maxCount={maxCount}
                onSelect={onCellSelect}
                dark={dark}
                config={riskConfig}
              />
            )}
            {view === "density" && (
              <DensityView
                grid={grid}
                maxCount={maxCount}
                onSelect={onCellSelect}
                dark={dark}
                config={riskConfig}
              />
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-col justify-center gap-4 px-4 py-4 sm:px-6 sm:py-6 lg:min-h-[380px]">
          <details className="group lg:hidden">
            <summary className="cursor-pointer list-none text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 marker:content-none dark:text-slate-500">
              <span className="inline-flex items-center gap-1">
                How to read
                <ChevronRight size={12} className="transition group-open:rotate-90" />
              </span>
            </summary>
            <div className="mt-2 space-y-2">
              <p className="text-[13px] leading-relaxed text-slate-600 dark:text-slate-300">
                Each risk is scored on{" "}
                <span className="font-semibold text-slate-800 dark:text-white">Likelihood</span> (Y-axis)
                and{" "}
                <span className="font-semibold text-slate-800 dark:text-white">Impact</span> (X-axis), each
                from 1–5. Cell numbers are risk counts. Hotter cells are higher CAB priority.
              </p>
              <div className="inline-flex rounded-lg bg-brand-50 px-3 py-1.5 text-[12.5px] font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                Score = Likelihood × Impact (1–25)
              </div>
            </div>
          </details>

          <div className="hidden lg:block">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">
              How to read
            </p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-slate-600 dark:text-slate-300">
              Each risk is scored on{" "}
              <span className="font-semibold text-slate-800 dark:text-white">Likelihood</span> (Y-axis,
              how likely it is) and{" "}
              <span className="font-semibold text-slate-800 dark:text-white">Impact</span> (X-axis, how
              bad if it happens), each from 1–5. The number in a cell is how many risks sit at that
              pair. Darker / hotter cells mean higher priority for CAB discussion.
            </p>
            <div className="mt-2.5 inline-flex rounded-lg bg-brand-50 px-3 py-1.5 text-[12.5px] font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
              Score = Likelihood × Impact (1–25)
            </div>
            <ul className="mt-3 space-y-1 text-[12px] leading-snug text-slate-500 dark:text-slate-400">
              <li>
                <span className="font-medium text-slate-700 dark:text-slate-200">Matrix</span> — count
                per Likelihood × Impact cell
              </li>
              <li>
                <span className="font-medium text-slate-700 dark:text-slate-200">Bubble</span> — same
                grid; bubble size scales with count
              </li>
              <li>
                <span className="font-medium text-slate-700 dark:text-slate-200">Density</span> —
                intensity shading where risks concentrate
              </li>
              <li>
                Separate from Weighted Risk Score on Risk Factors — this map is for qualitative CAB
                risks only.
              </li>
            </ul>
          </div>

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">
              Levels in this view
            </p>
            <div className="space-y-2">
              {riskConfig.simpleBands.map((band) => (
                <LegendRow
                  key={band.id}
                  band={band.id}
                  count={counts[band.id] ?? 0}
                  total={total}
                  dark={dark}
                  config={riskConfig}
                />
              ))}
            </div>
            {total > 0 && (
              <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
                {total} risk{total === 1 ? "" : "s"} in the current filter set
              </p>
            )}
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2">
            {cluster && cluster.count >= 2 && (
              <button
                type="button"
                onClick={() => onCellSelect(cluster.likelihood, cluster.impact)}
                className="rounded-xl border border-amber-200/80 bg-amber-50/80 p-3 text-left transition hover:border-amber-300 hover:bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/10 dark:hover:bg-amber-500/15"
              >
                <div className="flex items-center gap-1.5 text-[12px] font-semibold text-amber-800 dark:text-amber-300">
                  <Flame size={13} /> Biggest cluster
                </div>
                <p className="mt-1 text-[12px] leading-snug text-amber-900/90 dark:text-amber-100/85">
                  {cluster.count} at L{cluster.likelihood}×I{cluster.impact} ·{" "}
                  {simpleRiskLevelLabel(cluster.band, riskConfig)}
                </p>
                <span className="mt-1.5 inline-flex items-center gap-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                  View <ChevronRight size={12} />
                </span>
              </button>
            )}

            {ownership.kind === "concentrated" && (
              <button
                type="button"
                onClick={() => onOwnerSelect(ownership.ownerId)}
                className="rounded-xl border border-rose-200/80 bg-rose-50/80 p-3 text-left transition hover:border-rose-300 hover:bg-rose-50 dark:border-rose-500/20 dark:bg-rose-500/10 dark:hover:bg-rose-500/15"
              >
                <div className="flex items-center gap-1.5 text-[12px] font-semibold text-rose-800 dark:text-rose-300">
                  <User size={13} /> Ownership
                </div>
                <p className="mt-1 text-[12px] leading-snug text-rose-900/90 dark:text-rose-100/85">
                  {ownership.ownerName} · {ownership.pct}%
                </p>
                <span className="mt-1.5 inline-flex items-center gap-0.5 text-[11px] font-semibold text-rose-700 dark:text-rose-400">
                  View <ChevronRight size={12} />
                </span>
              </button>
            )}

            {ownership.kind === "even" && (
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-600 dark:bg-slate-800/40">
                <div className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-700 dark:text-slate-200">
                  <User size={13} /> Ownership
                </div>
                <p className="mt-1 text-[12px] leading-snug text-slate-600 dark:text-slate-300">
                  Spread across {ownership.distinctOwners} people
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RiskRegisterContent() {
  const { config: riskConfig } = useRiskEngineConfig();
  const {
    rows: risks,
    loading,
    values,
    setFilter,
    setFilters,
    setSort,
    clearAll,
    hasActive,
    sortKey,
    sortDir,
    toggleSort,
    refetch,
  } = useFilteredFetch<RiskRow>("/api/risks", RISKS_FILTER_SCHEMA, {
    defaultSortKey: "riskScore",
    defaultSortDir: "desc",
    sortAccessors: {
      riskCode: (r) => r.riskCode,
      releaseCode: (r) => r.release.releaseCode,
      releaseName: (r) => r.release.name,
      application: (r) => r.applicationName ?? "",
      department: (r) => r.departmentName ?? "",
      prodDate: (r) => r.release.startDate ?? r.release.releaseDate ?? "",
      daysOut: (r) => daysOutFrom(r.release.startDate ?? r.release.releaseDate),
      category: (r) => r.category,
      description: (r) => r.description,
      likelihood: (r) => r.likelihood,
      impact: (r) => r.impact,
      riskScore: (r) => r.riskScore,
      affectedArea: (r) => r.affectedArea ?? "",
      mitigationStrategy: (r) => r.mitigationStrategy ?? "",
      riskOwner: (r) => r.riskOwner?.name ?? r.riskOwner?.userId ?? "",
      status: (r) => r.status,
      notes: (r) => r.notes ?? "",
      riskOwnerId: (r) => r.riskOwner?.userId ?? "",
    },
  });
  const [allRisks, setAllRisks] = useState<RiskRow[]>([]);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const canEdit = sessionCanEdit(user);

  useEffect(() => {
    return loadJsonEffect<RiskRow[]>("/api/risks", setAllRisks, { label: "risks" });
  }, []);

  useEffect(() => {
    return loadJsonEffect<{ user: SessionUser }>("/api/auth/me", (data) => setUser(data.user), {
      label: "risks-auth",
    });
  }, []);

  const categories = useMemo(() => [...new Set(allRisks.map((r) => r.category))].sort(), [allRisks]);
  const statuses: StatusFilter[] = ["Open", "Monitoring", "Mitigating", "In Progress", "Escalated", "Accepted"];

  const { isColumnVisible, columnPicker, filterPicker, isFilterVisible, prefsLoaded } = useTablePagePreferences(
    "risks",
    RISK_COLUMNS,
    RISK_FILTER_FIELDS,
    {
      lockedKeys: ["riskCode"],
      defaultHiddenFilters: RISK_DEFAULT_HIDDEN_FILTER_KEYS,
      defaultHiddenColumns: RISK_DEFAULT_HIDDEN_COLUMN_KEYS,
    }
  );

  const tablePending = useTablePageLoading(loading, prefsLoaded);

  const visibleColCount = RISK_COLUMNS.filter((c) => isColumnVisible(c.key)).length;

  const onCellSelect = (likelihood: number, impact: number) => {
    setFilters({ likelihood: String(likelihood), impact: String(impact) });
  };

  const onOwnerSelect = (ownerId: string) => {
    // Heatmap deep-links by User cuid; riskWhere accepts cuid OR name contains.
    setFilters({ riskOwnerQ: ownerId, likelihood: "", impact: "" });
  };

  return (
    <div>
      <TopBar
        pageKey="risks"
        trailing={
          <div className="flex flex-wrap items-center gap-2">
            {canEdit ? (
              <button type="button" className={cn(taBtnPrimary, "text-sm")} onClick={() => setModalOpen(true)}>
                <Plus className="mr-1 inline h-4 w-4" /> Add New Risk
              </button>
            ) : null}
            <PageDocumentation pageKey="risks" />
          </div>
        }
        title="Risk"
        subtitle={`${risks.length} risk${risks.length === 1 ? "" : "s"} across all releases`}
      />
      <RiskFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={() => {
          refetch();
          void safeFetchJson<RiskRow[]>("/api/risks", { label: "risks-post-create-refresh" }).then((result) => {
            if (result.ok) setAllRisks(result.data);
          });
        }}
        categoryOptions={categories}
      />
      {!tablePending && (
        <TableFilterBar hasActive={hasActive} onClear={clearAll} manageFilters={filterPicker}>
          {isFilterVisible("status") && (
            <FilterPills
              options={statuses.map((s) => ({ value: s, label: s }))}
              value={(values.status as StatusFilter) || ""}
              onChange={(v) => setFilter("status", v)}
            />
          )}
          {isFilterVisible("category") && (
            <FilterSelect value={values.category} onChange={(v) => setFilter("category", v)}>
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </FilterSelect>
          )}
          {isFilterVisible("likelihood") && (
            <FilterSelect value={values.likelihood} onChange={(v) => setFilter("likelihood", v)}>
              <option value="">All likelihood</option>
              {scaleAxisValues(riskConfig.likelihoodMax).map((n) => (
                <option key={n} value={String(n)}>
                  {n}
                </option>
              ))}
            </FilterSelect>
          )}
          {isFilterVisible("impact") && (
            <FilterSelect value={values.impact} onChange={(v) => setFilter("impact", v)}>
              <option value="">All impact</option>
              {scaleAxisValues(riskConfig.impactMax).map((n) => (
                <option key={n} value={String(n)}>
                  {n}
                </option>
              ))}
            </FilterSelect>
          )}
          {isFilterVisible("riskOwnerQ") && (
            <FilterTextInput
              value={values.riskOwnerQ}
              onChange={(v) => setFilter("riskOwnerQ", v)}
              placeholder="Risk owner name or ID…"
            />
          )}
          {isFilterVisible("riskScore") && (
            <div className="inline-flex items-center gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Score</span>
              <FilterRangeInputs
                minValue={values.riskScoreMin}
                maxValue={values.riskScoreMax}
                onMinChange={(v) => setFilter("riskScoreMin", v)}
                onMaxChange={(v) => setFilter("riskScoreMax", v)}
              />
            </div>
          )}
          {isFilterVisible("riskCodeQ") && (
            <FilterTextInput
              value={values.riskCodeQ}
              onChange={(v) => setFilter("riskCodeQ", v)}
              placeholder="Risk ID…"
            />
          )}
          {isFilterVisible("releaseCodeQ") && (
            <FilterTextInput
              value={values.releaseCodeQ}
              onChange={(v) => setFilter("releaseCodeQ", v)}
              placeholder="Release ID…"
            />
          )}
          {isFilterVisible("releaseNameQ") && (
            <FilterTextInput
              value={values.releaseNameQ}
              onChange={(v) => setFilter("releaseNameQ", v)}
              placeholder="Release name…"
            />
          )}
          {isFilterVisible("applicationQ") && (
            <FilterTextInput
              value={values.applicationQ}
              onChange={(v) => setFilter("applicationQ", v)}
              placeholder="Application…"
            />
          )}
          {isFilterVisible("departmentQ") && (
            <FilterTextInput
              value={values.departmentQ}
              onChange={(v) => setFilter("departmentQ", v)}
              placeholder="Department…"
            />
          )}
          {isFilterVisible("prodDateQ") && (
            <FilterTextInput
              value={values.prodDateQ}
              onChange={(v) => setFilter("prodDateQ", v)}
              placeholder="Prod date (YYYY-MM-DD)…"
            />
          )}
          {isFilterVisible("daysOut") && (
            <div className="inline-flex items-center gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Days out</span>
              <FilterRangeInputs
                minValue={values.daysOutMin}
                maxValue={values.daysOutMax}
                onMinChange={(v) => setFilter("daysOutMin", v)}
                onMaxChange={(v) => setFilter("daysOutMax", v)}
              />
            </div>
          )}
          {isFilterVisible("descriptionQ") && (
            <FilterTextInput
              value={values.descriptionQ}
              onChange={(v) => setFilter("descriptionQ", v)}
              placeholder="Description…"
            />
          )}
          {isFilterVisible("affectedAreaQ") && (
            <FilterTextInput
              value={values.affectedAreaQ}
              onChange={(v) => setFilter("affectedAreaQ", v)}
              placeholder="Affected area…"
            />
          )}
          {isFilterVisible("mitigationStrategyQ") && (
            <FilterTextInput
              value={values.mitigationStrategyQ}
              onChange={(v) => setFilter("mitigationStrategyQ", v)}
              placeholder="Mitigation…"
            />
          )}
          {isFilterVisible("notesQ") && (
            <FilterTextInput
              value={values.notesQ}
              onChange={(v) => setFilter("notesQ", v)}
              placeholder="Notes…"
            />
          )}
        </TableFilterBar>
      )}

      {!tablePending && (
        <RiskHeatMapSection
          risks={risks}
          selectedLikelihood={values.likelihood ?? ""}
          selectedImpact={values.impact ?? ""}
          onCellSelect={onCellSelect}
          onOwnerSelect={onOwnerSelect}
        />
      )}

      {tablePending ? (
        <TableSkeleton columns={RISK_COLUMNS.length} />
      ) : (
        <DataTable
          title="All Risks"
          icon={AlertTriangle}
          toolbar={
            <TablePageToolbar
              columnPicker={columnPicker}
              presets={RISK_SORT_PRESETS}
              sortKey={sortKey}
              sortDir={sortDir}
              onSelectSort={setSort}
            />
          }
        >
          <div className="overflow-x-auto">
            <table className={dataTableTableClass}>
              <thead>
                <DataTableHeadRow
                  columns={RISK_COLUMNS}
                  isColumnVisible={isColumnVisible}
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                />
              </thead>
              <tbody>
                {risks.length === 0 ? (
                  <tr>
                    <td colSpan={visibleColCount} className={`${tableCell} text-center text-gray-400 py-8`}>
                      No risks found.
                    </td>
                  </tr>
                ) : (
                  risks.map((r) => {
                    const prodIso = r.release.startDate ?? r.release.releaseDate;
                    return (
                    <tr key={r.id} className={tableRow}>
                      {isColumnVisible("riskCode") && (
                        <td className={`${tableCell} whitespace-nowrap`}>
                          <ProgressLink
                            href={`/risks/${r.id}`}
                            className="font-mono text-xs text-brand-600 dark:text-brand-400 hover:underline"
                          >
                            {r.riskCode}
                          </ProgressLink>
                        </td>
                      )}
                      {isColumnVisible("releaseCode") && (
                        <td className={`${tableCell} whitespace-nowrap`}>
                          <ProgressLink
                            href={`/releases/${r.release.id}`}
                            className="text-brand-600 dark:text-brand-400 hover:underline font-mono text-xs"
                          >
                            {r.release.releaseCode}
                          </ProgressLink>
                        </td>
                      )}
                      {isColumnVisible("releaseName") && (
                        <td className={`${tableCell} max-w-[220px] truncate`} title={r.release.name}>
                          {r.release.name}
                        </td>
                      )}
                      {isColumnVisible("application") && (
                        <td className={`${tableCell} whitespace-nowrap`}>{r.applicationName ?? "—"}</td>
                      )}
                      {isColumnVisible("department") && (
                        <td className={`${tableCell} whitespace-nowrap`}>{r.departmentName ?? "—"}</td>
                      )}
                      {isColumnVisible("prodDate") && (
                        <td className={`${tableCell} whitespace-nowrap`}>{prodIso ? formatDate(prodIso) : "—"}</td>
                      )}
                      {isColumnVisible("daysOut") && (
                        <td className={`${tableCell} text-center whitespace-nowrap`}>{daysOutFrom(prodIso)}</td>
                      )}
                      {isColumnVisible("category") && (
                        <td className={`${tableCell} whitespace-nowrap`}>{r.category}</td>
                      )}
                      {isColumnVisible("description") && (
                        <td className={`${tableCell} max-w-[260px] truncate`} title={r.description}>
                          {r.description}
                        </td>
                      )}
                      {isColumnVisible("likelihood") && (
                        <td className={`${tableCell} text-center whitespace-nowrap`}>{r.likelihood}</td>
                      )}
                      {isColumnVisible("impact") && (
                        <td className={`${tableCell} text-center whitespace-nowrap`}>{r.impact}</td>
                      )}
                      {isColumnVisible("riskScore") && (
                        <td className={`${tableCell} whitespace-nowrap`}>
                          <span
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold",
                              riskLevelChipClass(
                                getRiskLevel(r.riskScore, riskConfig),
                                riskConfig
                              )
                            )}
                          >
                            {r.riskScore} ·{" "}
                            {simpleRiskLevelLabel(
                              getRiskLevel(r.riskScore, riskConfig),
                              riskConfig
                            )}
                          </span>
                        </td>
                      )}
                      {isColumnVisible("affectedArea") && (
                        <td
                          className={`${tableCell} whitespace-nowrap text-gray-600 dark:text-gray-300 truncate max-w-[200px]`}
                          title={r.affectedArea ?? ""}
                        >
                          {r.affectedArea ?? "—"}
                        </td>
                      )}
                      {isColumnVisible("mitigationStrategy") && (
                        <td
                          className={`${tableCell} whitespace-nowrap text-gray-600 dark:text-gray-300 truncate max-w-[200px]`}
                          title={r.mitigationStrategy ?? ""}
                        >
                          {r.mitigationStrategy ?? "—"}
                        </td>
                      )}
                      {isColumnVisible("riskOwner") && (
                        <td className={`${tableCell} whitespace-nowrap text-gray-600 dark:text-gray-300`}>
                          {r.riskOwner?.name ?? "—"}
                        </td>
                      )}
                      {isColumnVisible("status") && (
                        <td className={`${tableCell} whitespace-nowrap`}>
                          <StatusBadge status={r.status} />
                        </td>
                      )}
                      {isColumnVisible("notes") && (
                        <td
                          className={`${tableCell} whitespace-nowrap text-gray-600 dark:text-gray-300 truncate max-w-[200px]`}
                          title={r.notes ?? ""}
                        >
                          {r.notes ?? "—"}
                        </td>
                      )}
                      {isColumnVisible("riskOwnerId") && (
                        <td className={`${tableCell} whitespace-nowrap font-mono text-xs text-gray-600 dark:text-gray-300`}>
                          {r.riskOwner?.userId ?? "—"}
                        </td>
                      )}
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </DataTable>
      )}
    </div>
  );
}
