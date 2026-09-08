"use client";

import { Loader2, RefreshCw } from "lucide-react";
import type { JiraProjectOption } from "@/lib/jira/projects";

export function JiraProjectPicker({
  projects,
  loading,
  error,
  filter,
  onFilter,
  allProjects,
  selectedKeys,
  onToggleAllProjects,
  onToggleKey,
  onReload,
  canReload,
}: {
  projects: JiraProjectOption[];
  loading: boolean;
  error: string | null;
  filter: string;
  onFilter: (value: string) => void;
  allProjects: boolean;
  selectedKeys: string[];
  onToggleAllProjects: (value: boolean) => void;
  onToggleKey: (key: string, checked: boolean) => void;
  onReload: () => void;
  canReload: boolean;
}) {
  const visible = projects.filter((p) => {
    const q = filter.trim().toLowerCase();
    if (!q) return true;
    return p.key.toLowerCase().includes(q) || p.name.toLowerCase().includes(q);
  });
  const selectedNotInList = selectedKeys.filter((key) => !projects.some((p) => p.key === key));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-800">Which Jira projects should we copy?</h3>
        <button
          type="button"
          onClick={onReload}
          disabled={!canReload || loading}
          className="flex items-center gap-1 text-xs font-semibold text-[#2548C9] hover:underline disabled:opacity-40"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Load projects
        </button>
      </div>
      <label className="flex items-start gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={allProjects} onChange={(e) => onToggleAllProjects(e.target.checked)} />
        <span>Every project this account can see</span>
      </label>
      <input
        value={filter}
        onChange={(e) => onFilter(e.target.value)}
        disabled={allProjects}
        placeholder="Search by name or key"
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50"
      />
      {error && <p className="text-sm text-red-700">{error}</p>}
      {loading && <p className="text-sm text-gray-500">Asking Jira for the project list…</p>}
      {!loading && !allProjects && (
        <div className="max-h-64 overflow-auto rounded-lg border border-gray-200 divide-y">
          {visible.length === 0 && selectedNotInList.length === 0 ? (
            <p className="px-3 py-4 text-sm text-gray-500">No projects loaded yet. Click Load projects.</p>
          ) : (
            <>
              {visible.map((project) => (
                <label key={project.key} className="flex items-center gap-2 px-3 py-2 text-sm text-gray-800 hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={selectedKeys.includes(project.key)}
                    onChange={(e) => onToggleKey(project.key, e.target.checked)}
                  />
                  <span className="font-semibold">{project.key}</span>
                  <span className="text-gray-600">{project.name}</span>
                </label>
              ))}
              {selectedNotInList.map((key) => (
                <label key={key} className="flex items-center gap-2 px-3 py-2 text-sm text-gray-800 hover:bg-gray-50">
                  <input type="checkbox" checked onChange={(e) => onToggleKey(key, e.target.checked)} />
                  <span className="font-semibold">{key}</span>
                  <span className="text-gray-500">Already saved on this connector</span>
                </label>
              ))}
            </>
          )}
        </div>
      )}
      {!allProjects && selectedKeys.length > 0 && (
        <p className="text-xs text-gray-500">{selectedKeys.length} selected — one StaffLess connector covers all of them.</p>
      )}
    </div>
  );
}
