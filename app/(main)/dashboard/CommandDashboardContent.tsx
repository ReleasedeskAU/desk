"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import {
  ArrowUpRight,
  Sparkles,
  TrendingUp,
  TrendingDown,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton";
import { SectionInfo } from "@/components/dashboard/SectionInfo";
import {
  SectionCard,
  DonutVisual,
  VerticalBarVisual,
  HorizontalCompareVisual,
  HealthStatusVisual,
  ChangeFreezeVisual,
  QuickStatsVisual,
  DualDonutRow,
  ChartLegend,
  type ChartDatum,
} from "@/components/dashboard/DashboardVisualSections";
import { useThemeMode } from "@/context/ThemeModeContext";
import { DASHBOARD_PERIOD_OPTIONS, dashboardSectionTitle, type DashboardPeriod } from "@/lib/dashboard-period";
import type { DashboardPayload } from "@/lib/dashboard-payload";

const INCIDENT_TREND_LABEL: Record<DashboardPeriod, string> = {
  today: "Today by 6-hour blocks",
  week: "Last 7 days",
  month: "Weekly buckets this month",
  all: "Last 12 weeks",
};

const RELEASE_TREND_LABEL: Record<DashboardPeriod, string> = {
  today: "Releases scheduled today",
  week: "Daily release count this week",
  month: "Weekly release count this month",
  all: "Next 4 weeks",
};

function useChartTheme() {
  const { mode } = useThemeMode();
  const isDark = mode === "dark";
  return useMemo(
    () => ({
      tick: isDark ? "#94a3b8" : "#A3AED0",
      cursor: isDark ? "rgba(42, 49, 66, 0.65)" : "#F4F7FE",
      tooltip: {
        borderRadius: 12,
        border: "none",
        boxShadow: isDark
          ? "0 10px 30px -10px rgba(0,0,0,0.55)"
          : "0 10px 30px -10px rgba(112,144,176,.35)",
        fontSize: 12,
        background: isDark ? "#2a3142" : "#ffffff",
        color: isDark ? "#ffffff" : "#1B2559",
      } as React.CSSProperties,
    }),
    [isDark]
  );
}

type CommandDashboardContentProps = {
  /** Server-prefetched period (avoids client/auth race on first paint). */
  initialPeriod?: DashboardPeriod;
  /** Server-prefetched payload; when set, first paint skips the client fetch. */
  initialData?: DashboardPayload | null;
  /** Server-side load error message, if any. */
  initialError?: string | null;
};

/**
 * Command Dashboard client view.
 * Prefers `initialData` from the server; refetches on period change / Retry.
 */
export default function CommandDashboardContent({
  initialPeriod = "all",
  initialData = null,
  initialError = null,
}: CommandDashboardContentProps) {
  const router = useRouter();
  const chartTheme = useChartTheme();
  const [period, setPeriod] = useState<DashboardPeriod>(initialPeriod);
  const [data, setData] = useState<DashboardPayload | null>(initialData);
  const [loading, setLoading] = useState(!initialData && !initialError);
  const [error, setError] = useState<string | null>(initialError);
  const [refreshKey, setRefreshKey] = useState(0);

  const onNavigate = (href: string) => router.push(href);

  useEffect(() => {
    // Server already hydrated this period — skip client fetch until Retry / period change.
    if (
      refreshKey === 0 &&
      period === initialPeriod &&
      (initialData || initialError)
    ) {
      setData(initialData);
      setError(initialError);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    async function load(attempt: number): Promise<void> {
      try {
        // No AbortController — React Strict Mode aborts can leave a false error state.
        const r = await fetch(`/api/dashboard?period=${period}`, {
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!r.ok) {
          // Cookie session can lag one tick after navigation; retry once, then fail closed.
          if (r.status === 401 && attempt < 1) {
            await new Promise((resolve) => window.setTimeout(resolve, 600));
            if (!cancelled) return load(attempt + 1);
            return;
          }
          if (r.status === 401) {
            throw new Error("Sign in required");
          }
          const body = (await r.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `Failed to load dashboard (${r.status})`);
        }
        const d = (await r.json()) as DashboardPayload;
        if (!cancelled) {
          setData(d);
          setError(null);
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load dashboard");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load(0);
    return () => {
      cancelled = true;
    };
  }, [refreshKey, period, initialPeriod, initialData, initialError]);

  const incidentTrendChart = useMemo(
    () => (data?.incidentTrend ?? []).map((d) => ({ d: d.date, v: d.count })),
    [data?.incidentTrend]
  );

  const incidentTrendChange = useMemo(() => {
    const t = data?.incidentTrend ?? [];
    if (t.length < 2) return null;
    const first = t[0].count;
    const last = t[t.length - 1].count;
    if (first === 0) return last > 0 ? { dir: "up" as const, pct: 100 } : null;
    const pct = Math.round(((last - first) / first) * 100);
    return { dir: pct >= 0 ? ("up" as const) : ("down" as const), pct: Math.abs(pct) };
  }, [data?.incidentTrend]);

  const releaseTrendChart = useMemo(
    () => (data?.releaseTrend ?? []).map((d) => ({ w: d.week, v: d.count })),
    [data?.releaseTrend]
  );

  const releaseTrendDirection = useMemo(() => {
    const t = data?.releaseTrend ?? [];
    if (t.length < 2) return null;
    return t[t.length - 1].count >= t[0].count ? "up" : "down";
  }, [data?.releaseTrend]);

  const incidentSeverityData = useMemo<ChartDatum[]>(
    () =>
      data
        ? [
            { name: "P1", value: data.incidentsDetail.p1, color: "#f43f5e", href: "/incidents?severity=P1" },
            { name: "P2", value: data.incidentsDetail.p2, color: "#f59e0b", href: "/incidents?severity=P2" },
            { name: "P3", value: data.incidentsDetail.p3, color: "#6366f1", href: "/incidents?severity=P3" },
          ]
        : [],
    [data]
  );

  const alertSeverityData = useMemo<ChartDatum[]>(
    () =>
      data
        ? [
            { name: "Critical", value: data.alertsDetail.critical, color: "#f43f5e", href: "/monitoring-alerts?severity=Critical&status=Active" },
            { name: "Warning", value: data.alertsDetail.warning, color: "#f59e0b", href: "/monitoring-alerts?severity=Warning&status=Active" },
            { name: "Info", value: data.alertsDetail.info, color: "#6366f1", href: "/monitoring-alerts?severity=Info&status=Active" },
          ]
        : [],
    [data]
  );

  const conflictsRiskChart = useMemo<ChartDatum[]>(
    () =>
      data
        ? [
            { name: "Conflicts", value: data.conflictsRisks.activeConflicts, color: "#e11d48", href: "/conflicts" },
            ...data.conflictsRisks.riskDistribution,
          ]
        : [],
    [data]
  );

  if (loading && !data) {
    return <DashboardSkeleton />;
  }

  if (error || !data) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 bg-[#F4F7FE] dark:bg-[var(--background)]">
        <p className="text-sm text-gray-500 dark:text-white/60">{error ?? "No dashboard data"}</p>
        <button
          onClick={() => setRefreshKey((k) => k + 1)}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div
      className="-mx-4 -mt-6 min-h-screen bg-[#F4F7FE] px-4 pb-9 pt-6 dark:bg-[var(--background)] md:-mx-6 md:px-6 md:pt-9 lg:-mx-8 lg:px-8"
      style={{ fontFamily: "'Plus Jakarta Sans','DM Sans',ui-sans-serif,system-ui,sans-serif" }}
    >
      <div className="w-full">
        <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-[24px] font-bold tracking-tight text-[#1B2559] dark:text-white sm:text-[30px]">Command Dashboard</h1>
          </div>
          <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
            <div className="flex min-w-0 flex-1 items-center gap-1 rounded-2xl bg-white p-1 shadow-[0_18px_40px_-24px_rgba(112,144,176,0.25)] dark:bg-[var(--card)] dark:shadow-[0_18px_40px_-24px_rgba(0,0,0,0.4)] sm:flex-none sm:p-1.5">
              {DASHBOARD_PERIOD_OPTIONS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setPeriod(f.value)}
                  className={cn(
                    "min-w-0 flex-1 rounded-xl px-2.5 py-2 text-[12px] font-semibold transition-all sm:px-6 sm:py-2.5 sm:text-[13px]",
                    period === f.value
                      ? "text-white shadow-md"
                      : "text-slate-500 hover:bg-slate-50 dark:text-white/55 dark:hover:bg-white/5"
                  )}
                  style={period === f.value ? { backgroundImage: "var(--theme-gradient)" } : undefined}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setRefreshKey((k) => k + 1)}
              className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-[0_18px_40px_-24px_rgba(112,144,176,0.25)] hover:text-slate-700 dark:bg-[var(--card)] dark:text-white/55 dark:hover:text-white/80 dark:shadow-[0_18px_40px_-24px_rgba(0,0,0,0.4)]"
              aria-label="Refresh dashboard"
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </button>
          </div>
        </div>

        {/* Hero */}
        <div
          className="relative mb-7 overflow-hidden rounded-[22px] px-5 py-4 text-white"
          style={{ backgroundImage: "var(--theme-gradient)", boxShadow: "var(--theme-shadow)" }}
        >
          <div className="pointer-events-none absolute -right-16 -top-24 h-48 w-48 rounded-full bg-white/10 blur-3xl" />
          <div className="relative">
            <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/60">
              <Sparkles size={12} /> Portfolio snapshot
              <SectionInfo
                text="Live counts for releases in the selected period, currently active incidents, open monitoring alerts, and production apps marked Down."
                className="text-white/50 hover:bg-white/10 hover:text-white/80"
              />
            </div>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-6">
              <div className="flex flex-wrap items-center gap-6 sm:gap-8">
                {[
                  { n: data.summary.totalReleases, l: "Total releases", href: `/releases?period=${period}` },
                  { n: data.summary.activeIncidents, l: "Active incidents", href: "/incidents" },
                  { n: data.summary.activeAlerts, l: "Active alerts", href: "/monitoring-alerts?status=Active" },
                  { n: data.summary.appsDownProd, l: "Apps down in Prod", href: "/application-status?status=Down&env=Prod" },
                ].map((x) => (
                  <button key={x.l} type="button" onClick={() => onNavigate(x.href)} className="group text-left focus:outline-none">
                    <div className="text-[30px] font-bold leading-none tabular-nums transition-transform duration-300 group-hover:scale-105 sm:text-[32px]">
                      {x.n}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1 text-[12px] font-medium text-white/70 group-hover:text-white">
                      {x.l}
                      <ArrowUpRight size={13} className="opacity-70 transition-opacity group-hover:opacity-100" aria-hidden />
                    </div>
                  </button>
                ))}
              </div>
              <p className="text-[12.5px] leading-snug text-white/80 lg:max-w-[38%] lg:flex-1 lg:border-l lg:border-white/20 lg:pl-6">
                {data.briefing}
              </p>
            </div>
          </div>
        </div>

        {/* Needs your attention */}
        <SectionCard
          title={dashboardSectionTitle("Needs your attention", period)}
          subtitle="Live status by portfolio area"
          info="Derived from blocked releases, environment booking conflicts, active P1 incidents, and critical monitoring alerts for the selected period."
          accent="bg-slate-300 dark:bg-slate-600"
          className="mb-7"
          onNavigate={onNavigate}
        >
          <HealthStatusVisual items={data.health} onNavigate={onNavigate} />
        </SectionCard>

        {/* Release Pipeline */}
        <SectionCard
          title={dashboardSectionTitle("Release Pipeline", period)}
          subtitle={`${data.pipelineDetail.total} releases in period`}
          info="Status mix and priority distribution for releases whose go-live date falls in the selected period. Click a segment to filter the releases list."
          href="/releases"
          accent="bg-brand-400"
          className="mb-7"
          titleAlign="center"
          onNavigate={onNavigate}
        >
          <DualDonutRow
            left={{
              title: "Status mix",
              data: data.pipelineDetail.byStatus,
              center: data.pipelineDetail.total,
              sub: "total",
              info: "Share of releases in each lifecycle status for the selected period. Click a segment or legend item to open the filtered releases list.",
            }}
            right={{
              title: "Priority mix",
              data: data.pipelineDetail.byPriority,
              center: data.pipelineDetail.byPriority.reduce((s, p) => s + p.value, 0),
              sub: "prioritized",
              info: "Share of releases by priority (P1–P4) for the selected period. Click a segment or legend item to open the filtered releases list.",
            }}
            chartTheme={chartTheme}
            onNavigate={onNavigate}
          />
        </SectionCard>

        {/* Ops row 1 */}
        <div className="mb-7 grid grid-cols-1 gap-5 lg:grid-cols-2">
          <SectionCard
            title={dashboardSectionTitle("Environment Bookings", period)}
            subtitle={`${data.envBookings.activeBookings} active bookings`}
            info="Environment booking conflicts overlapping the selected period versus total active bookings in that window."
            href="/booking"
            accent="bg-brand-400"
            onNavigate={onNavigate}
          >
            <HorizontalCompareVisual
              items={[
                {
                  label: "Env conflicts",
                  value: data.envBookings.conflicts,
                  max: Math.max(data.envBookings.activeBookings, data.envBookings.conflicts, 1),
                  color: "#f43f5e",
                  href: "/conflicts",
                },
                {
                  label: "Active bookings",
                  value: data.envBookings.activeBookings,
                  max: Math.max(data.envBookings.activeBookings, 1),
                  color: "#6366f1",
                  href: "/booking",
                },
              ]}
              onNavigate={onNavigate}
            />
          </SectionCard>

          <SectionCard
            title={dashboardSectionTitle("Dependencies", period)}
            subtitle={`${data.dependencies.total} tracked dependencies`}
            info="Blocked release dependencies in the selected period compared with all dependencies tied to those releases."
            href="/dependencies"
            accent="bg-sky-400"
            onNavigate={onNavigate}
          >
            <HorizontalCompareVisual
              items={[
                {
                  label: "Blocked",
                  value: data.dependencies.blocked,
                  max: Math.max(data.dependencies.total, 1),
                  color: "#f43f5e",
                  href: "/dependencies?status=Blocked",
                },
                {
                  label: "Total dependencies",
                  value: data.dependencies.total,
                  max: Math.max(data.dependencies.total, 1),
                  color: "#0ea5e9",
                  href: "/dependencies",
                },
              ]}
              onNavigate={onNavigate}
            />
          </SectionCard>
        </div>

        {/* Ops row 2 */}
        <div className="mb-7 grid grid-cols-1 gap-5 lg:grid-cols-2">
          <SectionCard
            title={dashboardSectionTitle("CAB & Approvals", period)}
            subtitle="Governance queue"
            info="CAB meetings scheduled in the next 7 days and approval records still pending decision in the selected period."
            href="/approvals"
            accent="bg-brand-400"
            onNavigate={onNavigate}
          >
            <HorizontalCompareVisual
              items={[
                {
                  label: "CAB meetings (next 7 days)",
                  value: data.cabApprovals.cabMeetingsNext7,
                  max: Math.max(data.cabApprovals.cabMeetingsNext7, 6, 1),
                  color: "#8b5cf6",
                  href: "/calendar",
                },
                {
                  label: "Pending approvals",
                  value: data.cabApprovals.pendingApprovals,
                  max: Math.max(data.cabApprovals.pendingApprovals, 3, 1),
                  color: "#6366f1",
                  href: "/approvals",
                },
              ]}
              onNavigate={onNavigate}
            />
          </SectionCard>

          <SectionCard
            title={dashboardSectionTitle("Resource Availability", period)}
            subtitle="Leave coverage"
            info="Staff on leave today and staff with leave overlapping the next 7 days — useful for CAB and go-live coverage checks."
            href="/leaves"
            accent="bg-emerald-400"
            onNavigate={onNavigate}
          >
            <HorizontalCompareVisual
              items={[
                {
                  label: "On leave today",
                  value: data.resourceAvailability.leaveToday,
                  max: Math.max(data.resourceAvailability.leaveToday, data.resourceAvailability.leaveNext7Days, 4, 1),
                  color: "#10b981",
                  href: "/leaves",
                },
                {
                  label: "On leave (next 7 days)",
                  value: data.resourceAvailability.leaveNext7Days,
                  max: Math.max(data.resourceAvailability.leaveNext7Days, 4, 1),
                  color: "#0ea5e9",
                  href: "/leaves",
                },
              ]}
              onNavigate={onNavigate}
            />
          </SectionCard>
        </div>

        {/* Charts row */}
        <div className="mb-7 grid grid-cols-1 gap-5 lg:grid-cols-3">
          <SectionCard
            title={dashboardSectionTitle("Application Availability", period)}
            subtitle={`${data.availability.total} app-environment records`}
            info="Current health state across all application-environment pairs. Production breakdown shown below the chart."
            href="/application-status"
            accent="bg-emerald-400"
            onNavigate={onNavigate}
          >
            <DonutVisual
              data={data.availability.counts}
              height={185}
              innerRadius={58}
              outerRadius={82}
              centerLabel={`${data.availability.percentHealthy}%`}
              centerSub="healthy"
              chartTheme={chartTheme}
              onNavigate={onNavigate}
            />
            <ChartLegend items={data.availability.counts.map((e) => ({ ...e, href: `/application-status?status=${e.name}` }))} onNavigate={onNavigate} />
            <div className="mt-2 text-center text-[11px] font-medium text-slate-400 dark:text-white/45">
              Prod: {data.availability.prod.healthy}/{data.availability.prod.total} healthy
            </div>
          </SectionCard>

          <SectionCard
            title={dashboardSectionTitle("Incidents", period)}
            subtitle={`${data.incidentsDetail.total} active`}
            info="Active incident severity mix (P1–P3) for the selected period, plus investigation and 24-hour resolution activity."
            href="/incidents"
            accent="bg-rose-400"
            onNavigate={onNavigate}
          >
            <DonutVisual
              data={incidentSeverityData}
              height={150}
              innerRadius={42}
              outerRadius={62}
              centerLabel={data.incidentsDetail.total}
              centerSub="active"
              chartTheme={chartTheme}
              onNavigate={onNavigate}
            />
            <ChartLegend items={incidentSeverityData} onNavigate={onNavigate} />
            <div className="mt-2 flex justify-center gap-4 text-[11px] text-slate-500 dark:text-white/50">
              <button type="button" onClick={() => onNavigate("/incidents?status=Investigating")} className="hover:text-brand-600 dark:hover:text-brand-400">
                Investigating: <strong className="text-slate-800 dark:text-white">{data.incidentsDetail.investigating}</strong>
              </button>
              <button type="button" onClick={() => onNavigate("/incidents?status=Resolved")} className="hover:text-brand-600 dark:hover:text-brand-400">
                Resolved 24h: <strong className="text-slate-800 dark:text-white">{data.incidentsDetail.resolved24h}</strong>
              </button>
            </div>
          </SectionCard>

          <SectionCard
            title={dashboardSectionTitle("Release Conflicts & Risks", period)}
            subtitle={`${data.conflictsRisks.activeConflicts} active conflicts`}
            info="Open release conflicts from the conflicts register plus assessed risk bands (Simple Score) for releases in period."
            href="/risks"
            accent="bg-rose-400"
            onNavigate={onNavigate}
          >
            <VerticalBarVisual
              data={conflictsRiskChart}
              height={150}
              chartTheme={chartTheme}
              onNavigate={onNavigate}
            />
          </SectionCard>
        </div>

        {/* Alerts + Incident trend */}
        <div className="mb-7 grid grid-cols-1 gap-5 lg:grid-cols-2">
          <SectionCard
            title={dashboardSectionTitle("Monitoring Alerts", period)}
            subtitle={`${data.alertsDetail.total} active`}
            info="Active alert severity distribution plus acknowledged alerts and alerts resolved in the last 24 hours."
            href="/monitoring-alerts"
            accent="bg-amber-400"
            onNavigate={onNavigate}
          >
            <DonutVisual
              data={alertSeverityData}
              height={160}
              innerRadius={44}
              outerRadius={66}
              centerLabel={data.alertsDetail.total}
              centerSub="active"
              chartTheme={chartTheme}
              onNavigate={onNavigate}
            />
            <ChartLegend items={alertSeverityData} onNavigate={onNavigate} />
            <div className="mt-2 flex justify-center gap-4 text-[11px] text-slate-500 dark:text-white/50">
              <button type="button" onClick={() => onNavigate("/monitoring-alerts?status=Acknowledged")} className="hover:text-brand-600 dark:hover:text-brand-400">
                Acknowledged: <strong className="text-slate-800 dark:text-white">{data.alertsDetail.acknowledged}</strong>
              </button>
              <button type="button" onClick={() => onNavigate("/monitoring-alerts?status=Resolved")} className="hover:text-brand-600 dark:hover:text-brand-400">
                Resolved 24h: <strong className="text-slate-800 dark:text-white">{data.alertsDetail.resolved24h}</strong>
              </button>
            </div>
          </SectionCard>

          <SectionCard
            title={dashboardSectionTitle("Incident Trend", period)}
            subtitle={INCIDENT_TREND_LABEL[period]}
            info="How incident volume changes over time for the selected period — useful for spotting escalation patterns."
            href="/incidents"
            accent="bg-brand-400"
            badge={
              incidentTrendChange && (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold",
                    incidentTrendChange.dir === "up"
                      ? "bg-rose-50 text-rose-500 dark:bg-rose-950/40 dark:text-rose-400"
                      : "bg-emerald-50 text-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-400"
                  )}
                >
                  {incidentTrendChange.dir === "up" ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                  {incidentTrendChange.dir === "up" ? "+" : "-"}
                  {incidentTrendChange.pct}%
                </span>
              )
            }
            onNavigate={onNavigate}
          >
            <div className="mt-1 h-[200px] min-w-0">
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={incidentTrendChart} margin={{ left: -18, right: 6, top: 8 }}>
                  <defs>
                    <linearGradient id="incG" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--theme-accent)" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="var(--theme-accent)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="d" tick={{ fontSize: 11, fill: chartTheme.tick }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: chartTheme.tick }} axisLine={false} tickLine={false} width={28} allowDecimals={false} />
                  <Tooltip contentStyle={chartTheme.tooltip} />
                  <Area type="monotone" dataKey="v" stroke="var(--theme-accent)" strokeWidth={3} fill="url(#incG)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>
        </div>

        {/* Bottom row */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <SectionCard
            title={dashboardSectionTitle("Release Trend", period)}
            subtitle={RELEASE_TREND_LABEL[period]}
            info="Scheduled release volume across the trend window for the selected period filter."
            href="/calendar"
            accent="bg-brand-400"
            badge={
              releaseTrendDirection && (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold",
                    releaseTrendDirection === "up"
                      ? "bg-amber-50 text-amber-500 dark:bg-amber-950/40 dark:text-amber-400"
                      : "bg-emerald-50 text-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-400"
                  )}
                >
                  {releaseTrendDirection === "up" ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                  {releaseTrendDirection === "up" ? "Increasing" : "Decreasing"}
                </span>
              )
            }
            onNavigate={onNavigate}
          >
            <div className="mt-1 h-[170px] min-w-0">
              <ResponsiveContainer width="100%" height={170}>
                <BarChart data={releaseTrendChart} barCategoryGap={22} margin={{ left: -18, right: 6, top: 8 }}>
                  <XAxis dataKey="w" tick={{ fontSize: 11, fill: chartTheme.tick }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: chartTheme.tick }} axisLine={false} tickLine={false} width={28} allowDecimals={false} />
                  <Tooltip cursor={{ fill: chartTheme.cursor }} contentStyle={chartTheme.tooltip} />
                  <Bar
                    dataKey="v"
                    radius={[8, 8, 8, 8]}
                    barSize={30}
                    fill="var(--theme-accent)"
                    onClick={(bar) => onNavigate("/calendar")}
                    className="cursor-pointer"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>

          <SectionCard
            title={dashboardSectionTitle("Planned Maintenance", period)}
            subtitle={`${data.maintenanceTotal} events in window`}
            info="Maintenance scheduled in the rolling 30-day window: today's events, DB refreshes, vendor windows, and full outages."
            href="/planned-maintenance"
            accent="bg-sky-400"
            onNavigate={onNavigate}
          >
            <VerticalBarVisual data={data.maintenanceChart} height={170} chartTheme={chartTheme} onNavigate={onNavigate} />
          </SectionCard>

          <SectionCard
            title={dashboardSectionTitle("Change Freeze", period)}
            subtitle="Governance freeze windows"
            info="Releases tagged with an active change-freeze type in the selected period. All zeros means no freeze constraints right now."
            href="/releases"
            accent="bg-cyan-400"
            onNavigate={onNavigate}
          >
            <ChangeFreezeVisual
              types={data.changeFreeze.types}
              totalFrozen={data.changeFreeze.totalFrozenReleases}
              onNavigate={onNavigate}
            />
          </SectionCard>
        </div>

        <div className="mt-5">
          <SectionCard
            title={dashboardSectionTitle("Quick Stats", period)}
            subtitle="Readiness & rollback posture"
            info="Go-live checklist completion average, rollback plan readiness, and release volume for this week and month."
            href="/releases"
            accent="bg-brand-400"
            onNavigate={onNavigate}
          >
            <QuickStatsVisual
              checklistPct={data.quickStats.avgGoLiveChecklistPct}
              rollbackReady={data.quickStats.rollbackReady}
              rollbackAtRisk={data.quickStats.rollbackAtRisk}
              releasesWeek={data.quickStats.releasesThisWeek}
              releasesMonth={data.quickStats.releasesThisMonth}
              onNavigate={onNavigate}
            />
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
