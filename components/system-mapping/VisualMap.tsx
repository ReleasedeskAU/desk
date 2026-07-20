"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Expand,
  Network,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import type { EdgeMouseHandler, NodeMouseHandler } from "reactflow";
import { HoverExplain, InfoTooltip } from "@/components/ui/InfoTooltip";
import {
  MappingEmpty,
  MappingError,
  MappingLoading,
} from "@/components/system-mapping/SystemMappingUi";
import { VisualMapCanvas } from "@/components/system-mapping/VisualMapCanvas";
import { useSidebar } from "@/context/SidebarContext";
import {
  aggregateAppLinks,
  buildAppFocus,
  buildFocusFlowGraph,
  buildFullFlowGraph,
  connectionCountsByApp,
  listApplications,
  VISUAL_MAP_LEGEND,
  visualMapNodeId,
  type AppFocus,
  type AppLink,
  type VisualMapFlowGraph,
  type VisualMapNodeRole,
} from "@/lib/system-mapping-visual";
import type { MappingEdgeRow, MappingGroupRow } from "@/lib/system-mapping-types";
import { cn } from "@/lib/utils";

type GroupsResponse = { groups: MappingGroupRow[] };
type ViewMode = "focus" | "all";

/**
 * Knowledge-Graph-style Visual Map with focus/full views and an expand modal.
 *
 * @returns System Mapping Visual Map tab.
 * @sideEffects Fetches `/api/system-mapping/groups`.
 */
export function VisualMap() {
  const { isMobileOpen } = useSidebar();
  const [groups, setGroups] = useState<MappingGroupRow[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [selectedApp, setSelectedApp] = useState("");
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("focus");
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<Set<VisualMapNodeRole>>(
    () => new Set(VISUAL_MAP_LEGEND.map((item) => item.role))
  );
  const [expanded, setExpanded] = useState(false);
  const [fitNonce, setFitNonce] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    void fetch("/api/system-mapping/groups", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load mapping graph");
        return response.json() as Promise<GroupsResponse>;
      })
      .then((data) => {
        const nextGroups = data.groups ?? [];
        setGroups(nextGroups);
        setSelectedGroupId((prev) => {
          if (prev && nextGroups.some((g) => g.id === prev)) return prev;
          return nextGroups[0]?.id ?? "";
        });
      })
      .catch((err: unknown) => {
        if ((err as { name?: string })?.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Could not load mapping graph");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const abort = load();
    return abort;
  }, [load]);

  const selectedGroup = groups.find((g) => g.id === selectedGroupId) ?? groups[0] ?? null;
  const edges: MappingEdgeRow[] = selectedGroup?.edges ?? [];
  const apps = useMemo(() => listApplications(edges), [edges]);
  const counts = useMemo(() => connectionCountsByApp(edges), [edges]);
  const appLinks = useMemo(() => aggregateAppLinks(edges), [edges]);

  useEffect(() => {
    if (!apps.length) {
      setSelectedApp("");
      return;
    }
    setSelectedApp((prev) => (prev && apps.includes(prev) ? prev : apps[0]));
  }, [apps]);

  const focus: AppFocus | null = useMemo(
    () => (selectedApp ? buildAppFocus(edges, selectedApp) : null),
    [edges, selectedApp]
  );

  const baseGraph: VisualMapFlowGraph = useMemo(() => {
    if (viewMode === "all") return buildFullFlowGraph(edges, selectedApp || undefined);
    if (focus) return buildFocusFlowGraph(focus);
    return { nodes: [], edges: [] };
  }, [viewMode, edges, selectedApp, focus]);

  const graph = useMemo(() => {
    const q = query.trim().toLowerCase();
    let nodes = baseGraph.nodes.filter((n) => roleFilter.has(n.role));
    if (q) {
      // Keep search hits and their direct neighbors so links stay readable.
      const matched = new Set(
        nodes.filter((n) => n.app.toLowerCase().includes(q)).map((n) => n.id)
      );
      for (const e of baseGraph.edges) {
        if (matched.has(e.source)) matched.add(e.target);
        if (matched.has(e.target)) matched.add(e.source);
      }
      nodes = nodes.filter((n) => matched.has(n.id));
    }
    const ids = new Set(nodes.map((n) => n.id));
    return {
      nodes,
      edges: baseGraph.edges.filter((e) => ids.has(e.source) && ids.has(e.target)),
    };
  }, [baseGraph, query, roleFilter]);

  const selectedLink: AppLink | null = useMemo(() => {
    if (!selectedEdgeId) return null;
    const edge = baseGraph.edges.find((e) => e.id === selectedEdgeId);
    if (!edge) return null;
    return (
      appLinks.find(
        (link) =>
          visualMapNodeId(link.fromApp) === edge.source &&
          visualMapNodeId(link.toApp) === edge.target
      ) ?? null
    );
  }, [selectedEdgeId, baseGraph.edges, appLinks]);

  const onNodeClick: NodeMouseHandler = useCallback((_, node) => {
    const label = (node.data as { label?: string } | undefined)?.label;
    if (label) {
      setSelectedApp(label);
      setSelectedEdgeId(null);
      // Keep All systems in the expand workspace so the whole map stays visible.
      if (viewMode === "all" && !expanded) setViewMode("focus");
    }
  }, [viewMode, expanded]);

  const onEdgeClick: EdgeMouseHandler = useCallback((_, edge) => {
    setSelectedEdgeId(edge.id);
  }, []);

  const toggleRole = (role: VisualMapNodeRole) => {
    setRoleFilter((prev) => {
      const next = new Set(prev);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      return next.size === 0 ? new Set(VISUAL_MAP_LEGEND.map((item) => item.role)) : next;
    });
  };

  /**
   * Open Expand View (Calendar-style) on All systems — stays beside the sidebar.
   *
   * @sideEffects Sets viewMode to "all", clears filters, expanded true, locks body scroll.
   */
  const openExpand = () => {
    setViewMode("all");
    setQuery("");
    setRoleFilter(new Set(VISUAL_MAP_LEGEND.map((item) => item.role)));
    setExpanded(true);
    setFitNonce((n) => n + 1);
  };

  const closeExpand = useCallback(() => setExpanded(false), []);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeExpand();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [expanded, closeExpand]);

  if (loading) return <MappingLoading label="Loading visual map…" />;
  if (error) return <MappingError message={error} onRetry={load} />;

  const groupName = selectedGroup?.name ?? "Mapping";
  const fitKey = `${viewMode}-${selectedApp}-${query}-${[...roleFilter].join(",")}-${fitNonce}-${expanded ? "x" : "i"}`;

  const toolbar = (
    <MapToolbar
      viewMode={viewMode}
      onViewModeChange={setViewMode}
      query={query}
      onQueryChange={setQuery}
      roleFilter={roleFilter}
      onToggleRole={toggleRole}
      nodeCount={graph.nodes.length}
      edgeCount={graph.edges.length}
      selectedApp={selectedApp}
    />
  );

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <header className="rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-50 via-white to-indigo-50/40 p-5 shadow-sm dark:border-[var(--border)] dark:from-white/[0.04] dark:via-[var(--card)] dark:to-indigo-500/10">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-md shadow-indigo-200 dark:shadow-indigo-900/40">
              <Network className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h2 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                  Visual Map
                </h2>
                <InfoTooltip
                  label="About Visual Map"
                  text="Color-coded systems with labeled feeds arrows — like Knowledge Graph. Hover any system or arrow for a plain-language tip. Click a system to focus it. Click an arrow to see every environment path. Expand View opens the same large overlay used on Calendar Timeline."
                />
              </div>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-white/65">
                Hover for tips · click a system to focus · click an arrow for env paths · use Expand View for the large map.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {groups.length > 1 ? (
              <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-white/65">
                <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Group</span>
                <select
                  className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-[var(--border)] dark:bg-white/5 dark:text-white"
                  value={selectedGroup?.id ?? ""}
                  onChange={(e) => setSelectedGroupId(e.target.value)}
                >
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : selectedGroup ? (
              <p className="text-xs font-medium text-slate-500 dark:text-white/45">
                Group · {selectedGroup.name}
              </p>
            ) : null}
            <button
              type="button"
              onClick={load}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-indigo-300 hover:text-indigo-700 dark:border-[var(--border)] dark:bg-white/5 dark:text-white/80"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <StatPill label="Systems" value={String(apps.length)} hint="Distinct applications in this mapping group." />
          <StatPill label="App links" value={String(appLinks.length)} hint="System-to-system links after collapsing duplicate env edges." />
          <StatPill label="Env edges" value={String(edges.length)} hint="Raw environment-level mapping rows." />
        </div>
      </header>

      {groups.length === 0 || edges.length === 0 ? (
        <MappingEmpty message="No mapping connections are saved yet. Use Systems Hub and the other tabs to define relationships, then return here." />
      ) : (
        <>
          {toolbar}

          <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
            {/*
              Single canvas stays mounted. Expand pins it to the content column
              (left = sidebar width) so the rail never gets covered — same idea as AppShell margin.
            */}
            {expanded ? <div className="min-h-[420px]" aria-hidden /> : null}

            <div
              className={cn(
                expanded
                  ? cn(
                      "fixed inset-y-0 right-0 z-50 flex bg-black/55 p-3 backdrop-blur-sm sm:p-5",
                      // Match AppShell: content starts after the sidebar; mobile drawer may cover full width
                      isMobileOpen ? "left-0" : "left-0 lg:left-[var(--sidebar-width)]"
                    )
                  : "relative min-w-0"
              )}
              role={expanded ? "dialog" : undefined}
              aria-modal={expanded ? true : undefined}
              aria-label={expanded ? "Expanded visual map" : undefined}
              onClick={expanded ? closeExpand : undefined}
            >
              <div
                className={cn(
                  "flex min-w-0 flex-col overflow-hidden bg-white dark:bg-[var(--card)]",
                  expanded
                    ? "h-full w-full rounded-2xl border border-gray-200 shadow-2xl dark:border-[var(--border)]"
                    : "rounded-[24px] border border-slate-200/80 px-4 py-5 shadow-[0_18px_40px_-24px_rgba(112,144,176,0.18)] dark:border-[var(--border)]"
                )}
                onClick={expanded ? (e) => e.stopPropagation() : undefined}
              >
                {expanded ? (
                  <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-[var(--border)] sm:px-5">
                    <div className="min-w-0">
                      <h2 className="text-base font-bold text-gray-900 dark:text-white">Visual Map</h2>
                      <p className="text-xs text-gray-500 dark:text-white/55">
                        {groupName} · {graph.nodes.length} systems · {graph.edges.length} links · fit map to view
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {VISUAL_MAP_LEGEND.map(({ role, label, color }) => (
                        <button
                          key={role}
                          type="button"
                          onClick={() => toggleRole(role)}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                            roleFilter.has(role)
                              ? "border-gray-200 bg-white text-gray-700 shadow-sm dark:border-[var(--border)] dark:bg-white/5 dark:text-white/80"
                              : "border-transparent bg-gray-100 text-gray-400 dark:bg-white/[0.03]"
                          )}
                        >
                          <span className="h-2 w-2 rounded-full" style={{ background: color }} />
                          {label}
                        </button>
                      ))}
                      <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-600 dark:bg-slate-900/60">
                        {(
                          [
                            { id: "focus", label: "Focus" },
                            { id: "all", label: "All" },
                          ] as const
                        ).map((mode) => (
                          <button
                            key={mode.id}
                            type="button"
                            onClick={() => setViewMode(mode.id)}
                            className={cn(
                              "rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition",
                              viewMode === mode.id
                                ? "bg-white text-slate-800 shadow-sm dark:bg-white/10 dark:text-white"
                                : "text-slate-500 hover:text-slate-700 dark:text-white/55"
                            )}
                          >
                            {mode.label}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => setFitNonce((n) => n + 1)}
                        className="rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-slate-500 hover:bg-slate-50 dark:text-white/60 dark:hover:bg-white/5"
                      >
                        Fit map
                      </button>
                      <button
                        type="button"
                        onClick={closeExpand}
                        aria-label="Close expanded visual map"
                        className="flex h-9 w-9 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/10 dark:hover:text-white"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mb-3 flex items-center justify-between gap-2 px-1">
                    <p className="text-[11px] text-slate-400 dark:text-white/40">
                      Pan & zoom · Expand View for the full map
                    </p>
                    <button
                      type="button"
                      onClick={openExpand}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-[12.5px] font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-white/85 dark:hover:bg-slate-700"
                    >
                      <Expand size={14} /> Expand View
                    </button>
                  </div>
                )}

                <div className={cn("relative min-h-0", expanded ? "flex-1" : "")}>
                  <VisualMapCanvas
                    graph={graph}
                    selectedApp={selectedApp}
                    selectedEdgeId={selectedEdgeId}
                    onNodeClick={onNodeClick}
                    onEdgeClick={onEdgeClick}
                    fitKey={fitKey}
                    className="border-0"
                    heightClassName={
                      expanded ? "h-full min-h-0 rounded-none" : "h-[min(62vh,560px)] min-h-[420px]"
                    }
                    immersive={expanded}
                  />

                  {expanded && (selectedLink || selectedApp) ? (
                    <div className="absolute bottom-3 left-3 right-3 z-20 max-h-[42%] overflow-y-auto rounded-xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur-sm dark:border-[var(--border)] dark:bg-[var(--card)]/95 sm:left-auto sm:right-3 sm:w-[22rem]">
                      <DetailPanel
                        apps={apps}
                        counts={counts}
                        selectedApp={selectedApp}
                        onSelectApp={(app) => {
                          setSelectedApp(app);
                          setSelectedEdgeId(null);
                        }}
                        focus={focus}
                        selectedLink={selectedLink}
                        onClearEdge={() => setSelectedEdgeId(null)}
                        bare
                      />
                    </div>
                  ) : null}
                </div>

                {expanded ? (
                  <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-gray-200 px-4 py-2.5 dark:border-[var(--border)] sm:px-5">
                    <p className="text-[11px] text-slate-400 dark:text-white/45">
                      Drag to pan · scroll to zoom · hover for tips · click a system or arrow for details · Esc to close
                    </p>
                    <label className="relative">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                      <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search systems…"
                        className="min-h-8 w-44 rounded-lg border border-slate-200 bg-white py-1 pl-8 pr-2 text-[11px] text-slate-800 outline-none focus:border-indigo-500 dark:border-[var(--border)] dark:bg-white/5 dark:text-white"
                      />
                    </label>
                  </div>
                ) : null}
              </div>
            </div>

            {!expanded ? (
              <DetailPanel
                apps={apps}
                counts={counts}
                selectedApp={selectedApp}
                onSelectApp={(app) => {
                  setSelectedApp(app);
                  setSelectedEdgeId(null);
                  setViewMode("focus");
                }}
                focus={focus}
                selectedLink={selectedLink}
                onClearEdge={() => setSelectedEdgeId(null)}
              />
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

function StatPill({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <HoverExplain text={hint} label={`About ${label}`}>
      <span className="inline-flex cursor-help items-center gap-2 rounded-full border border-slate-200/80 bg-white px-3 py-1.5 shadow-sm dark:border-[var(--border)] dark:bg-white/5">
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</span>
        <span className="text-sm font-extrabold tabular-nums text-slate-800 dark:text-white">{value}</span>
      </span>
    </HoverExplain>
  );
}

function MapToolbar({
  viewMode,
  onViewModeChange,
  query,
  onQueryChange,
  roleFilter,
  onToggleRole,
  nodeCount,
  edgeCount,
  selectedApp,
}: {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  query: string;
  onQueryChange: (value: string) => void;
  roleFilter: Set<VisualMapNodeRole>;
  onToggleRole: (role: VisualMapNodeRole) => void;
  nodeCount: number;
  edgeCount: number;
  selectedApp: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm dark:border-[var(--border)] dark:bg-white/5">
        {(
          [
            { id: "focus", label: "Focus" },
            { id: "all", label: "All systems" },
          ] as const
        ).map((mode) => (
          <button
            key={mode.id}
            type="button"
            onClick={() => onViewModeChange(mode.id)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-bold transition",
              viewMode === mode.id
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-50 dark:text-white/70 dark:hover:bg-white/5"
            )}
          >
            {mode.label}
          </button>
        ))}
      </div>

      {VISUAL_MAP_LEGEND.map(({ role, label, color }) => (
        <button
          key={role}
          type="button"
          onClick={() => onToggleRole(role)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
            roleFilter.has(role)
              ? "border-gray-200 bg-white/80 text-gray-700 shadow-theme-sm backdrop-blur-sm dark:border-[var(--border)] dark:bg-white/5 dark:text-white/80"
              : "border-transparent bg-gray-100/80 text-gray-400 dark:bg-white/[0.03]"
          )}
        >
          <span className="h-2 w-2 rounded-full" style={{ background: color }} />
          {label}
        </button>
      ))}

      <label className="relative ml-auto">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search systems…"
          className="min-h-9 w-44 rounded-xl border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-[var(--border)] dark:bg-white/5 dark:text-white sm:w-56"
        />
      </label>

      <span className="text-xs text-gray-400">
        {nodeCount} nodes · {edgeCount} edges
        {selectedApp ? ` · ${selectedApp}` : ""}
      </span>
    </div>
  );
}

function DetailPanel({
  apps,
  counts,
  selectedApp,
  onSelectApp,
  focus,
  selectedLink,
  onClearEdge,
  bare = false,
}: {
  apps: string[];
  counts: Map<string, number>;
  selectedApp: string;
  onSelectApp: (app: string) => void;
  focus: AppFocus | null;
  selectedLink: AppLink | null;
  onClearEdge: () => void;
  bare?: boolean;
}) {
  return (
    <aside
      className={cn(
        bare
          ? "p-1"
          : "rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-[var(--border)] dark:bg-[var(--card)]"
      )}
    >
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Connection info</p>
      <p className="mt-0.5 text-sm text-slate-600 dark:text-white/60">
        Full mapping detail for the selected system or edge.
      </p>

      <label className="mt-3 block">
        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">System</span>
        <select
          className="mt-1 min-h-10 w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-[var(--border)] dark:bg-white/5 dark:text-white"
          value={selectedApp}
          onChange={(e) => onSelectApp(e.target.value)}
        >
          {apps.map((app) => (
            <option key={app} value={app}>
              {app} ({counts.get(app) ?? 0})
            </option>
          ))}
        </select>
      </label>

      {selectedLink ? (
        <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/50 p-3 dark:border-indigo-500/20 dark:bg-indigo-500/10">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[12px] font-bold text-slate-800 dark:text-white">
                {selectedLink.fromApp} → {selectedLink.toApp}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-white/50">
                {selectedLink.count} env link{selectedLink.count === 1 ? "" : "s"}
              </p>
            </div>
            <button
              type="button"
              onClick={onClearEdge}
              className="text-[11px] font-semibold text-indigo-600 hover:underline dark:text-indigo-300"
            >
              Clear
            </button>
          </div>
          <ul className="mt-2 space-y-1">
            {selectedLink.envPairs.map((pair) => (
              <li
                key={pair}
                className="rounded-lg bg-white/90 px-2.5 py-1.5 font-mono text-[11px] text-slate-700 dark:bg-black/20 dark:text-white/75"
              >
                {pair}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {focus ? (
        <div className="mt-4 space-y-3">
          <NeighborList
            title="Upstream · feeds into selected"
            empty="Nothing feeds into this system."
            links={focus.upstream}
            nameOf={(link) => link.fromApp}
            onSelect={onSelectApp}
          />
          <NeighborList
            title="Downstream · selected feeds into"
            empty="This system does not feed into others."
            links={focus.downstream}
            nameOf={(link) => link.toApp}
            onSelect={onSelectApp}
          />
        </div>
      ) : (
        <p className="mt-4 text-xs text-slate-400">Select a system on the map to see details.</p>
      )}
    </aside>
  );
}

function NeighborList({
  title,
  empty,
  links,
  nameOf,
  onSelect,
}: {
  title: string;
  empty: string;
  links: AppLink[];
  nameOf: (link: AppLink) => string;
  onSelect: (app: string) => void;
}) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{title}</p>
      {links.length === 0 ? (
        <p className="mt-1.5 rounded-xl border border-dashed border-slate-200 px-3 py-2.5 text-[12px] text-slate-500 dark:border-white/10 dark:text-white/45">
          {empty}
        </p>
      ) : (
        <ul className="mt-1.5 space-y-1.5">
          {links.map((link) => {
            const name = nameOf(link);
            return (
              <li key={`${link.fromApp}-${link.toApp}`}>
                <button
                  type="button"
                  onClick={() => onSelect(name)}
                  className="flex w-full flex-col rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-left transition hover:border-indigo-300 dark:border-[var(--border)] dark:bg-white/5"
                >
                  <span className="text-[13px] font-bold text-slate-800 dark:text-white">{name}</span>
                  <span className="mt-0.5 text-[11px] text-slate-500 dark:text-white/50">
                    {link.envPairs.join(" · ")}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
