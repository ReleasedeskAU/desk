import type { MappingEdgeRow } from "@/lib/system-mapping-types";

/** One directed link between two applications (envs collapsed for readability). */
export type AppLink = {
  fromApp: string;
  toApp: string;
  direction: string;
  /** Distinct environment pair labels, e.g. "Test → UAT". */
  envPairs: string[];
  count: number;
};

/** Focus neighborhood for one selected application. */
export type AppFocus = {
  app: string;
  /** Apps that feed into the selected app. */
  upstream: AppLink[];
  /** Apps the selected app feeds into. */
  downstream: AppLink[];
  /** Total raw edges touching this app. */
  edgeCount: number;
};

/**
 * Collect unique application names from mapping edges.
 *
 * @param edges - Mapping edge rows from the API.
 * @returns Sorted unique application names.
 */
export function listApplications(edges: MappingEdgeRow[]): string[] {
  const names = new Set<string>();
  for (const edge of edges) {
    const source = edge.sourceApp?.name?.trim();
    const target = edge.targetApp?.name?.trim();
    if (source) names.add(source);
    if (target) names.add(target);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

/**
 * Aggregate env-level edges into app→app links so the visual map stays readable.
 *
 * @param edges - Mapping edge rows from the API.
 * @returns Deduplicated app-level links with env pair details.
 */
export function aggregateAppLinks(edges: MappingEdgeRow[]): AppLink[] {
  const map = new Map<string, AppLink>();

  for (const edge of edges) {
    const fromApp = edge.sourceApp?.name?.trim() || "Unknown";
    const toApp = edge.targetApp?.name?.trim() || "Unknown";
    if (fromApp === toApp) continue;

    const direction = (edge.direction || "downstream").toLowerCase();
    // Normalize so upstream A←B is stored as B→A for consistent neighbor math.
    const from = direction.includes("up") ? toApp : fromApp;
    const to = direction.includes("up") ? fromApp : toApp;
    const key = `${from}||${to}`;

    const envPair = `${edge.sourceEnv?.name ?? "?"} → ${edge.targetEnv?.name ?? "?"}`;
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
      if (!existing.envPairs.includes(envPair)) existing.envPairs.push(envPair);
    } else {
      map.set(key, {
        fromApp: from,
        toApp: to,
        direction: "downstream",
        envPairs: [envPair],
        count: 1,
      });
    }
  }

  return [...map.values()].sort((a, b) => a.fromApp.localeCompare(b.fromApp) || a.toApp.localeCompare(b.toApp));
}

/**
 * Build the focus neighborhood for one application (upstream / downstream only).
 *
 * @param edges - Mapping edge rows from the API.
 * @param app - Selected application name.
 * @returns Focus model, or null when the app has no links.
 */
export function buildAppFocus(edges: MappingEdgeRow[], app: string): AppFocus | null {
  const trimmed = app.trim();
  if (!trimmed) return null;

  const links = aggregateAppLinks(edges);
  const upstream = links.filter((link) => link.toApp === trimmed);
  const downstream = links.filter((link) => link.fromApp === trimmed);
  const edgeCount = edges.filter(
    (edge) => edge.sourceApp?.name === trimmed || edge.targetApp?.name === trimmed
  ).length;

  if (!upstream.length && !downstream.length && edgeCount === 0) return null;

  return { app: trimmed, upstream, downstream, edgeCount };
}

/**
 * Count how many app-level connections touch each application.
 *
 * @param edges - Mapping edge rows from the API.
 * @returns Map of app name → connection count.
 */
export function connectionCountsByApp(edges: MappingEdgeRow[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const link of aggregateAppLinks(edges)) {
    counts.set(link.fromApp, (counts.get(link.fromApp) ?? 0) + 1);
    counts.set(link.toApp, (counts.get(link.toApp) ?? 0) + 1);
  }
  return counts;
}

/** Visual role for Knowledge-Graph-style node coloring. */
export type VisualMapNodeRole = "upstream" | "selected" | "downstream" | "system";

/** Serializable flow node for React Flow mapping. */
export type VisualMapFlowNode = {
  id: string;
  app: string;
  role: VisualMapNodeRole;
  sublabel: string;
  x: number;
  y: number;
  connectionCount: number;
};

/** Serializable flow edge for React Flow mapping. */
export type VisualMapFlowEdge = {
  id: string;
  source: string;
  target: string;
  label: string;
  envPairs: string[];
  count: number;
};

/** Built graph ready for React Flow. */
export type VisualMapFlowGraph = {
  nodes: VisualMapFlowNode[];
  edges: VisualMapFlowEdge[];
};

const COL_X = { upstream: 40, selected: 360, downstream: 680 } as const;
const ROW_H = 88;

/**
 * Stable React Flow node id from an application name.
 *
 * @param app - Application display name.
 * @returns URL-safe id string.
 */
export function visualMapNodeId(app: string): string {
  return `app-${app.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unknown"}`;
}

/**
 * Build a 3-column focus graph (upstream → selected → downstream), KG-style.
 *
 * @param focus - Focus neighborhood for one application.
 * @returns Positioned nodes and directed edges with readable labels.
 */
export function buildFocusFlowGraph(focus: AppFocus): VisualMapFlowGraph {
  const nodes: VisualMapFlowNode[] = [];
  const edges: VisualMapFlowEdge[] = [];
  const selectedId = visualMapNodeId(focus.app);

  nodes.push({
    id: selectedId,
    app: focus.app,
    role: "selected",
    sublabel: `${focus.upstream.length} in · ${focus.downstream.length} out`,
    x: COL_X.selected,
    y: Math.max(focus.upstream.length, focus.downstream.length, 1) * (ROW_H / 2) - 20,
    connectionCount: focus.upstream.length + focus.downstream.length,
  });

  focus.upstream.forEach((link, idx) => {
    const id = visualMapNodeId(link.fromApp);
    nodes.push({
      id,
      app: link.fromApp,
      role: "upstream",
      sublabel: `${link.count} env link${link.count === 1 ? "" : "s"}`,
      x: COL_X.upstream + (idx % 2) * 24,
      y: 40 + idx * ROW_H,
      connectionCount: link.count,
    });
    edges.push({
      id: `e-${id}-${selectedId}`,
      source: id,
      target: selectedId,
      label: link.count > 1 ? `feeds · ${link.count}` : "feeds",
      envPairs: link.envPairs,
      count: link.count,
    });
  });

  focus.downstream.forEach((link, idx) => {
    const id = visualMapNodeId(link.toApp);
    nodes.push({
      id,
      app: link.toApp,
      role: "downstream",
      sublabel: `${link.count} env link${link.count === 1 ? "" : "s"}`,
      x: COL_X.downstream + (idx % 2) * 24,
      y: 40 + idx * ROW_H,
      connectionCount: link.count,
    });
    edges.push({
      id: `e-${selectedId}-${id}`,
      source: selectedId,
      target: id,
      label: link.count > 1 ? `feeds · ${link.count}` : "feeds",
      envPairs: link.envPairs,
      count: link.count,
    });
  });

  return { nodes, edges };
}

/**
 * Build a full application graph from aggregated links (circular layout).
 * Uses app-level edges only so the canvas stays readable vs raw env spaghetti.
 *
 * @param edges - Mapping edge rows from the API.
 * @param selectedApp - Optional app to mark as selected role.
 * @returns Positioned nodes and edges for the full map.
 */
export function buildFullFlowGraph(
  edges: MappingEdgeRow[],
  selectedApp?: string
): VisualMapFlowGraph {
  const links = aggregateAppLinks(edges);
  const apps = listApplications(edges);
  const counts = connectionCountsByApp(edges);
  const selected = selectedApp?.trim() ?? "";

  if (!apps.length) return { nodes: [], edges: [] };

  const radius = Math.max(220, apps.length * 42);
  const cx = 420;
  const cy = 320;

  const nodes: VisualMapFlowNode[] = apps.map((app, idx) => {
    const angle = (2 * Math.PI * idx) / apps.length - Math.PI / 2;
    const n = counts.get(app) ?? 0;
    const isSelected = selected && app === selected;
    return {
      id: visualMapNodeId(app),
      app,
      role: isSelected ? "selected" : "system",
      sublabel: `${n} connection${n === 1 ? "" : "s"}`,
      x: cx + radius * Math.cos(angle) - 70,
      y: cy + radius * Math.sin(angle) - 28,
      connectionCount: n,
    };
  });

  const flowEdges: VisualMapFlowEdge[] = links.map((link) => ({
    id: `e-${visualMapNodeId(link.fromApp)}-${visualMapNodeId(link.toApp)}`,
    source: visualMapNodeId(link.fromApp),
    target: visualMapNodeId(link.toApp),
    label: link.count > 1 ? `feeds · ${link.count}` : "feeds",
    envPairs: link.envPairs,
    count: link.count,
  }));

  return { nodes, edges: flowEdges };
}

/** Legend entries matching Visual Map node roles (Knowledge Graph style). */
export const VISUAL_MAP_LEGEND: ReadonlyArray<{
  role: VisualMapNodeRole;
  label: string;
  color: string;
}> = [
  { role: "upstream", label: "Upstream", color: "#0EA5E9" },
  { role: "selected", label: "Selected", color: "#465fff" },
  { role: "downstream", label: "Downstream", color: "#10B981" },
  { role: "system", label: "System", color: "#8B5CF6" },
];
