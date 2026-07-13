"use client";

import { useMemo } from "react";
import { Server } from "lucide-react";
import {
  DataTable,
  DataTableHeadRow,
  dataTableTableClass,
  tableCell,
  tableRow,
} from "@/components/ui/data-table";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { ENVIRONMENT_COLUMNS } from "@/lib/table-page-columns";
import type { SortDirection } from "@/lib/table-sort";
import { cn } from "@/lib/utils";

function formatDate(iso?: string | Date | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(iso));
}

type VersionRow = {
  id?: string;
  appCode?: string | null;
  status?: string | null;
  version?: string | null;
  buildNumber?: string | null;
  deployDate?: string | Date | null;
  updatedBy?: string | null;
  notes?: string | null;
  environment?: { name?: string; type?: string; owner?: string | null };
  application?: { name?: string; department?: { name?: string } };
};

export function EnvironmentDetailsTable({
  versions,
  isColumnVisible,
  toolbar,
  sortKey,
  sortDir,
  onSort,
}: {
  versions: VersionRow[];
  isColumnVisible: (key: string) => boolean;
  toolbar?: React.ReactNode;
  sortKey: string;
  sortDir: SortDirection;
  onSort: (key: string, dir?: SortDirection) => void;
}) {
  // Server already filtered + ordered — map the workbook-backed fields verbatim.
  const rows = useMemo(() => {
    return versions.map((v) => {
      const appName = v.application?.name ?? "Unknown";
      return {
        id: v.id,
        appId: v.appCode ?? "—",
        application: appName,
        department: v.application?.department?.name ?? "Unknown",
        environment: v.environment?.type ?? v.environment?.name ?? "Unknown",
        version: v.version ?? "—",
        buildNumber: v.buildNumber ?? "—",
        deployDate: v.deployDate,
        deployedBy: v.updatedBy ?? "—",
        status: v.status ?? "Unknown",
        notes: v.notes ?? "—",
      };
    });
  }, [versions]);

  const visibleColCount = ENVIRONMENT_COLUMNS.filter((c) => isColumnVisible(c.key)).length;

  return (
    <DataTable
      title="Environment Deployments"
      subtitle="Detailed deployment configurations across all applications"
      icon={Server}
      toolbar={toolbar}
    >
      <table className={dataTableTableClass}>
        <thead>
          <DataTableHeadRow
            columns={ENVIRONMENT_COLUMNS}
            isColumnVisible={isColumnVisible}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={onSort}
          />
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id ?? `${row.appId}-${row.environment}-${i}`} className={tableRow}>
              {isColumnVisible("appId") && (
                <td className={cn(tableCell, "whitespace-nowrap font-medium text-gray-500")}>
                  {row.id ? (
                    <ProgressLink
                      href={`/environments/versions/${row.id}`}
                      className="text-brand-600 hover:underline dark:text-brand-400"
                    >
                      {row.appId}
                    </ProgressLink>
                  ) : (
                    row.appId
                  )}
                </td>
              )}
              {isColumnVisible("application") && (
                <td className={cn(tableCell, "whitespace-nowrap font-medium text-gray-800 dark:text-white")}>
                  {row.application}
                </td>
              )}
              {isColumnVisible("department") && (
                <td className={cn(tableCell, "whitespace-nowrap text-gray-600 dark:text-white/70")}>{row.department}</td>
              )}
              {isColumnVisible("environment") && (
                <td className={cn(tableCell, "whitespace-nowrap")}>
                  <span className="inline-flex rounded-md bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700 dark:bg-white/10 dark:text-white/80">
                    {row.environment}
                  </span>
                </td>
              )}
              {isColumnVisible("version") && (
                <td className={cn(tableCell, "whitespace-nowrap font-mono text-xs font-semibold text-brand-600 dark:text-brand-400")}>
                  {row.version}
                </td>
              )}
              {isColumnVisible("buildNumber") && (
                <td className={cn(tableCell, "whitespace-nowrap font-mono text-[10px] text-gray-500")}>{row.buildNumber}</td>
              )}
              {isColumnVisible("deployDate") && (
                <td className={cn(tableCell, "whitespace-nowrap text-xs text-gray-500")}>{formatDate(row.deployDate)}</td>
              )}
              {isColumnVisible("deployedBy") && (
                <td className={cn(tableCell, "whitespace-nowrap text-gray-600 dark:text-white/70")}>{row.deployedBy}</td>
              )}
              {isColumnVisible("status") && (
                <td className={cn(tableCell, "whitespace-nowrap")}>
                  <span
                    className={cn(
                      "inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                      row.status.toLowerCase() === "active"
                        ? "bg-success-100 text-success-700"
                        : "bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-white/80"
                    )}
                  >
                    {row.status}
                  </span>
                </td>
              )}
              {isColumnVisible("notes") && (
                <td className={cn(tableCell, "max-w-[200px] truncate text-xs text-gray-500")} title={row.notes}>
                  {row.notes}
                </td>
              )}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={Math.max(visibleColCount, 1)} className="py-8 text-center text-sm text-gray-500">
                No deployment data found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </DataTable>
  );
}
