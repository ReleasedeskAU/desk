"use client";

import { useEffect, useState } from "react";
import { Database, Users, Server, Package } from "lucide-react";
import { DataTable } from "@/components/ui/data-table";
import { cn, formatDate } from "@/lib/utils";
import { loadJsonEffect } from "@/lib/safe-fetch";


type LivePayload = {
  counts: Record<string, number>;
  departments: { id: string; name: string; head: string }[];
  applications: {
    id: string;
    name: string;
    type: string;
    criticality: string;
    productOwner: string;
    techLead: string;
    support: string;
    department: { name: string };
    environments: { id: string; name: string; type: string; owner: string; status: string }[];
  }[];
  environments: {
    id: string;
    name: string;
    type: string;
    owner: string;
    status: string;
    application: { name: string; department: { name: string } };
  }[];
  users: {
    id: string;
    userId: string;
    name: string;
    email: string;
    role: string;
    department: string;
    manager: string | null;
    accessLevel: string;
    status: string;
    lastLogin: string | null;
  }[];
  environmentVersions: {
    id: string;
    version: string;
    buildNumber: string | null;
    deployDate: string | null;
    updatedBy: string | null;
    status: string | null;
    notes: string | null;
    application: { name: string; department: { name: string } };
    environment: { name: string; owner: string };
  }[];
};

const EXPECTED: Record<string, number> = {
  department: 8,
  application: 84,
  environment: 504,
  user: 100,
  release: 80,
  calendarEvent: 166,
  envBooking: 80,
  risk: 31,
  drift: 7,
  releaseDependency: 26,
  approval: 27,
  leaveRecord: 30,
  environmentVersion: 180,
};

const cellClass = "py-3 px-4 text-sm align-middle whitespace-nowrap";
const headerClass =
  "py-3 px-4 text-xs font-semibold uppercase tracking-wider text-left bg-gray-50 text-gray-500 border-b border-gray-200";

export function ReferenceDataLiveSection() {
  const [data, setData] = useState<LivePayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return loadJsonEffect<LivePayload>(
      "/api/reference-data/live",
      setData,
      { label: "reference-data-live", onFinally: () => setLoading(false) },
    );
  }, []);

  if (loading) {
    return <p className="text-sm text-gray-500 py-4">Loading live database records…</p>;
  }

  if (!data) {
    return (
      <p className="text-sm text-amber-600 py-4">
        Could not load live data. Run <code className="font-mono">npm run db:setup</code> first.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      <DataTable title="Live Database Counts" subtitle="Seeded from ReleaseDesk_SampleData.xlsx" icon={Database}>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className={headerClass}>Table</th>
              <th className={headerClass}>Count</th>
              <th className={headerClass}>Expected</th>
              <th className={headerClass}>Status</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(EXPECTED).map(([key, expected]) => {
              const actual = data.counts[key] ?? 0;
              const ok = actual === expected;
              return (
                <tr key={key} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/50">
                  <td className={cn(cellClass, "font-medium text-gray-800 capitalize")}>{key.replace(/([A-Z])/g, " $1")}</td>
                  <td className={cn(cellClass, "font-mono font-bold text-brand-600")}>{actual}</td>
                  <td className={cn(cellClass, "font-mono text-gray-500")}>{expected}</td>
                  <td className={cellClass}>
                    <span className={cn("text-xs font-semibold", ok ? "text-emerald-600" : "text-red-600")}>
                      {ok ? "✓ Match" : "✗ Mismatch"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </DataTable>

      <div id="live-dept" className="scroll-mt-24">
        <DataTable title="Departments (Database)" subtitle={`${data.departments.length} departments from seed`} icon={Database}>
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr>
                <th className={headerClass}>Name</th>
                <th className={headerClass}>Head</th>
              </tr>
            </thead>
            <tbody>
              {data.departments.map((row) => (
                <tr key={row.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/50">
                  <td className={cn(cellClass, "font-medium text-gray-800")}>{row.name}</td>
                  <td className={cn(cellClass, "text-gray-500")}>{row.head || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTable>
      </div>

      <div id="live-apps" className="scroll-mt-24">
        <DataTable title="Applications (Database)" subtitle={`${data.applications.length} applications with type, criticality, owners`} icon={Package}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1200px] text-sm">
              <thead>
                <tr>
                  <th className={headerClass}>Application</th>
                  <th className={headerClass}>Department</th>
                  <th className={headerClass}>Type</th>
                  <th className={headerClass}>Criticality</th>
                  <th className={headerClass}>Product Owner</th>
                  <th className={headerClass}>Tech Lead</th>
                  <th className={headerClass}>Support</th>
                  <th className={headerClass}>Environments</th>
                </tr>
              </thead>
              <tbody>
                {data.applications.map((row) => (
                  <tr key={row.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/50">
                    <td className={cn(cellClass, "font-medium text-gray-800 max-w-[220px]")}>{row.name}</td>
                    <td className={cellClass}>{row.department.name}</td>
                    <td className={cellClass}>{row.type}</td>
                    <td className={cellClass}>{row.criticality}</td>
                    <td className={cellClass}>{row.productOwner}</td>
                    <td className={cellClass}>{row.techLead}</td>
                    <td className={cn(cellClass, "max-w-[180px] truncate")} title={row.support}>{row.support}</td>
                    <td className={cellClass}>{row.environments.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DataTable>
      </div>

      <div id="live-envs" className="scroll-mt-24">
        <DataTable title="Environments (Database)" subtitle={`${data.environments.length} app×environment rows with owner & status`} icon={Server}>
          <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className={headerClass}>Application</th>
                  <th className={headerClass}>Department</th>
                  <th className={headerClass}>Environment</th>
                  <th className={headerClass}>Type</th>
                  <th className={headerClass}>Owner</th>
                  <th className={headerClass}>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.environments.map((row) => (
                  <tr key={row.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/50">
                    <td className={cn(cellClass, "font-medium text-gray-800 max-w-[200px]")}>{row.application.name}</td>
                    <td className={cellClass}>{row.application.department.name}</td>
                    <td className={cellClass}>{row.name}</td>
                    <td className={cellClass}>{row.type}</td>
                    <td className={cn(cellClass, "max-w-[180px] truncate")} title={row.owner}>{row.owner}</td>
                    <td className={cellClass}>{row.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DataTable>
      </div>

      <div id="live-users" className="scroll-mt-24">
        <DataTable title="Users (Database)" subtitle={`${data.users.length} users from seed`} icon={Users}>
          <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
            <table className="w-full min-w-[1100px] text-sm">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className={headerClass}>User ID</th>
                  <th className={headerClass}>Name</th>
                  <th className={headerClass}>Email</th>
                  <th className={headerClass}>Role</th>
                  <th className={headerClass}>Department</th>
                  <th className={headerClass}>Manager</th>
                  <th className={headerClass}>Access Level</th>
                  <th className={headerClass}>Status</th>
                  <th className={headerClass}>Last Login</th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((row) => (
                  <tr key={row.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/50">
                    <td className={cn(cellClass, "font-mono text-gray-600")}>{row.userId}</td>
                    <td className={cn(cellClass, "font-medium")}>{row.name}</td>
                    <td className={cellClass}>{row.email}</td>
                    <td className={cellClass}>{row.role}</td>
                    <td className={cellClass}>{row.department}</td>
                    <td className={cellClass}>{row.manager ?? "—"}</td>
                    <td className={cellClass}>{row.accessLevel}</td>
                    <td className={cellClass}>{row.status}</td>
                    <td className={cellClass}>{row.lastLogin ? formatDate(row.lastLogin) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DataTable>
      </div>

      <div id="live-versions" className="scroll-mt-24">
        <DataTable title="Environment Versions (Database)" subtitle={`${data.environmentVersions.length} version records`} icon={Server}>
          <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
            <table className="w-full min-w-[1100px] text-sm">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className={headerClass}>Application</th>
                  <th className={headerClass}>Department</th>
                  <th className={headerClass}>Environment</th>
                  <th className={headerClass}>Env Owner</th>
                  <th className={headerClass}>Version</th>
                  <th className={headerClass}>Build</th>
                  <th className={headerClass}>Deploy Date</th>
                  <th className={headerClass}>Deployed By</th>
                  <th className={headerClass}>Status</th>
                  <th className={headerClass}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {data.environmentVersions.map((row) => (
                  <tr key={row.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/50">
                    <td className={cn(cellClass, "font-medium max-w-[180px]")}>{row.application.name}</td>
                    <td className={cellClass}>{row.application.department.name}</td>
                    <td className={cellClass}>{row.environment.name}</td>
                    <td className={cn(cellClass, "max-w-[160px] truncate")} title={row.environment.owner}>{row.environment.owner}</td>
                    <td className={cn(cellClass, "font-mono")}>{row.version}</td>
                    <td className={cellClass}>{row.buildNumber ?? "—"}</td>
                    <td className={cellClass}>{row.deployDate ? formatDate(row.deployDate) : "—"}</td>
                    <td className={cellClass}>{row.updatedBy ?? "—"}</td>
                    <td className={cellClass}>{row.status ?? "—"}</td>
                    <td className={cn(cellClass, "max-w-[200px] truncate")} title={row.notes ?? ""}>{row.notes ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DataTable>
      </div>
    </div>
  );
}
