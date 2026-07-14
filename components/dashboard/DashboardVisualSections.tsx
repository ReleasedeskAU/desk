"use client";

import {
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChevronRight, Snowflake, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { SectionInfo } from "@/components/dashboard/SectionInfo";

export type ChartDatum = { name: string; value: number; color: string; href?: string };

export type ChartTheme = {
  tick: string;
  cursor: string;
  tooltip: React.CSSProperties;
};

export function SectionCard({
  title,
  subtitle,
  info,
  href,
  accent,
  badge,
  onNavigate,
  children,
  className,
  /** Center the title block (e.g. Release Pipeline sitting between two charts). */
  titleAlign = "left",
}: {
  title: string;
  subtitle?: string;
  info?: string;
  href?: string;
  accent?: string;
  badge?: React.ReactNode;
  onNavigate: (href: string) => void;
  children: React.ReactNode;
  className?: string;
  titleAlign?: "left" | "center";
}) {
  const centered = titleAlign === "center";

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[24px] bg-white p-6 shadow-[0_18px_40px_-24px_rgba(112,144,176,0.18)]",
        "dark:bg-[var(--card)] dark:shadow-[0_18px_40px_-24px_rgba(0,0,0,0.45)]",
        className
      )}
    >
      {accent && <div className={cn("absolute inset-x-0 top-0 h-[3px]", accent)} />}
      <div
        className={cn(
          "mb-3 flex items-start gap-2",
          centered ? "relative justify-center text-center" : "justify-between"
        )}
      >
        <div className={cn("min-w-0", centered && "flex flex-col items-center")}>
          <div className="flex items-center gap-1.5">
            <h3 className="text-[15px] font-bold text-slate-800 dark:text-white">{title}</h3>
            {info && <SectionInfo text={info} />}
          </div>
          {subtitle && (
            <p className="mt-0.5 text-[12px] text-slate-400 dark:text-white/50">{subtitle}</p>
          )}
        </div>
        <div
          className={cn(
            "flex shrink-0 items-center gap-2",
            centered && "absolute right-0 top-0"
          )}
        >
          {badge}
          {href && (
            <button
              type="button"
              onClick={() => onNavigate(href)}
              className="flex items-center gap-0.5 text-[12px] font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
            >
              View <ChevronRight size={14} />
            </button>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

export function ChartLegend({
  items,
  onNavigate,
}: {
  items: ChartDatum[];
  onNavigate: (href: string) => void;
}) {
  return (
    <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1.5">
      {items.map((e) => (
        <button
          key={e.name}
          type="button"
          disabled={!e.href}
          onClick={() => e.href && onNavigate(e.href)}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-1.5 py-1",
            e.href && "hover:bg-slate-50 dark:hover:bg-white/5"
          )}
        >
          <span className="h-2 w-2 rounded-full" style={{ background: e.color }} />
          <span className="text-[12px] text-slate-500 dark:text-white/55">{e.name}</span>
          <span className="text-[12px] font-bold tabular-nums text-slate-800 dark:text-white">{e.value}</span>
        </button>
      ))}
    </div>
  );
}

export function DonutVisual({
  data,
  height = 160,
  innerRadius = 48,
  outerRadius = 72,
  centerLabel,
  centerSub,
  chartTheme,
  onNavigate,
}: {
  data: ChartDatum[];
  height?: number;
  innerRadius?: number;
  outerRadius?: number;
  centerLabel?: string | number;
  centerSub?: string;
  chartTheme: ChartTheme;
  onNavigate: (href: string) => void;
}) {
  const filtered = data.filter((d) => d.value > 0);
  const pieData = filtered.length > 0 ? filtered : [{ name: "Empty", value: 1, color: "#e2e8f0" }];

  return (
    <div className="relative min-w-0" style={{ height }}>
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={pieData}
            dataKey="value"
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            paddingAngle={filtered.length > 1 ? 3 : 0}
            stroke="none"
            cornerRadius={5}
            onClick={(_, i) => {
              const item = filtered[i];
              if (item?.href) onNavigate(item.href);
            }}
            className="cursor-pointer"
          >
            {pieData.map((e, i) => (
              <Cell key={i} fill={e.color} />
            ))}
          </Pie>
          <Tooltip contentStyle={chartTheme.tooltip} />
        </PieChart>
      </ResponsiveContainer>
      {centerLabel !== undefined && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[26px] font-bold text-[#1B2559] dark:text-white">{centerLabel}</span>
          {centerSub && <span className="text-[11px] font-medium text-slate-400 dark:text-white/50">{centerSub}</span>}
        </div>
      )}
    </div>
  );
}

export function VerticalBarVisual({
  data,
  height = 180,
  chartTheme,
  onNavigate,
}: {
  data: ChartDatum[];
  height?: number;
  chartTheme: ChartTheme;
  onNavigate: (href: string) => void;
}) {
  return (
    <div className="min-w-0" style={{ height }}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} barCategoryGap={14} margin={{ left: -18, right: 6, top: 8 }}>
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: chartTheme.tick }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: chartTheme.tick }} axisLine={false} tickLine={false} width={28} allowDecimals={false} />
          <Tooltip cursor={{ fill: chartTheme.cursor }} contentStyle={chartTheme.tooltip} />
          <Bar
            dataKey="value"
            radius={[8, 8, 8, 8]}
            barSize={26}
            onClick={(_, index) => {
              const item = data[index];
              if (item?.href) onNavigate(item.href);
            }}
            className="cursor-pointer"
          >
            {data.map((e, i) => (
              <Cell key={i} fill={e.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function HorizontalCompareVisual({
  items,
  onNavigate,
}: {
  items: { label: string; value: number; max: number; color: string; href: string }[];
  onNavigate: (href: string) => void;
}) {
  return (
    <div className="space-y-4">
      {items.map((item) => {
        const pct = item.max > 0 ? Math.round((item.value / item.max) * 100) : 0;
        return (
          <button
            key={item.label}
            type="button"
            onClick={() => onNavigate(item.href)}
            className="group w-full text-left"
          >
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[13px] font-medium text-slate-600 dark:text-white/70">{item.label}</span>
              <span className="text-[15px] font-bold tabular-nums text-slate-800 dark:text-white">
                {item.value}
                <span className="ml-1 text-[12px] font-medium text-slate-400 dark:text-white/45">/ {item.max}</span>
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
              <div
                className="h-full rounded-full transition-all group-hover:opacity-90"
                style={{ width: `${Math.max(pct, item.value > 0 ? 8 : 0)}%`, background: item.color }}
              />
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function HealthStatusVisual({
  items,
  onNavigate,
}: {
  items: { label: string; status: string; value: number; metricLabel: string; href: string }[];
  onNavigate?: (href: string) => void;
}) {
  const tone = (status: string) => {
    if (status === "Critical") return { ring: "#f43f5e", bg: "bg-rose-50 dark:bg-rose-950/35", text: "text-rose-600 dark:text-rose-400" };
    if (status === "Warning") return { ring: "#f59e0b", bg: "bg-amber-50 dark:bg-amber-950/35", text: "text-amber-600 dark:text-amber-400" };
    return { ring: "#10b981", bg: "bg-emerald-50 dark:bg-emerald-950/35", text: "text-emerald-600 dark:text-emerald-400" };
  };

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {items.map((h) => {
        const t = tone(h.status);
        const fill = h.status === "Healthy" ? 100 : h.status === "Warning" ? 55 : 22;
        const inner = (
          <div className="flex items-center gap-4">
            <div className="relative h-16 w-16 shrink-0">
              <svg viewBox="0 0 44 44" className="h-16 w-16 -rotate-90">
                <circle cx="22" cy="22" r="18" fill="none" stroke="currentColor" className="text-white/60 dark:text-white/10" strokeWidth="4" />
                <circle
                  cx="22"
                  cy="22"
                  r="18"
                  fill="none"
                  stroke={t.ring}
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={`${(fill / 100) * 113} 113`}
                />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] font-medium text-slate-600 dark:text-white/65">{h.label}</div>
              <div className={cn("mt-0.5 text-[12px] font-semibold", t.text)}>{h.status}</div>
            </div>
            <div className="ml-auto shrink-0 text-right">
              <div className="text-[34px] font-bold leading-none tabular-nums text-slate-800 dark:text-white">{h.value}</div>
              <div className="mt-1 text-[10px] leading-tight text-slate-500 dark:text-white/45">{h.metricLabel}</div>
            </div>
          </div>
        );

        if (onNavigate) {
          return (
            <button
              key={h.label}
              type="button"
              onClick={() => onNavigate(h.href)}
              className={cn("w-full rounded-2xl px-4 py-3.5 text-left transition-opacity hover:opacity-90", t.bg)}
            >
              {inner}
            </button>
          );
        }

        return (
          <div key={h.label} className={cn("rounded-2xl px-4 py-3.5", t.bg)}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}

export function ChangeFreezeVisual({
  types,
  totalFrozen,
  onNavigate,
}: {
  types: ChartDatum[];
  totalFrozen: number;
  onNavigate: (href: string) => void;
}) {
  const allZero = totalFrozen === 0 && types.every((t) => t.value === 0);
  if (allZero) {
    return (
      <div className="flex h-[170px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-4 text-center dark:border-white/10 dark:bg-white/[0.03]">
        <span className="mb-2 flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
          <Snowflake size={20} />
        </span>
        <p className="text-[14px] font-semibold text-slate-700 dark:text-white">No active freeze windows</p>
        <p className="mt-1 max-w-[220px] text-[12px] text-slate-500 dark:text-white/55">
          Quarter-end, year-end, audit, and holiday freezes are clear for this period.
        </p>
      </div>
    );
  }

  return (
    <>
      <DonutVisual
        data={types}
        height={150}
        innerRadius={40}
        outerRadius={62}
        centerLabel={totalFrozen}
        centerSub="frozen"
        chartTheme={{
          tick: "#94a3b8",
          cursor: "transparent",
          tooltip: { fontSize: 12 },
        }}
        onNavigate={onNavigate}
      />
      <ChartLegend items={types} onNavigate={onNavigate} />
    </>
  );
}

export function QuickStatsVisual({
  checklistPct,
  rollbackReady,
  rollbackAtRisk,
  releasesWeek,
  releasesMonth,
  onNavigate,
}: {
  checklistPct: number;
  rollbackReady: number;
  rollbackAtRisk: number;
  releasesWeek: number;
  releasesMonth: number;
  onNavigate: (href: string) => void;
}) {
  const rollbackTotal = rollbackReady + rollbackAtRisk;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <button
        type="button"
        onClick={() => onNavigate("/releases")}
        className="flex flex-col items-center rounded-2xl bg-[#F4F7FE] px-3 py-4 dark:bg-white/5"
      >
        <div className="relative h-[88px] w-[88px]">
          <svg viewBox="0 0 88 88" className="h-[88px] w-[88px] -rotate-90">
            <circle cx="44" cy="44" r="36" fill="none" stroke="currentColor" className="text-slate-200 dark:text-white/10" strokeWidth="8" />
            <circle
              cx="44"
              cy="44"
              r="36"
              fill="none"
              stroke="var(--theme-accent)"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${(checklistPct / 100) * 226} 226`}
            />
          </svg>
          <span className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[20px] font-bold text-slate-800 dark:text-white">{checklistPct}%</span>
          </span>
        </div>
        <span className="mt-2 text-[12px] font-semibold text-slate-600 dark:text-white/70">Avg go-live checklist</span>
      </button>

      <div className="space-y-3">
        <button
          type="button"
          onClick={() => onNavigate("/releases?rollback=Ready")}
          className="w-full rounded-2xl bg-emerald-50 px-3 py-2.5 text-left dark:bg-emerald-950/30"
        >
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[12px] font-medium text-emerald-700 dark:text-emerald-400">
              <ShieldCheck size={14} /> Rollback ready
            </span>
            <span className="text-[18px] font-bold text-emerald-700 dark:text-emerald-300">{rollbackReady}</span>
          </div>
        </button>
        <button
          type="button"
          onClick={() => onNavigate("/releases?rollback=At+Risk")}
          className="w-full rounded-2xl bg-rose-50 px-3 py-2.5 text-left dark:bg-rose-950/30"
        >
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium text-rose-700 dark:text-rose-400">Rollback at risk</span>
            <span className="text-[18px] font-bold text-rose-700 dark:text-rose-300">{rollbackAtRisk}</span>
          </div>
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onNavigate("/releases?period=week")}
            className="flex-1 rounded-xl bg-white px-2 py-2 text-center shadow-sm dark:bg-white/10 dark:shadow-none"
          >
            <div className="text-[16px] font-bold text-slate-800 dark:text-white">{releasesWeek}</div>
            <div className="text-[10px] text-slate-500 dark:text-white/50">This week</div>
          </button>
          <button
            type="button"
            onClick={() => onNavigate("/releases?period=month")}
            className="flex-1 rounded-xl bg-white px-2 py-2 text-center shadow-sm dark:bg-white/10 dark:shadow-none"
          >
            <div className="text-[16px] font-bold text-slate-800 dark:text-white">{releasesMonth}</div>
            <div className="text-[10px] text-slate-500 dark:text-white/50">This month</div>
          </button>
        </div>
        {rollbackTotal > 0 && (
          <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
            <div
              className="h-full rounded-full bg-emerald-500"
              style={{ width: `${Math.round((rollbackReady / rollbackTotal) * 100)}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export function DualDonutRow({
  left,
  right,
  chartTheme,
  onNavigate,
}: {
  left: {
    title: string;
    data: ChartDatum[];
    center?: string | number;
    sub?: string;
    /** Optional tooltip shown via the ? info control next to the heading. */
    info?: string;
  };
  right: {
    title: string;
    data: ChartDatum[];
    center?: string | number;
    sub?: string;
    info?: string;
  };
  chartTheme: ChartTheme;
  onNavigate: (href: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-0">
      {[left, right].map((side, i) => (
        <div
          key={side.title}
          className={
            i === 1
              ? // Darker vertical divider between Status mix and Priority mix
                "sm:border-l-2 sm:border-slate-300 sm:pl-5 dark:sm:border-white/25"
              : "sm:pr-5"
          }
        >
          <div className="mb-1.5 flex items-center gap-1.5">
            <h4 className="text-[12px] font-bold uppercase tracking-wide text-slate-600 dark:text-white/70">
              {side.title}
            </h4>
            {side.info && <SectionInfo text={side.info} />}
          </div>
          <DonutVisual
            data={side.data}
            height={140}
            innerRadius={38}
            outerRadius={58}
            centerLabel={side.center}
            centerSub={side.sub}
            chartTheme={chartTheme}
            onNavigate={onNavigate}
          />
          <ChartLegend items={side.data} onNavigate={onNavigate} />
        </div>
      ))}
    </div>
  );
}
