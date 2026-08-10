"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  summarizeAttention,
  type DetailAttentionItem,
  type DetailAttentionTone,
} from "@/lib/detail-decision";

const STRIP_SHELL: Record<DetailAttentionTone | "clear", string> = {
  critical: "bg-rose-50/80 text-rose-900 dark:bg-rose-500/10 dark:text-rose-100",
  warning: "bg-amber-50/80 text-amber-900 dark:bg-amber-500/10 dark:text-amber-100",
  clear: "bg-emerald-50/70 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-100",
};

const STRIP_ICON: Record<DetailAttentionTone | "clear", string> = {
  critical: "text-rose-500 dark:text-rose-300",
  warning: "text-amber-500 dark:text-amber-300",
  clear: "text-emerald-500 dark:text-emerald-300",
};

const CHIP_TONE: Record<DetailAttentionTone, string> = {
  critical: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200",
  warning: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200",
};

type DetailAttentionStripProps = {
  items: DetailAttentionItem[];
  /** Copy shown when nothing is firing. Keep it specific to the entity. */
  clearLabel?: string;
  className?: string;
};

/**
 * Red/amber-only summary of everything currently blocking this record.
 *
 * Renders a compact "clear" state rather than an empty panel, so a healthy
 * record still reads as a deliberate signal instead of missing content.
 *
 * @param props - Firing attention items and the clear-state copy.
 * @returns Attention strip for the DECIDE zone.
 */
export function DetailAttentionStrip({
  items,
  clearLabel,
  className,
}: DetailAttentionStripProps) {
  const summary = summarizeAttention(items, clearLabel);
  const Icon = summary.tone === "clear" ? CheckCircle2 : AlertTriangle;

  return (
    <div className={cn("rounded-xl px-3.5 py-2.5", STRIP_SHELL[summary.tone], className)}>
      <div className="flex items-start gap-2.5">
        <Icon size={17} className={cn("mt-0.5 shrink-0", STRIP_ICON[summary.tone])} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold leading-snug">{summary.headline}</p>

          {items.length > 1 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {items.map((item) => (
                <AttentionChip key={item.id} item={item} />
              ))}
            </div>
          ) : null}

          {items.length === 1 && items[0]?.detail ? (
            <p className="mt-1 text-[12px] leading-snug opacity-80">{items[0].detail}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function AttentionChip({ item }: { item: DetailAttentionItem }) {
  const chipClass = cn(
    "inline-flex max-w-full items-center truncate rounded-full px-2.5 py-1 text-[11px] font-bold",
    CHIP_TONE[item.tone]
  );

  if (!item.href) {
    return (
      <span className={chipClass} title={item.detail}>
        {item.label}
      </span>
    );
  }

  return (
    <a
      href={item.href}
      title={item.detail}
      className={cn(chipClass, "transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40")}
    >
      {item.label}
    </a>
  );
}
