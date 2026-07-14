"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ReactFlow, { Background, Controls, MiniMap, Node, Edge, MarkerType, type NodeMouseHandler, Panel, useNodesState, useEdgesState } from "reactflow";
import "reactflow/dist/style.css";
import { Search, Map as MapIcon, ShieldAlert, Plus } from "lucide-react";
import { FilterSelect, TableFilterBar } from "@/components/filters/TableFilterBar";
import { PageDocumentation } from "@/components/help/PageDocumentation";
import { useTableFilters } from "@/hooks/useTableFilters";
import { SYSTEM_MAPPING_FILTER_SCHEMA } from "@/lib/table-filters";
import { ServiceNode } from "@/components/dependencies/ServiceNode";
import { GenerateMappingPanel } from "@/components/system-mapping/GenerateMappingPanel";
import { AnalyseRiskSection } from "@/components/system-mapping/AnalyseRiskSection";
import { ArchitectureInfoPanel } from "@/components/system-mapping/ArchitectureInfoPanel";
import type { MappingGroupRow } from "@/lib/system-mapping-types";
import type { SessionUser } from "@/lib/auth/roles";
import { canEdit as sessionCanEdit } from "@/lib/auth/roles";
import { loadJsonEffect } from "@/lib/safe-fetch";

import { DepartmentNode } from "@/components/system-mapping/DepartmentNode";

const nodeTypes = { service: ServiceNode, department: DepartmentNode };

// Mock data generator for beautiful nodes
function getMockData(id: string) {
  const hash = id.split("").reduce((a, b) => a + b.charCodeAt(0), 0);
  const code = `ENV-0${(hash % 9000) + 1000}`;
  
  return {
    code,
    statusType: hash % 3 === 0 ? "critical" : hash % 2 === 0 ? "stable" : "staging" as const,
    versionStr: hash % 3 === 0 ? "Critical System" : hash % 2 === 0 ? "Stable Env" : "Staging Env",
  };
}

export function SystemMappingContent() {
  const { values, setFilter, clearAll, hasActive } = useTableFilters(SYSTEM_MAPPING_FILTER_SCHEMA);
  const [groups, setGroups] = useState<MappingGroupRow[]>([]);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [activeSidePanel, setActiveSidePanel] = useState<"risk" | "info" | "none">("info");

  const activeGroupId = values.groupId;
  const canEdit = sessionCanEdit(user);

  const loadGroups = useCallback(() => {
    return loadJsonEffect<{ groups?: MappingGroupRow[] }>(
      "/api/system-mapping/groups",
      (d) => {
        const loaded = d.groups ?? [];
        setGroups(loaded);
        if (loaded.length > 0 && !values.groupId) {
          setFilter("groupId", loaded[0].id);
        }
      },
      { label: "system-mapping-groups" },
    );
  }, [setFilter, values.groupId]);

  useEffect(() => {
    const cleanupAuth = loadJsonEffect<{ user: SessionUser }>(
      "/api/auth/me",
      (d) => setUser(d.user),
      { label: "auth-me" },
    );
    const cleanupGroups = loadGroups();
    return () => {
      cleanupAuth();
      cleanupGroups();
    };
  }, [loadGroups]);

  const activeGroup = groups.find(g => g.id === activeGroupId) || groups[0];

  const [nodes, setNodes, onNodesChange] = useNodesState<Node[]>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge[]>([]);

  useEffect(() => {
    if (!activeGroup) {
      setNodes([]);
      setEdges([]);
      return;
    }
    
    type NodeMeta = { label: string; kind: "app" | "env"; dept: string };
    const nodeMap = new Map<string, NodeMeta>();
    activeGroup.edges.forEach((e) => {
      const srcKey = `${e.sourceApp?.name ?? "?"}:${e.sourceEnv?.name ?? "?"}`;
      const tgtKey = `${e.targetApp?.name ?? "?"}:${e.targetEnv?.name ?? "?"}`;
      if (!nodeMap.has(srcKey)) nodeMap.set(srcKey, { label: `${e.sourceApp?.name} - ${e.sourceEnv?.name}`, kind: "env", dept: e.sourceApp?.department?.name || "Other" });
      if (!nodeMap.has(tgtKey)) nodeMap.set(tgtKey, { label: `${e.targetApp?.name} - ${e.targetEnv?.name}`, kind: "env", dept: e.targetApp?.department?.name || "Other" });
    });

    const ns: Node[] = [];
    const depts = new Map<string, string[]>();
    for (const [key, meta] of nodeMap.entries()) {
      if (!depts.has(meta.dept)) depts.set(meta.dept, []);
      depts.get(meta.dept)!.push(key);
    }

    // Top row / bottom row configuration for layout
    const topRow = ["Finance", "HR", "IT", "CRM", "Manufacturing", "Logistics"];
    const bottomRow = ["Legal", "Security", "Shared Svc"];
    
    // Create Department nodes and Application nodes
    let currentX = 0;
    let bottomX = 0;
    for (const [dept, keys] of depts.entries()) {
      const isTop = topRow.includes(dept);
      const isBottom = bottomRow.includes(dept);
      const x = isBottom ? bottomX : currentX;
      const y = isBottom ? 500 : 0;
      
      const width = 280;
      const height = 80 + keys.length * 120; // Increased padding for nodes
      
      ns.push({
        id: `dept-${dept}`,
        type: "department",
        data: { label: dept, width, height },
        position: { x, y },
        style: { width, height },
      });

      keys.forEach((key, i) => {
        const meta = nodeMap.get(key)!;
        const mock = getMockData(key);
        ns.push({
          id: key,
          type: "service",
          parentId: `dept-${dept}`,
          extent: "parent" as const,
          data: {
            label: meta.label,
            code: mock.code,
            statusType: mock.statusType,
            versionStr: mock.versionStr,
            selected: false,
          },
          position: { x: (width - 220) / 2, y: 50 + i * 110 }, // Increased vertical spacing
        });
      });

      if (isBottom) bottomX += width + 40;
      else currentX += width + 40;
    }

    const es: Edge[] = activeGroup.edges.map((e, i) => {
      const srcKey = `${e.sourceApp?.name ?? "?"}:${e.sourceEnv?.name ?? "?"}`;
      const tgtKey = `${e.targetApp?.name ?? "?"}:${e.targetEnv?.name ?? "?"}`;
      return {
        id: `e-${i}`,
        source: srcKey,
        target: tgtKey,
        type: "default", // Fixed edge type error (default IS bezier)
        label: e.notes?.split("(")[1]?.replace(")", "") || e.notes,
        labelStyle: { fill: "#64748B", fontSize: 9, fontWeight: 600 },
        labelBgStyle: { fill: "#F8FAFC", fillOpacity: 0.8 },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#94A3B8" },
        style: { stroke: "#94A3B8", strokeWidth: 1.5 },
        animated: true,
      };
    });

    setNodes(ns);
    setEdges(es);
  }, [activeGroup, setNodes, setEdges]);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);

  const handleNodeClick: NodeMouseHandler = useCallback((_, node) => {
    if (node.type === "service") {
      setSelectedNode(node);
    }
  }, []);

  const highlightedEdgeIds = useMemo(() => {
    if (!selectedNode) return new Set<string>();
    return new Set(edges.filter(e => e.source === selectedNode.id || e.target === selectedNode.id).map(e => e.id));
  }, [edges, selectedNode]);

  const highlightedNodeIds = useMemo(() => {
    if (!selectedNode) return new Set<string>();
    const nodeIds = new Set<string>([selectedNode.id, selectedNode.parentId as string]);
    edges.forEach(e => {
      if (e.source === selectedNode.id) {
        nodeIds.add(e.target);
        const tNode = nodes.find(n => n.id === e.target);
        if (tNode?.parentId) nodeIds.add(tNode.parentId);
      }
      if (e.target === selectedNode.id) {
        nodeIds.add(e.source);
        const sNode = nodes.find(n => n.id === e.source);
        if (sNode?.parentId) nodeIds.add(sNode.parentId);
      }
    });
    return nodeIds;
  }, [edges, nodes, selectedNode]);

  const displayNodes = useMemo(() => {
    if (!selectedNode) return nodes;
    return nodes.map(n => ({
      ...n,
      style: { ...n.style, opacity: highlightedNodeIds.has(n.id) ? 1 : 0.2, transition: 'opacity 0.3s' },
      data: { ...n.data, selected: n.id === selectedNode.id }
    }));
  }, [nodes, selectedNode, highlightedNodeIds]);

  const displayEdges = useMemo(() => {
    if (!selectedNode) return edges;
    return edges.map(e => ({
      ...e,
      style: { ...e.style, opacity: highlightedEdgeIds.has(e.id) ? 1 : 0.1, strokeWidth: highlightedEdgeIds.has(e.id) ? 2 : 1, transition: 'all 0.3s' },
      animated: highlightedEdgeIds.has(e.id),
      labelStyle: { ...e.labelStyle, fillOpacity: highlightedEdgeIds.has(e.id) ? 1 : 0.1 }
    }));
  }, [edges, selectedNode, highlightedEdgeIds]);

  return (
    <div className={isFullscreen ? "fixed inset-0 z-[100] flex flex-col bg-gray-50 p-4" : "h-[calc(100vh-2rem)] flex flex-col bg-gray-50/50 -m-8 p-8"}>
      {!isFullscreen && (
        <div className="flex items-center justify-between mb-4 bg-white p-4 rounded-xl shadow-theme-sm border border-gray-200">
          <div>
            <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              System Mapping <span className="bg-brand-500 text-white text-[10px] px-2 py-0.5 rounded-full">ENTERPRISE</span>
            </h1>
            <p className="text-xs text-gray-500 font-medium mt-1 flex items-center gap-2">
              <MapIcon className="w-3 h-3" /> Architecture topology source of truth
            </p>
          </div>
          <div className="flex items-center gap-4">
            <PageDocumentation pageKey="system-mapping" />
            <TableFilterBar hasActive={hasActive} onClear={clearAll} className="mb-0">
              <FilterSelect
                value={activeGroupId}
                onChange={(v) => setFilter("groupId", v)}
              >
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </FilterSelect>
            </TableFilterBar>
            {canEdit && (
              <button 
                onClick={() => setPanelOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors shadow-sm"
              >
                <Plus className="w-4 h-4" /> Add Mapping
              </button>
            )}
            <div className="flex bg-gray-100 p-0.5 rounded-lg border border-gray-200">
              <button 
                onClick={() => setActiveSidePanel(prev => prev === "info" ? "none" : "info")}
                className={`flex items-center gap-1.5 px-3 py-1 text-sm font-medium rounded-md transition-colors ${activeSidePanel === 'info' ? 'bg-white shadow-sm text-brand-700' : 'text-gray-600 hover:text-gray-900'}`}
              >
                Insights
              </button>
              <button 
                onClick={() => setActiveSidePanel(prev => prev === "risk" ? "none" : "risk")}
                className={`flex items-center gap-1.5 px-3 py-1 text-sm font-medium rounded-md transition-colors ${activeSidePanel === 'risk' ? 'bg-white shadow-sm text-warning-700' : 'text-gray-600 hover:text-gray-900'}`}
              >
                <ShieldAlert className="w-3.5 h-3.5" /> Risk
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-1 gap-4 min-h-0 relative">
        {/* Full Canvas */}
        <div className={`flex-1 overflow-hidden bg-[#fbfcfd] ${isFullscreen ? 'rounded-2xl shadow-2xl border-2 border-gray-300' : 'rounded-xl shadow-theme-sm border border-gray-200'}`}>
          <ReactFlow 
            nodes={displayNodes} 
            edges={displayEdges} 
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={handleNodeClick}
            onPaneClick={() => setSelectedNode(null)}
            nodeTypes={nodeTypes} 
            fitView
            proOptions={{ hideAttribution: true }}
          >
            {displayNodes.length === 0 && (
              <Panel position="top-center" className="mt-20 text-center max-w-md">
                <p className="text-sm font-medium text-gray-700">No mapping edges loaded</p>
                <p className="text-xs text-gray-500 mt-1">
                  Run <code className="font-mono bg-gray-100 px-1 rounded">npx tsx prisma/seed-mapping-only.ts</code> or use Add Mapping to generate topology.
                </p>
              </Panel>
            )}
            <Background gap={16} color="#E2E8F0" />
            <Controls className="!rounded-xl shadow-theme-md border-gray-200 !mb-14" position="bottom-right" />
            
            <Panel position="top-right" className="flex gap-2">
              <button
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="bg-white p-2 rounded-lg shadow-theme-md border border-gray-200 text-gray-600 hover:text-brand-600 hover:bg-gray-50 transition-colors"
                title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {isFullscreen ? (
                    <>
                      <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>
                    </>
                  ) : (
                    <>
                      <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
                    </>
                  )}
                </svg>
              </button>
            </Panel>

            {/* Map Legend */}
            <Panel position="bottom-left" className="bg-white rounded-xl shadow-theme-lg border border-gray-200 p-3 w-40 m-6">
              <h3 className="text-[9px] font-bold text-gray-400 tracking-wider uppercase mb-2">Map Legend</h3>
              <div className="space-y-1.5 text-[10px] font-medium text-gray-700">
                <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-success-500" /> Stable Env</div>
                <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-brand-500" /> Staging Env</div>
                <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-warning-500" /> Critical System</div>
              </div>
            </Panel>

            {/* Selected Node Info Popup */}
            {selectedNode && (
              <Panel position="top-left" className="bg-white rounded-xl shadow-theme-xl border border-gray-200 p-3 w-64 m-6 animate-in slide-in-from-left-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="text-xs font-bold text-gray-900 leading-tight">{selectedNode.data.label}</h3>
                  </div>
                  <button onClick={() => setSelectedNode(null)} className="text-gray-400 hover:text-gray-600 -mr-1 -mt-1 p-1">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                  </button>
                </div>
                <div className="space-y-1.5 text-[10px]">
                  <div className="flex justify-between py-1 border-b border-gray-50">
                    <span className="text-gray-500">Code</span>
                    <span className="font-mono font-medium text-gray-900">{selectedNode.data.code}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-gray-50">
                    <span className="text-gray-500">Dept</span>
                    <span className="font-medium text-gray-900">{selectedNode.parentId?.replace("dept-", "") || "N/A"}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-gray-50">
                    <span className="text-gray-500">Status</span>
                    <span className={`font-medium px-1.5 rounded-full ${selectedNode.data.statusType === 'critical' ? 'bg-error-100 text-error-700' : 'bg-success-100 text-success-700'}`}>
                      {selectedNode.data.versionStr}
                    </span>
                  </div>
                </div>
              </Panel>
            )}
          </ReactFlow>
        </div>

        {/* Floating Side Panels */}
        {activeSidePanel === "risk" && !isFullscreen && (
          <div className="w-96 shrink-0 flex flex-col gap-4 min-h-0 overflow-y-auto animate-in slide-in-from-right-8 duration-300">
            <AnalyseRiskSection onHighlightEdge={() => {}} />
          </div>
        )}
        {activeSidePanel === "info" && !isFullscreen && (
          <div className="w-96 shrink-0 flex flex-col gap-4 min-h-0 overflow-y-auto animate-in slide-in-from-right-8 duration-300">
            <ArchitectureInfoPanel />
          </div>
        )}
      </div>
      
      <GenerateMappingPanel
        open={panelOpen}
        canEdit={canEdit}
        onClose={() => setPanelOpen(false)}
        onSaved={loadGroups}
      />
    </div>
  );
}
