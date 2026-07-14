"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  CheckCircle2,
  Clock,
  Rocket,
  Server,
  ShieldAlert,
  Users,
  Activity,
} from "lucide-react";
import { useThemeMode } from "@/context/ThemeModeContext";
import { type DashboardPeriod } from "@/lib/dashboard-period";
import { cn } from "@/lib/utils";
import { loadJsonEffect } from "@/lib/safe-fetch";

export type TopIssueSeverity = "rose" | "amber" | "sky";
export type TopIssueIcon = "Ban" | "ShieldAlert" | "Clock" | "Server" | "Users";

export type TopIssue = {
  severity: TopIssueSeverity;
  title: string;
  reason: string;
  meta: string;
  href: string;
  icon: TopIssueIcon;
};

type PipelineTile = {
  label: string;
  value: number;
  tone: "rose" | "amber" | "emerald" | "indigo" | "violet" | "sky";
};

type DashboardSlice = {
  topIssues: TopIssue[];
  pipeline: PipelineTile[];
};

const SEV_STYLE: Record<TopIssueSeverity, { bg: string; ring: string; text: string; dot: string; label: string }> = {
  rose: {
    bg: "bg-rose-50 dark:bg-rose-950/35",
    ring: "ring-rose-100 dark:ring-rose-900/50",
    text: "text-rose-600 dark:text-rose-400",
    dot: "#f43f5e",
    label: "Critical",
  },
  amber: {
    bg: "bg-amber-50 dark:bg-amber-950/35",
    ring: "ring-amber-100 dark:ring-amber-900/50",
    text: "text-amber-600 dark:text-amber-400",
    dot: "#f59e0b",
    label: "Attention",
  },
  sky: {
    bg: "bg-sky-50 dark:bg-sky-950/35",
    ring: "ring-sky-100 dark:ring-sky-900/50",
    text: "text-sky-600 dark:text-sky-400",
    dot: "#0ea5e9",
    label: "Heads up",
  },
};

const ISSUE_ICONS: Record<TopIssueIcon, typeof Ban> = {
  Ban,
  ShieldAlert,
  Clock,
  Server,
  Users,
};

const TONE_LINE: Record<string, string> = {
  rose: "#f43f5e",
  amber: "#f59e0b",
  emerald: "#10b981",
  indigo: "#6366f1",
  violet: "#8b5cf6",
  sky: "#0ea5e9",
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
        boxShadow: isDark ? "0 10px 30px -10px rgba(0,0,0,0.55)" : "0 10px 30px -10px rgba(112,144,176,.35)",
        fontSize: 12,
        background: isDark ? "#2a3142" : "#ffffff",
        color: isDark ? "#ffffff" : "#1B2559",
      } as React.CSSProperties,
    }),
    [isDark]
  );
}

function PanelCard({ children, accent }: { children: React.ReactNode; accent?: string }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[24px] bg-white p-6 shadow-[0_18px_40px_-24px_rgba(112,144,176,0.18)]",
        "dark:bg-[var(--card)] dark:shadow-[0_18px_40px_-24px_rgba(0,0,0,0.45)]"
      )}
    >
      {accent && <div className={cn("absolute inset-x-0 top-0 h-[3px]", accent)} />}
      {children}
    </div>
  );
}

export function IssueRow({
  issue,
  onNavigate,
}: {
  issue: TopIssue;
  onNavigate: (href: string) => void;
}) {
  const s = SEV_STYLE[issue.severity];
  const Icon = ISSUE_ICONS[issue.icon];
  return (
    <button
      type="button"
      onClick={() => onNavigate(issue.href)}
      className={cn(
        "group flex w-full items-start gap-3 rounded-2xl px-3.5 py-4 text-left ring-1 transition-all",
        "hover:-translate-y-0.5 hover:shadow-md dark:hover:shadow-black/30",
        s.bg,
        s.ring
      )}
    >
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm dark:bg-white/10 dark:shadow-none">
        <Icon size={16} className={s.text} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-1.5 py-0.5 text-[10px] font-bold dark:bg-white/10", s.text)}>
            <span className="h-1 w-1 rounded-full" style={{ background: s.dot }} />
            {s.label}
          </span>
          <span className="truncate text-[13px] font-bold text-slate-800 dark:text-white">{issue.title}</span>
        </div>
        <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-slate-600 dark:text-white/70">{issue.reason}</p>
        <p className="mt-1.5 text-[11px] font-medium text-slate-400 dark:text-white/45">{issue.meta}</p>
      </div>
      <ArrowRight
        size={16}
        className="mt-2 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-500 dark:text-white/25 dark:group-hover:text-white/55"
      />
    </button>
  );
}

export function NeedsYourDecisionPanel({
  period = "all",
  className,
}: {
  period?: DashboardPeriod;
  className?: string;
}) {
  const router = useRouter();
  const chartTheme = useChartTheme();
  const [data, setData] = useState<DashboardSlice | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    return loadJsonEffect<{ topIssues?: DashboardSlice["topIssues"]; pipeline?: DashboardSlice["pipeline"] }>(
      `/api/dashboard?period=${period}`,
      (d) => setData({ topIssues: d.topIssues ?? [], pipeline: d.pipeline ?? [] }),
      { label: "dashboard", onFinally: () => setLoading(false) },
    );
  }, [period]);

  const issueSeverityMix = useMemo(() => {
    const issues = data?.topIssues ?? [];
    const counts = { Critical: 0, Attention: 0, "Heads up": 0 };
    for (const i of issues) {
      if (i.severity === "rose") counts.Critical++;
      else if (i.severity === "amber") counts.Attention++;
      else counts["Heads up"]++;
    }
    return [
      { name: "Critical", value: counts.Critical, color: "#f43f5e" },
      { name: "Attention", value: counts.Attention, color: "#f59e0b" },
      { name: "Heads up", value: counts["Heads up"], color: "#0ea5e9" },
    ].filter((d) => d.value > 0);
  }, [data?.topIssues]);

  const pipelineSnapshot = useMemo(
    () =>
      (data?.pipeline ?? [])
        .filter((p) => p.label !== "Total Releases")
        .slice(0, 5)
        .map((p) => ({ name: p.label.replace("Pending ", ""), v: p.value, fill: TONE_LINE[p.tone] ?? TONE_LINE.indigo })),
    [data?.pipeline]
  );

  const onNavigate = (href: string) => router.push(href);

  return (
    <section className={className}>
      <div className="mb-3">
        <h2 className="text-[15px] font-bold text-[#1B2559] dark:text-white">Needs Your Decision</h2>
        <p className="text-[12px] text-slate-400 dark:text-white/50">
          Synthesized from blockers, risk, conflicts, approvals and monitoring — ranked by urgency
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]">
          <PanelCard accent="bg-brand-500">
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 animate-pulse rounded-2xl bg-slate-100 dark:bg-white/5" />
              ))}
            </div>
          </PanelCard>
          <div className="grid gap-4">
            <div className="h-[210px] animate-pulse rounded-[24px] bg-slate-100 dark:bg-white/5" />
            <div className="h-[210px] animate-pulse rounded-[24px] bg-slate-100 dark:bg-white/5" />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]">
          <PanelCard accent="bg-brand-500">
            <div className="space-y-3">
              {(data?.topIssues ?? []).length > 0 ? (
                data!.topIssues.map((issue, i) => (
                  <IssueRow key={`${issue.href}-${i}`} issue={issue} onNavigate={onNavigate} />
                ))
              ) : (
                <p className="py-6 text-center text-[13px] text-slate-500 dark:text-white/55">
                  No urgent decisions right now — portfolio looks clear.
                </p>
              )}
            </div>
          </PanelCard>

          <div className="grid gap-4">
            <PanelCard accent="bg-rose-400">
              <h3 className="text-[13px] font-bold text-slate-800 dark:text-white">Decision mix</h3>
              <p className="mt-0.5 text-[11px] text-slate-400 dark:text-white/50">By urgency band</p>
              <div className="relative mt-2 h-[150px] min-w-0">
                {issueSeverityMix.length > 0 ? (
                  <ResponsiveContainer width="100%" height={150}>
                    <PieChart>
                      <Pie
                        data={issueSeverityMix}
                        dataKey="value"
                        innerRadius={42}
                        outerRadius={62}
                        paddingAngle={3}
                        stroke="none"
                        cornerRadius={4}
                      >
                        {issueSeverityMix.map((e, i) => (
                          <Cell key={i} fill={e.color} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={chartTheme.tooltip} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-[12px] text-slate-400 dark:text-white/45">
                    No issues
                  </div>
                )}
              </div>
              <div className="mt-1 flex flex-wrap justify-center gap-3">
                {issueSeverityMix.map((e) => (
                  <span key={e.name} className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-white/55">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: e.color }} />
                    {e.name} <strong className="text-slate-700 dark:text-white">{e.value}</strong>
                  </span>
                ))}
              </div>
            </PanelCard>

            <PanelCard accent="bg-brand-400">
              <h3 className="text-[13px] font-bold text-slate-800 dark:text-white">Pipeline snapshot</h3>
              <p className="mt-0.5 text-[11px] text-slate-400 dark:text-white/50">Key release statuses</p>
              <div className="mt-2 h-[150px] min-w-0">
                <ResponsiveContainer width="100%" height={150}>
                  <BarChart data={pipelineSnapshot} barCategoryGap={10} margin={{ left: -22, right: 4, top: 4, bottom: 0 }}>
                    <XAxis dataKey="name" tick={{ fontSize: 9, fill: chartTheme.tick }} axisLine={false} tickLine={false} interval={0} />
                    <YAxis tick={{ fontSize: 9, fill: chartTheme.tick }} axisLine={false} tickLine={false} width={22} allowDecimals={false} />
                    <Tooltip cursor={{ fill: chartTheme.cursor }} contentStyle={chartTheme.tooltip} />
                    <Bar dataKey="v" radius={[6, 6, 6, 6]} barSize={18}>
                      {pipelineSnapshot.map((e, i) => (
                        <Cell key={i} fill={e.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </PanelCard>
          </div>
        </div>
      )}
    </section>
  );
}
