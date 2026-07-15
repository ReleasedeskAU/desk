"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronRight,
  Circle,
  Flame,
  Grid3x3,
  User,
} from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { TablePageToolbar } from "@/components/filters/TablePageToolbar";
import { RISK_SORT_PRESETS } from "@/lib/table-sort-presets";
import { DataTable, DataTableHeadRow, dataTableTableClass, tableCell, tableRow } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/badges/StatusBadge";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { cn, formatDate } from "@/lib/utils";
import { getRiskLevel, RISK_LEVEL_COLOR, type RiskLevel } from "@/lib/risk-level";
import { FilterPills, FilterRangeInputs, FilterSelect, FilterTextInput, TableFilterBar } from "@/components/filters/TableFilterBar";
import {
  RISK_COLUMNS,
  RISK_DEFAULT_HIDDEN_COLUMN_KEYS,
  RISK_DEFAULT_HIDDEN_FILTER_KEYS,
  RISK_FILTER_FIELDS,
} from "@/lib/table-page-columns";
import { useFilteredFetch } from "@/hooks/useTableFilters";
import { useTablePageLoading } from "@/hooks/useTablePageLoading";
import { loadJsonEffect } from "@/lib/safe-fetch";
import { useTablePagePreferences } from "@/hooks/useTablePagePreferences";
import { useHoverCapable } from "@/hooks/useHoverCapable";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { PageDocumentation } from "@/components/help/PageDocumentation";
import { RISKS_FILTER_SCHEMA } from "@/lib/table-filters";

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

/** Empty cells — dark graphite (distinct from LOW dark green). */
const EMPTY_CELL = {
  bg: "#374151",
  text: "#9ca3af",
  border: "#4b5563",
  darkBg: "#1f2937",
  darkText: "#6b7280",
  darkBorder: "#374151",
} as const;

/** Heat-map band palette — dark green / yellow / orange / red. */
const BAND_COLOR: Record<
  RiskLevel,
  { bg: string; text: string; solid: string; darkBg: string; darkText: string; darkSolid: string }
> = {
  LOW: {
    bg: "#14532d",
    text: "#ecfdf5",
    solid: "#166534",
    darkBg: "#14532d",
    darkText: "#bbf7d0",
    darkSolid: "#22c55e",
  },
  MEDIUM: {
    bg: "#eab308",
    text: "#422006",
    solid: "#ca8a04",
    darkBg: "#ca8a04",
    darkText: "#fef9c3",
    darkSolid: "#facc15",
  },
  HIGH: {
    bg: "#ea580c",
    text: "#fff7ed",
    solid: "#c2410c",
    darkBg: "#c2410c",
    darkText: "#ffedd5",
    darkSolid: "#fb923c",
  },
  CRITICAL: {
    bg: "#dc2626",
    text: "#fef2f2",
    solid: "#b91c1c",
    darkBg: "#b91c1c",
    darkText: "#fecaca",
    darkSolid: "#f87171",
  },
};

const BAND_ORDER: RiskLevel[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

/** Score ranges for Simple Risk Score (likelihood × impact, 1–25). */
const BAND_SCORE_RANGE: Record<RiskLevel, string> = {
  LOW: "1–5",
  MEDIUM: "6–11",
  HIGH: "12–19",
  CRITICAL: "20–25",
};

const BAND_GUIDE: Record<RiskLevel, string> = {
  LOW: "Monitor in normal process",
  MEDIUM: "Plan mitigation before CAB",
  HIGH: "Active owner + mitigation needed",
  CRITICAL: "Escalate — may block deploy",
};

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

function clampScore(n: number) {
  return Math.min(5, Math.max(1, n));
}

/** rows: likelihood 5→1, cols: impact 1→5 */
function buildGrid(risks: RiskRow[]): number[][] {
  const grid = Array.from({ length: 5 }, () => Array.from({ length: 5 }, (): number => 0));
  for (const r of risks) {
    const li = clampScore(r.likelihood);
    const im = clampScore(r.impact);
    grid[5 - li][im - 1]++;
  }
  return grid;
}

function bandCounts(risks: RiskRow[]): Record<RiskLevel, number> {
  const counts: Record<RiskLevel, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
  for (const r of risks) {
    counts[getRiskLevel(r.riskScore)]++;
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
function findBiggestCluster(grid: number[][]): {
  likelihood: number;
  impact: number;
  count: number;
  band: RiskLevel;
} | null {
  let best: { likelihood: number; impact: number; count: number; band: RiskLevel } | null = null;
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const count = grid[row][col];
      if (count === 0) continue;
      if (!best || count > best.count) {
        const likelihood = 5 - row;
        const impact = col + 1;
        best = {
          likelihood,
          impact,
          count,
          band: getRiskLevel(likelihood * impact),
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
}: {
  likelihood: number;
  impact: number;
  count: number;
  active: boolean;
  onSelect: (likelihood: number, impact: number) => void;
  dark: boolean;
}) {
  const [tipOpen, setTipOpen] = useState(false);
  const hoverCapable = useHoverCapable();
  const score = likelihood * impact;
  const band = getRiskLevel(score);
  const empty = count === 0;
  const c = BAND_COLOR[band];

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
          : `Likelihood ${likelihood}, Impact ${impact}: ${count} risk${count === 1 ? "" : "s"}, ${band}`
      }
      className={cn(
        "group relative flex h-full w-full min-h-0 min-w-0 items-center justify-center rounded-2xl text-[clamp(13px,2.4vw,17px)] font-bold transition-all duration-150",
        "hover:z-10 hover:scale-[1.03] hover:shadow-md disabled:cursor-default disabled:hover:scale-100 disabled:hover:shadow-none",
        active && !empty && "ring-2 ring-brand-500 ring-offset-2 dark:ring-brand-400 dark:ring-offset-[var(--card)]"
      )}
      style={
        empty
          ? dark
            ? {
                background: EMPTY_CELL.darkBg,
                border: `1px solid ${EMPTY_CELL.darkBorder}`,
                color: EMPTY_CELL.darkText,
              }
            : {
                background: EMPTY_CELL.bg,
                border: `1px solid ${EMPTY_CELL.border}`,
                color: EMPTY_CELL.text,
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
            {band}
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
}: {
  grid: number[][];
  selLi: number;
  selIm: number;
  onSelect: (likelihood: number, impact: number) => void;
  dark: boolean;
}) {
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
        <div className="grid grid-rows-5 gap-1.5">
          {[5, 4, 3, 2, 1].map((n) => (
            <span
              key={n}
              className="flex items-center justify-center text-[11px] font-bold tabular-nums text-slate-400 dark:text-slate-500"
            >
              {n}
            </span>
          ))}
        </div>
        <div className="grid min-h-0 min-w-0 grid-cols-5 grid-rows-5 gap-1.5">
          {grid.flatMap((row, rowIdx) => {
            const likelihood = 5 - rowIdx;
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
                />
              );
            });
          })}
        </div>
        <div />
        <div className="min-w-0">
          <div className="grid grid-cols-5 gap-1.5">
            {[1, 2, 3, 4, 5].map((n) => (
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
}: {
  grid: number[][];
  maxCount: number;
  onSelect: (likelihood: number, impact: number) => void;
  dark: boolean;
}) {
  const size = 420;
  const pad = 48;
  const step = (size - pad * 1.5) / 5;
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
          stroke={dark ? "#334155" : "transparent"}
        />
        {[1, 2, 3, 4, 5].map((n) => (
          <g key={n}>
            <line
              x1={pad}
              y1={size - pad - (n - 0.5) * step}
              x2={size}
              y2={size - pad - (n - 0.5) * step}
              className="stroke-slate-100 dark:stroke-slate-700"
            />
            <line
              x1={pad + (n - 0.5) * step}
              y1={0}
              x2={pad + (n - 0.5) * step}
              y2={size - pad}
              className="stroke-slate-100 dark:stroke-slate-700"
            />
          </g>
        ))}
        <line x1={pad} y1={0} x2={pad} y2={size - pad} className="stroke-slate-300 dark:stroke-slate-500" strokeWidth={1.5} />
        <line x1={pad} y1={size - pad} x2={size} y2={size - pad} className="stroke-slate-300 dark:stroke-slate-500" strokeWidth={1.5} />
        {[1, 2, 3, 4, 5].map((n) => (
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
        {[1, 2, 3, 4, 5].map((n) => (
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
            const likelihood = 5 - rowIdx;
            const impact = colIdx + 1;
            const p = pos(likelihood, impact);
            const score = likelihood * impact;
            const band = getRiskLevel(score);
            const solid = dark ? BAND_COLOR[band].darkSolid : BAND_COLOR[band].solid;
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
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={r}
                  fill={solid}
                  fillOpacity={dark ? 0.68 : 0.82}
                  stroke={solid}
                  strokeOpacity={dark ? 0.82 : 1}
                  strokeWidth={2}
                />
                <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize="12" fontWeight="800" fill="#fff">
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
            style={{ color: dark ? BAND_COLOR[tip.band].darkSolid : BAND_COLOR[tip.band].solid }}
          >
            {tip.band}
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
}: {
  grid: number[][];
  maxCount: number;
  onSelect: (likelihood: number, impact: number) => void;
  dark: boolean;
}) {
  const size = 420;
  const pad = 48;
  const step = (size - pad * 1.5) / 5;
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
        const likelihood = 5 - rowIdx;
        const impact = colIdx + 1;
        out.push({
          likelihood,
          impact,
          count,
          band: getRiskLevel(likelihood * impact),
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
                stopColor={dark ? BAND_COLOR[c.band].darkSolid : BAND_COLOR[c.band].solid}
                stopOpacity={dark ? 0.62 : 0.85}
              />
              <stop
                offset="100%"
                stopColor={dark ? BAND_COLOR[c.band].darkSolid : BAND_COLOR[c.band].solid}
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
        />
        <g style={{ mixBlendMode: dark ? "normal" : "multiply" }}>
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
        <g stroke={dark ? "#334155" : "#ffffff"} strokeWidth={dark ? 1 : 2} opacity={0.9}>
          {[0, 1, 2, 3, 4, 5].map((n) => (
            <line key={`gx${n}`} x1={pad + n * step} y1={0} x2={pad + n * step} y2={size - pad} />
          ))}
          {[0, 1, 2, 3, 4, 5].map((n) => (
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
        {[1, 2, 3, 4, 5].map((n) => (
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
        {[1, 2, 3, 4, 5].map((n) => (
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
}: {
  band: RiskLevel;
  count: number;
  total: number;
  dark: boolean;
}) {
  const c = BAND_COLOR[band];
  const bandColor = dark ? c.darkSolid : c.solid;
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
      <span className="h-3 w-3 shrink-0 rounded-md" style={{ background: bandColor }} />
      <span
        className="text-[12px] font-semibold text-slate-700 dark:text-slate-200"
        style={dark ? { color: c.darkText } : undefined}
      >
        {band}
      </span>
      <span className="text-[11px] tabular-nums text-slate-400 dark:text-slate-500">
        {BAND_SCORE_RANGE[band]}
      </span>
      <div className="h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: bandColor }} />
      </div>
      <span className="min-w-0 flex-1 basis-full text-[11px] text-slate-500 sm:basis-auto dark:text-slate-400">
        {BAND_GUIDE[band]}
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
  const [view, setView] = useState<HeatMapView>("matrix");
  const dark = useIsDarkMode();
  const grid = useMemo(() => buildGrid(risks), [risks]);
  const counts = useMemo(() => bandCounts(risks), [risks]);
  const total = useMemo(() => BAND_ORDER.reduce((sum, b) => sum + counts[b], 0), [counts]);
  const maxCount = useMemo(() => maxCellCount(grid), [grid]);
  const cluster = useMemo(() => findBiggestCluster(grid), [grid]);
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
              <MatrixView grid={grid} selLi={selLi} selIm={selIm} onSelect={onCellSelect} dark={dark} />
            )}
            {view === "bubble" && (
              <BubbleView grid={grid} maxCount={maxCount} onSelect={onCellSelect} dark={dark} />
            )}
            {view === "density" && (
              <DensityView grid={grid} maxCount={maxCount} onSelect={onCellSelect} dark={dark} />
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
              {BAND_ORDER.map((band) => (
                <LegendRow key={band} band={band} count={counts[band]} total={total} dark={dark} />
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
                  {cluster.count} at L{cluster.likelihood}×I{cluster.impact} · {cluster.band}
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

  useEffect(() => {
    return loadJsonEffect<RiskRow[]>("/api/risks", setAllRisks, { label: "risks" });
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
        trailing={<PageDocumentation pageKey="risks" />}
        title="Risk"
        subtitle={`${risks.length} risk${risks.length === 1 ? "" : "s"} across all releases`}
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
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={String(n)}>
                  {n}
                </option>
              ))}
            </FilterSelect>
          )}
          {isFilterVisible("impact") && (
            <FilterSelect value={values.impact} onChange={(v) => setFilter("impact", v)}>
              <option value="">All impact</option>
              {[1, 2, 3, 4, 5].map((n) => (
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
                              RISK_LEVEL_COLOR[getRiskLevel(r.riskScore)]
                            )}
                          >
                            {r.riskScore} · {getRiskLevel(r.riskScore)}
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
