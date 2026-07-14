"use client";

import { useEffect, useRef, useState } from "react";
import { Flag } from "lucide-react";
import { callAgent } from "@/lib/agent-client";
import { AISkeleton } from "@/components/ui/AISkeleton";
import { useHoverCapable } from "@/hooks/useHoverCapable";
import type { Release } from "@/lib/types";

interface RiskCacheEntry {
  text?: string;
  error?: string;
}

interface RiskHoverCellProps {
  release: Release;
  median: number;
  cache: Record<string, RiskCacheEntry>;
  onCacheUpdate: (releaseId: string, entry: RiskCacheEntry) => void;
}

export function RiskHoverCell({ release, median, cache, onCacheUpdate }: RiskHoverCellProps) {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const hoverCapable = useHoverCapable();
  const rootRef = useRef<HTMLDivElement>(null);

  const hasRisk = release.filesChanged > 400;
  const entry = cache[release.id];

  useEffect(() => {
    if (!visible || hoverCapable) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      setVisible(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [visible, hoverCapable]);

  if (!hasRisk) return null;

  const fetchIfNeeded = () => {
    if (entry) return;
    setLoading(true);
    callAgent({
      agentRole: "Risk Agent",
      context: { release, medianFilesChanged: median },
      mode: "line",
    }).then((res) => {
      onCacheUpdate(
        release.id,
        res.text ? { text: res.text } : { error: res.error ?? "AI unavailable" }
      );
      setLoading(false);
    });
  };

  return (
    <div
      ref={rootRef}
      className="relative inline-block"
      onMouseEnter={() => {
        if (!hoverCapable) return;
        setVisible(true);
        fetchIfNeeded();
      }}
      onMouseLeave={() => {
        if (hoverCapable) setVisible(false);
      }}
    >
      <button
        type="button"
        className="inline-flex rounded p-0.5 text-ai focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
        aria-label="Risk indicator — show AI note"
        aria-expanded={visible}
        onClick={() => {
          if (hoverCapable) return;
          setVisible((v) => {
            const next = !v;
            if (next) fetchIfNeeded();
            return next;
          });
        }}
      >
        <Flag className="h-4 w-4" />
      </button>
      {visible && (
        <div
          role="tooltip"
          className="absolute bottom-full left-1/2 z-50 mb-2 w-72 -translate-x-1/2 rounded-lg bg-slate-900 p-3 text-xs text-white shadow-lg"
        >
          {loading && !entry && <AISkeleton lines={1} className="[&_div]:!bg-slate-600 [&_div]:shimmer" />}
          {entry?.text && <p className="leading-relaxed">{entry.text}</p>}
          {entry?.error && !loading && <p className="text-red-300">{entry.error}</p>}
          <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
        </div>
      )}
    </div>
  );
}
