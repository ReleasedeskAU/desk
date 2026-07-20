"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  MarkerType,
  Panel,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeMouseHandler,
  type EdgeMouseHandler,
} from "reactflow";
import "reactflow/dist/style.css";
import { VisualMapNode, type VisualMapNodeData } from "@/components/system-mapping/VisualMapNode";
import type { VisualMapFlowGraph } from "@/lib/system-mapping-visual";
import { cn } from "@/lib/utils";

/** Module-stable map — never recreate inside render (React Flow error #002). */
const NODE_TYPES = { visualMap: VisualMapNode };

type HoverInfo =
  | { kind: "node"; title: string; body: string }
  | { kind: "edge"; title: string; body: string; envPairs: string[] }
  | null;

type VisualMapCanvasProps = {
  graph: VisualMapFlowGraph;
  selectedApp?: string;
  selectedEdgeId?: string | null;
  onNodeClick?: NodeMouseHandler;
  onEdgeClick?: EdgeMouseHandler;
  className?: string;
  heightClassName?: string;
  fitKey?: string;
  /** Larger controls / denser tip text for the fullscreen expand workspace. */
  immersive?: boolean;
};

/**
 * Convert a serializable flow graph into React Flow nodes/edges (KG edge style).
 *
 * @param graph - Built visual map graph.
 * @param selectedApp - Currently focused application name.
 * @param selectedEdgeId - Highlighted edge id, if any.
 * @returns React Flow node and edge arrays.
 */
function toReactFlow(
  graph: VisualMapFlowGraph,
  selectedApp?: string,
  selectedEdgeId?: string | null
): { nodes: Node<VisualMapNodeData>[]; edges: Edge[] } {
  const nodes: Node<VisualMapNodeData>[] = graph.nodes.map((n) => {
    const roleHint =
      n.role === "upstream"
        ? "Feeds into the selected system."
        : n.role === "downstream"
          ? "Selected system feeds into this one."
          : n.role === "selected"
            ? "Focused system — center of this map."
            : "Application in the mapping group.";
    return {
      id: n.id,
      type: "visualMap",
      position: { x: n.x, y: n.y },
      data: {
        label: n.app,
        sublabel: n.sublabel,
        role: n.role,
        selected: selectedApp ? n.app === selectedApp : n.role === "selected",
        hint: `${roleHint} ${n.connectionCount} connection${n.connectionCount === 1 ? "" : "s"}.`,
      },
    };
  });

  const edges: Edge[] = graph.edges.map((e) => {
    const highlighted = selectedEdgeId === e.id;
    const envSummary =
      e.envPairs.length > 0 ? e.envPairs.slice(0, 3).join(", ") : "No env pairs listed";
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      type: "smoothstep",
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
      style: {
        stroke: highlighted ? "#465fff" : "#94A3B8",
        strokeWidth: highlighted ? 2.5 : 1.5,
      },
      labelStyle: { fontSize: 9, fill: highlighted ? "#3730A3" : "#64748B", fontWeight: 600 },
      labelBgStyle: { fill: "#ffffff", fillOpacity: 0.9 },
      labelBgPadding: [4, 2] as [number, number],
      labelBgBorderRadius: 4,
      data: {
        envPairs: e.envPairs,
        count: e.count,
        hint: `Feeds link · ${e.count} env path${e.count === 1 ? "" : "s"}: ${envSummary}. Click for full detail.`,
      },
    };
  });

  return { nodes, edges };
}

const MINIMAP_COLORS: Record<string, string> = {
  upstream: "#0EA5E9",
  selected: "#465fff",
  downstream: "#10B981",
  system: "#8B5CF6",
};

function minimapNodeColor(node: Node): string {
  const role = (node.data as VisualMapNodeData | undefined)?.role;
  return (role && MINIMAP_COLORS[role]) || "#8B5CF6";
}

function FitViewOnChange({ fitKey }: { fitKey: string }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    const t = window.setTimeout(() => {
      void fitView({ padding: 0.18, duration: 280 });
    }, 60);
    return () => window.clearTimeout(t);
  }, [fitKey, fitView]);
  return null;
}

/**
 * Interactive Visual Map canvas with KG-style controls, minimap, and hover tips.
 *
 * @param props - Graph data, selection handlers, and layout classes.
 * @returns Full-bleed React Flow surface.
 */
function VisualMapCanvasInner({
  graph,
  selectedApp,
  selectedEdgeId,
  onNodeClick,
  onEdgeClick,
  className,
  heightClassName = "h-[min(62vh,560px)] min-h-[420px]",
  fitKey = "",
  immersive = false,
}: VisualMapCanvasProps) {
  const [hover, setHover] = useState<HoverInfo>(null);
  const { nodes, edges } = useMemo(
    () => toReactFlow(graph, selectedApp, selectedEdgeId),
    [graph, selectedApp, selectedEdgeId]
  );

  const handleNodeMouseEnter: NodeMouseHandler = useCallback((_, node) => {
    const data = node.data as VisualMapNodeData;
    setHover({
      kind: "node",
      title: data.label,
      body: data.hint || "Click to focus this system and see its upstream / downstream links.",
    });
  }, []);

  const handleNodeMouseLeave = useCallback(() => {
    setHover((prev) => (prev?.kind === "node" ? null : prev));
  }, []);

  const handleEdgeMouseEnter: EdgeMouseHandler = useCallback((_, edge) => {
    const data = edge.data as { hint?: string; envPairs?: string[]; count?: number } | undefined;
    setHover({
      kind: "edge",
      title: String(edge.label ?? "Connection"),
      body: data?.hint || "Click this link to see every environment path behind it.",
      envPairs: data?.envPairs ?? [],
    });
  }, []);

  const handleEdgeMouseLeave = useCallback(() => {
    setHover((prev) => (prev?.kind === "edge" ? null : prev));
  }, []);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-slate-200/80 bg-white dark:border-[var(--border)] dark:bg-[var(--card)]",
        heightClassName,
        className
      )}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        fitView
        minZoom={0.2}
        maxZoom={2}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onNodeMouseEnter={handleNodeMouseEnter}
        onNodeMouseLeave={handleNodeMouseLeave}
        onEdgeMouseEnter={handleEdgeMouseEnter}
        onEdgeMouseLeave={handleEdgeMouseLeave}
        proOptions={{ hideAttribution: true }}
        nodesConnectable={false}
        edgesUpdatable={false}
        className="bg-slate-50/40 dark:bg-transparent"
      >
        <Background gap={16} color="#E2E8F0" />
        <Controls
          className="!rounded-xl !border-gray-200/80 !shadow-theme-sm"
          showInteractive={false}
        />
        <MiniMap
          nodeStrokeWidth={2}
          zoomable
          pannable
          className="!rounded-xl !border-gray-200/80"
          nodeColor={minimapNodeColor}
        />
        <FitViewOnChange fitKey={fitKey} />

        <Panel position="top-left" className="!m-3 max-w-sm">
          <div className="rounded-xl border border-slate-200/90 bg-white/95 px-3 py-2 shadow-md backdrop-blur-sm dark:border-[var(--border)] dark:bg-[var(--card)]/95">
            {hover ? (
              <>
                <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-600 dark:text-indigo-300">
                  {hover.kind === "node" ? "System" : "Connection"} · hover preview
                </p>
                <p className="mt-0.5 text-sm font-bold text-slate-900 dark:text-white">{hover.title}</p>
                <p className="mt-0.5 text-[12px] leading-snug text-slate-600 dark:text-white/65">{hover.body}</p>
                {hover.kind === "edge" && hover.envPairs.length > 0 ? (
                  <ul className="mt-1.5 space-y-0.5">
                    {hover.envPairs.slice(0, immersive ? 8 : 4).map((pair) => (
                      <li
                        key={pair}
                        className="rounded-md bg-slate-50 px-2 py-1 font-mono text-[10px] text-slate-600 dark:bg-white/5 dark:text-white/70"
                      >
                        {pair}
                      </li>
                    ))}
                    {hover.envPairs.length > (immersive ? 8 : 4) ? (
                      <li className="text-[10px] text-slate-400">
                        +{hover.envPairs.length - (immersive ? 8 : 4)} more — click edge for all
                      </li>
                    ) : null}
                  </ul>
                ) : null}
              </>
            ) : (
              <>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">How to read</p>
                <p className="mt-0.5 text-[12px] leading-snug text-slate-600 dark:text-white/65">
                  Hover a system or arrow for a quick tip. Click a system to focus it. Click an arrow
                  to open full environment paths in the info panel.
                </p>
              </>
            )}
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
}

/**
 * Provider-wrapped Visual Map canvas (required for fitView helpers / MiniMap).
 *
 * @param props - Canvas props.
 * @returns ReactFlowProvider + canvas.
 */
export function VisualMapCanvas(props: VisualMapCanvasProps) {
  return (
    <ReactFlowProvider>
      <VisualMapCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
