"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CircleHelp } from "lucide-react";
import { useHoverCapable } from "@/hooks/useHoverCapable";
import { cn } from "@/lib/utils";

type TipCoords = { top: number; left: number; placement: "top" | "bottom" };

type SharedTipProps = {
  text: string;
  open: boolean;
  tipId: string;
  tipRef: React.RefObject<HTMLDivElement | null>;
  coords: TipCoords | null;
};

/**
 * Solid opaque tooltip panel portaled to document.body.
 *
 * @param props - Tip text, open state, and position coords.
 * @returns Portal node or null.
 */
function TipPortal({ text, open, tipId, tipRef, coords }: SharedTipProps) {
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={tipRef}
      id={tipId}
      role="tooltip"
      className={cn(
        // Solid opaque panel — do not use --card (it is semi-transparent in light mode).
        "pointer-events-none fixed z-[200] w-max max-w-[min(300px,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-left text-xs leading-snug text-slate-700 shadow-[0_12px_28px_-8px_rgba(15,23,42,0.35)] dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:shadow-[0_12px_28px_-8px_rgba(0,0,0,0.65)]",
        coords?.placement === "bottom" ? "" : "-translate-y-full",
        !coords && "invisible"
      )}
      style={coords ? { top: coords.top, left: coords.left } : { top: 0, left: 0 }}
    >
      {text}
    </div>,
    document.body
  );
}

/**
 * Position + dismiss helpers shared by icon and wrap tip triggers.
 *
 * @param open - Whether the tip is visible.
 * @param placement - Preferred side.
 * @param text - Tip content (reposition when it changes).
 * @param rootRef - Trigger element.
 * @param tipRef - Tip panel element.
 * @param setCoords - Coord setter.
 * @param setOpen - Open-state setter.
 */
function useTipPositioning(
  open: boolean,
  placement: "top" | "bottom",
  text: string,
  rootRef: React.RefObject<HTMLElement | null>,
  tipRef: React.RefObject<HTMLDivElement | null>,
  setCoords: (c: TipCoords | null) => void,
  setOpen: (v: boolean) => void
) {
  useLayoutEffect(() => {
    if (!open || !rootRef.current) {
      setCoords(null);
      return;
    }

    const update = () => {
      const trigger = rootRef.current;
      const tip = tipRef.current;
      if (!trigger) return;

      const rect = trigger.getBoundingClientRect();
      const tipH = tip?.offsetHeight ?? 0;
      const tipW = tip?.offsetWidth ?? 0;
      const gap = 8;
      const pad = 8;

      let nextPlacement = placement;
      if (placement === "top" && rect.top < tipH + gap + pad) {
        nextPlacement = "bottom";
      } else if (placement === "bottom" && window.innerHeight - rect.bottom < tipH + gap + pad) {
        nextPlacement = "top";
      }

      let left = rect.left + rect.width / 2;
      const halfW = tipW / 2 || 140;
      left = Math.min(window.innerWidth - pad - halfW, Math.max(pad + halfW, left));

      const top = nextPlacement === "top" ? rect.top - gap : rect.bottom + gap;
      setCoords({ top, left, placement: nextPlacement });
    };

    update();
    const raf = requestAnimationFrame(update);
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, placement, text, rootRef, tipRef, setCoords]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || tipRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, rootRef, tipRef, setOpen]);
}

type InfoTooltipProps = {
  text: string;
  className?: string;
  /** Accessible name for the trigger button. */
  label?: string;
  /** Optional custom trigger; defaults to CircleHelp icon. */
  children?: ReactNode;
  /** Preferred placement of the tip relative to the trigger. */
  placement?: "top" | "bottom";
};

/**
 * Shared info tip: hover-to-show on fine pointers, tap-to-toggle on touch.
 * Escape / outside click dismisses the open tip.
 * Tip is portaled to document.body so overflow-hidden cards/tiles cannot clip it.
 *
 * @param props - Tip text, optional custom trigger, and placement.
 * @returns "?" icon button (or custom children) with portaled tip.
 */
export function InfoTooltip({
  text,
  className,
  label = "More information",
  children,
  placement = "top",
}: InfoTooltipProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<TipCoords | null>(null);
  const [mounted, setMounted] = useState(false);
  const hoverCapable = useHoverCapable();
  const rootRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const tipId = useId();

  useEffect(() => {
    setMounted(true);
  }, []);

  useTipPositioning(open, placement, text, rootRef, tipRef, setCoords, setOpen);

  return (
    <div
      ref={rootRef}
      className={cn("relative inline-flex shrink-0", className)}
      onMouseEnter={() => {
        if (hoverCapable) setOpen(true);
      }}
      onMouseLeave={() => {
        if (hoverCapable) setOpen(false);
      }}
    >
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? tipId : undefined}
        onClick={() => {
          if (!hoverCapable) setOpen((v) => !v);
        }}
        onFocus={() => {
          if (hoverCapable) setOpen(true);
        }}
        onBlur={(e) => {
          if (!hoverCapable) return;
          if (!rootRef.current?.contains(e.relatedTarget as Node)) {
            setOpen(false);
          }
        }}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 dark:text-white/40 dark:hover:bg-white/10 dark:hover:text-white/70"
      >
        {children ?? <CircleHelp size={14} strokeWidth={2} />}
      </button>
      {mounted ? (
        <TipPortal text={text} open={open} tipId={tipId} tipRef={tipRef} coords={coords} />
      ) : null}
    </div>
  );
}

type HoverExplainProps = {
  /** Plain-English explanation shown on hover / tap. */
  text: string;
  /** Accessible name for the wrapped control. */
  label?: string;
  children: ReactNode;
  className?: string;
  placement?: "top" | "bottom";
};

/**
 * Wrap any UI (metric chip, field label, hero KPI) so hover/tap explains what it means.
 * Use this for self-explanatory surfaces — users should not have to guess.
 *
 * @param props - Explanation text and the content to wrap.
 * @returns Wrapper that shows a solid tip on hover (desktop) or tap (touch).
 * @sideEffects Portals a tip to document.body while open.
 */
export function HoverExplain({
  text,
  label = "More information",
  children,
  className,
  placement = "top",
}: HoverExplainProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<TipCoords | null>(null);
  const [mounted, setMounted] = useState(false);
  const hoverCapable = useHoverCapable();
  const rootRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const tipId = useId();

  useEffect(() => {
    setMounted(true);
  }, []);

  useTipPositioning(open, placement, text, rootRef, tipRef, setCoords, setOpen);

  return (
    <span
      ref={rootRef}
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-expanded={open}
      aria-describedby={open ? tipId : undefined}
      title={hoverCapable ? undefined : text}
      className={cn(
        "relative inline-flex min-w-0 max-w-full cursor-help rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40",
        className
      )}
      onMouseEnter={() => {
        if (hoverCapable) setOpen(true);
      }}
      onMouseLeave={() => {
        if (hoverCapable) setOpen(false);
      }}
      onClick={(e) => {
        // Safe inside dashboard tile <a> — span (not <button>) so markup stays valid.
        e.preventDefault();
        e.stopPropagation();
        if (!hoverCapable) setOpen((v) => !v);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }
      }}
      onFocus={() => {
        if (hoverCapable) setOpen(true);
      }}
      onBlur={(e) => {
        if (!hoverCapable) return;
        if (!rootRef.current?.contains(e.relatedTarget as Node)) {
          setOpen(false);
        }
      }}
    >
      {children}
      {mounted ? (
        <TipPortal text={text} open={open} tipId={tipId} tipRef={tipRef} coords={coords} />
      ) : null}
    </span>
  );
}
