"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import type { VisualMapNodeRole } from "@/lib/system-mapping-visual";
import { cn } from "@/lib/utils";

export type VisualMapNodeData = {
  label: string;
  sublabel?: string;
  role: VisualMapNodeRole;
  selected?: boolean;
  /** Plain-language tip shown on hover. */
  hint?: string;
};

const ROLE_STYLES: Record<VisualMapNodeRole, { bg: string; border: string; text: string; badge: string }> = {
  upstream: { bg: "#F0F9FF", border: "#0EA5E9", text: "#0369A1", badge: "Upstream" },
  selected: { bg: "#EEF2FF", border: "#465fff", text: "#3730A3", badge: "Selected" },
  downstream: { bg: "#ECFDF5", border: "#10B981", text: "#047857", badge: "Downstream" },
  system: { bg: "#F5F3FF", border: "#8B5CF6", text: "#6D28D9", badge: "System" },
};

const ROLE_HINT: Record<VisualMapNodeRole, string> = {
  upstream: "Feeds into the selected system. Click to focus this system instead.",
  selected: "Currently focused system. Its upstream and downstream neighbors are shown around it.",
  downstream: "Receives data/flow from the selected system. Click to focus this system instead.",
  system: "Application in the mapping group. Click to focus and see only its neighbors.",
};

/**
 * Knowledge-Graph-style system node for the Visual Map canvas.
 *
 * @param props - React Flow node props with VisualMapNodeData.
 * @returns Styled pill node with left/right handles and hover title.
 */
function VisualMapNodeComponent({ data }: NodeProps<VisualMapNodeData>) {
  const s = ROLE_STYLES[data.role];
  const title = data.hint || `${data.label} — ${ROLE_HINT[data.role]}`;

  return (
    <div className="relative group" title={title}>
      <div
        className={cn(
          "min-w-[140px] max-w-[200px] rounded-lg px-3 py-2 shadow-sm transition-shadow",
          data.selected && "ring-2 ring-brand-500 ring-offset-1",
          "cursor-pointer hover:shadow-md"
        )}
        style={{ background: s.bg, border: `2px solid ${s.border}` }}
      >
        <span
          className="mb-1 inline-block rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
          style={{ color: s.text, background: "rgba(255,255,255,0.7)" }}
        >
          {s.badge}
        </span>
        <p className="truncate text-xs font-semibold" style={{ color: s.text }}>
          {data.label}
        </p>
        {data.sublabel ? (
          <p className="mt-0.5 truncate text-[10px] text-gray-500">{data.sublabel}</p>
        ) : null}
      </div>

      {/* Rich hover card — self-explanatory without leaving the canvas */}
      <div
        className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 w-56 -translate-x-1/2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left opacity-0 shadow-lg transition-opacity group-hover:opacity-100 dark:border-[var(--border)] dark:bg-[var(--card)]"
        role="tooltip"
      >
        <p className="text-[12px] font-bold text-slate-800 dark:text-white">{data.label}</p>
        <p className="mt-0.5 text-[11px] leading-snug text-slate-500 dark:text-white/60">{title}</p>
        <p className="mt-1.5 text-[10px] font-semibold text-indigo-600 dark:text-indigo-300">
          Click to focus · see connections in the info panel
        </p>
      </div>

      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-0 !bg-gray-400" />
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-0 !bg-gray-400" />
    </div>
  );
}

export const VisualMapNode = memo(VisualMapNodeComponent);
