"use client";

import { ProgressLink } from "@/components/layout/NavigationProgress";
import { AdvancedCard } from "@/components/ui/advanced-card";
import { StatusBadge } from "@/components/badges/StatusBadge";
import { DataTable, tableCell, tableHeadRow, tableRow } from "@/components/ui/data-table";
import { formatDate, cn } from "@/lib/utils";
import type { UnifiedRelease } from "@/lib/unified-releases";
import { sourceTokens } from "@/lib/palette";
import { Database, Layers, Package, Sparkles } from "lucide-react";

type Overview = {
  counts: {
    combined: { planned: number; inProgress: number; blocked: number; atRisk: number; shipped?: number; total: number };
    database: { total: number; atRisk: number; blocked: number };
    demo: { total: number; atRisk: number; blocked: number };
  };
  releases: UnifiedRelease[];
  environment: { driftApps: number; bookedEnvs: number; applications: number };
  demoPortfolio: { totalDemoReleases: number; inPeriod: number };
  links: { label: string; href: string }[];
};

export function UnifiedPortfolioPanel({ data }: { data: Overview }) {
  return (
    <div className="space-y-6">
      <AdvancedCard
        title="Portfolio across Release Desk"
        subtitle="Database MVP + synthetic demo releases in one view"
        icon={Layers}
        variant="glass"
      >
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <SourceStat label="Combined releases" value={data.counts.combined.total} hint="DB + demo in period" />
          <SourceStat label="Database" value={data.counts.database.total} hint="SQLite / MVP" icon={Database} />
          <SourceStat label="Demo command center" value={data.counts.demo.total} hint="Synthetic demo data" icon={Sparkles} />
          <SourceStat label="Env bookings" value={data.environment.bookedEnvs} hint={`${data.environment.driftApps} apps with version drift`} />
        </div>
        <div className="flex flex-wrap gap-2">
          {data.links.map((l) => (
            <ProgressLink
              key={l.href}
              href={l.href}
              className="rounded-lg border border-gray-200 bg-white/80 px-3 py-1.5 text-xs font-medium text-gray-700 hover:border-brand-300 hover:text-brand-600"
            >
              {l.label}
            </ProgressLink>
          ))}
        </div>
      </AdvancedCard>

      <DataTable title="Releases" subtitle="Filtered releases across the portfolio" icon={Package}>
        <table className="w-full text-sm">
          <thead>
            <tr className={tableHeadRow}>
              <th className={cn(tableCell, "text-left")}>Release ID</th>
              <th className={cn(tableCell, "text-left")}>Release Name</th>
              <th className={cn(tableCell, "text-left")}>Program / Project</th>
              <th className={cn(tableCell, "text-left")}>Owner</th>
              <th className={cn(tableCell, "text-left")}>Status</th>
              <th className={cn(tableCell, "text-left")}>Release date</th>
              <th className={cn(tableCell, "text-left")}>Department</th>
              <th className={cn(tableCell, "text-left")}>Application/s</th>
            </tr>
          </thead>
          <tbody>
            {data.releases.map((r) => (
              <tr key={`${r.source}-${r.id}`} className={tableRow}>
                <td className={tableCell}>
                  <ProgressLink href={r.href} className="font-mono text-xs text-brand-600 hover:underline">
                    {r.code}
                  </ProgressLink>
                </td>
                <td className={tableCell}>
                  <ProgressLink href={r.href} className="hover:text-brand-600">{r.name}</ProgressLink>
                </td>
                <td className={cn(tableCell, "text-gray-600")}>{r.programProject ?? "N/A"}</td>
                <td className={cn(tableCell, "text-gray-600")}>{r.owner}</td>
                <td className={tableCell}><StatusBadge status={r.status as "Ready"} /></td>
                <td className={cn(tableCell, "text-gray-500")}>{formatDate(r.date)}</td>
                <td className={cn(tableCell, "text-gray-600")}>{r.departmentName ?? r.group}</td>
                <td className={cn(tableCell, "text-gray-600")}>{r.applicationName ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DataTable>
    </div>
  );
}

function SourceBadge({ source }: { source: "database" | "demo" }) {
  const token = sourceTokens[source];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        token.bg,
        token.text
      )}
    >
      {source === "database" ? <Database className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
      {source === "database" ? "DB" : "Demo"}
    </span>
  );
}

function SourceStat({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: number;
  hint: string;
  icon?: typeof Database;
}) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/60 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-gray-500">
        {Icon && <Icon className="h-3 w-3" />} {label}
      </div>
      <p className="text-xl font-bold font-mono text-[10px] uppercase tracking-wider text-gray-800 mt-0.5">{value}</p>
      <p className="text-[10px] text-gray-400 mt-0.5">{hint}</p>
    </div>
  );
}

export function SourceBadgeInline({ source }: { source: "database" | "demo" }) {
  return <SourceBadge source={source} />;
}
