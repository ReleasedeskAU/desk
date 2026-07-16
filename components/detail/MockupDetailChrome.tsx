"use client";

import type { ReactNode } from "react";
import { TopBar } from "@/components/layout/TopBar";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { DetailField, DetailFieldGrid } from "@/components/detail/DetailPageShell";
import { taBtnSecondary, taInput } from "@/lib/styles";
import { formatDateTime, cn } from "@/lib/utils";
import { useNavHistoryLabel } from "@/context/NavigationHistoryContext";
import { usePathname } from "next/navigation";
import {
  Activity,
  Calendar,
  CheckCircle2,
  FileText,
  GitCompareArrows,
  Link2,
  ListChecks,
  Package,
  Server,
  ShieldAlert,
  User,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";

export { DetailField, DetailFieldGrid };

type SectionVisual = {
  icon: LucideIcon;
  tone: "indigo" | "rose" | "emerald" | "sky" | "violet" | "amber";
};

const SECTION_TONE = {
  indigo: "bg-indigo-50 text-indigo-500 dark:bg-indigo-500/15 dark:text-indigo-300",
  rose: "bg-rose-50 text-rose-500 dark:bg-rose-500/15 dark:text-rose-300",
  emerald: "bg-emerald-50 text-emerald-500 dark:bg-emerald-500/15 dark:text-emerald-300",
  sky: "bg-sky-50 text-sky-500 dark:bg-sky-500/15 dark:text-sky-300",
  violet: "bg-violet-50 text-violet-500 dark:bg-violet-500/15 dark:text-violet-300",
  amber: "bg-amber-50 text-amber-500 dark:bg-amber-500/15 dark:text-amber-300",
} as const;

function cleanLabel(label: string): string {
  return label
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .replace(/\s+PAGE$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function sectionVisual(title: string): SectionVisual {
  const normalized = title.toLowerCase();
  if (/risk|impact|conflict|blocker|alert|incident/.test(normalized)) return { icon: ShieldAlert, tone: "rose" };
  if (/date|timeline|window|calendar/.test(normalized)) return { icon: Calendar, tone: "violet" };
  if (/environment|system|version/.test(normalized)) return { icon: Server, tone: "sky" };
  if (/approval|sign-off|status/.test(normalized)) return { icon: CheckCircle2, tone: "emerald" };
  if (/owner|approver|stakeholder|contact/.test(normalized)) return { icon: User, tone: "indigo" };
  if (/note|comment|communication/.test(normalized)) return { icon: FileText, tone: "amber" };
  if (/remediation|resolution|action/.test(normalized)) return { icon: Wrench, tone: "emerald" };
  if (/dependency|integration|linked|source|dependent/.test(normalized)) return { icon: Link2, tone: "indigo" };
  if (/drift|history|compare/.test(normalized)) return { icon: GitCompareArrows, tone: "sky" };
  return { icon: Package, tone: "indigo" };
}

/** Modern tone-mapped section card used by legacy data-detail routes. */
export function MockupSection({
  title,
  children,
  action,
  id,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  id?: string;
}) {
  const visual = sectionVisual(title);
  const Icon = visual.icon;
  const label = cleanLabel(title);

  return (
    <section
      id={id}
      className="rounded-[22px] bg-white p-6 shadow-[0_16px_36px_-24px_rgba(112,144,176,0.25)] transition-shadow duration-300 hover:shadow-[0_20px_44px_-20px_rgba(112,144,176,0.35)] dark:bg-[var(--card)] dark:shadow-[0_16px_36px_-24px_rgba(0,0,0,0.55)]"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", SECTION_TONE[visual.tone])}>
            <Icon size={16} aria-hidden />
          </span>
          <div className="min-w-0">
            <h3 className="text-[14px] font-bold text-slate-800 dark:text-white">{label}</h3>
            <p className="mt-0.5 text-[11.5px] text-slate-400 dark:text-white/50">
              {sectionDescription(title)}
            </p>
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function sectionDescription(title: string): string {
  const normalized = title.toLowerCase();
  if (/status|glance/.test(normalized)) return "Current operational state and the signals that need attention first.";
  if (/release/.test(normalized)) return "Linked release context, ownership, and delivery scope.";
  if (/date|timeline|window/.test(normalized)) return "Key timing, milestones, and scheduling context.";
  if (/environment|system|version/.test(normalized)) return "Technical scope and the environment state behind this record.";
  if (/approval|sign-off/.test(normalized)) return "Decision gates, approvers, and completion state.";
  if (/risk|impact|conflict|blocker/.test(normalized)) return "Business and delivery impact requiring review or mitigation.";
  if (/note|comment/.test(normalized)) return "Supporting context and operational notes.";
  if (/remediation|resolution/.test(normalized)) return "Actions required to restore or complete the expected state.";
  if (/dependency|integration|linked|source|dependent/.test(normalized)) return "Connected systems and records that influence this item.";
  return "Core record information and related operational context.";
}

export type MockupSelectOption = { value: string; label: string };

export type MockupQuickAction = {
  href: string;
  label: string;
  icon?: ReactNode;
};

type MockupDetailChromeProps = {
  /** e.g. "⚠️ CONFLICT DETAIL PAGE" */
  pageTitle: string;
  /** History trail label */
  entityCode: string;
  selectLabel: string;
  selectValue: string;
  selectOptions: MockupSelectOption[];
  onSelectChange: (value: string) => void;
  lastRefresh: Date;
  footer: string;
  quickActions: MockupQuickAction[];
  headerActions?: ReactNode;
  children: ReactNode;
};

/**
 * Shared chrome for Excel red-tab detail pages:
 * title → Select + Last Refresh → sections → Quick Actions → footer.
 */
export function MockupDetailChrome({
  pageTitle,
  entityCode,
  selectLabel,
  selectValue,
  selectOptions,
  onSelectChange,
  lastRefresh,
  footer,
  quickActions,
  headerActions,
  children,
}: MockupDetailChromeProps) {
  useNavHistoryLabel(entityCode);
  const pathname = usePathname();
  const visibleActions = quickActions.filter((action) => action.href !== pathname);
  const cleanTitle = cleanLabel(pageTitle);

  return (
    <div className="space-y-5">
      <TopBar title={cleanTitle} highlight />

      <div className="flex flex-wrap items-end justify-between gap-4 rounded-[22px] bg-white px-5 py-4 shadow-[0_16px_36px_-24px_rgba(112,144,176,0.25)] dark:bg-[var(--card)] dark:shadow-[0_16px_36px_-24px_rgba(0,0,0,0.55)]">
        <label className="min-w-0 w-full text-sm text-gray-700 dark:text-white/80 sm:w-auto">
          <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/45">
            {selectLabel}
          </span>
          <select
            className={cn(taInput, "w-full min-w-0 max-w-full rounded-xl font-mono text-sm sm:w-auto sm:min-w-[220px]")}
            value={selectValue}
            onChange={(e) => onSelectChange(e.target.value)}
          >
            {selectOptions.length === 0 ? (
              <option value={selectValue}>{selectValue}</option>
            ) : (
              selectOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))
            )}
          </select>
        </label>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <span className="rounded-full bg-slate-100 px-2.5 py-1 font-mono text-[11px] font-bold text-slate-500 dark:bg-white/10 dark:text-white/60">
            {entityCode}
          </span>
          <p className="text-xs text-gray-500 dark:text-white/55">
            Last Refresh:{" "}
            <span className="font-medium text-gray-700 dark:text-white/80">
              {formatDateTime(lastRefresh.toISOString())}
            </span>
          </p>
          {headerActions}
        </div>
      </div>

      {children}

      {visibleActions.length > 0 && (
        <MockupSection title="Quick Actions">
          <div className="flex flex-wrap gap-2">
            {visibleActions.map((action) => (
              <ProgressLink key={action.label} href={action.href} className={taBtnSecondary + " text-sm !py-2"}>
                {action.icon}
                {cleanLabel(action.label)}
              </ProgressLink>
            ))}
          </div>
        </MockupSection>
      )}

      <p className="pb-2 text-center text-[11px] text-slate-400 dark:text-white/40">
        {footer.replace(/v1\.0/gi, "v2.0").replace(/\|/g, " · ")}
      </p>
    </div>
  );
}

/** Compact status strip for "AT A GLANCE" rows. */
export function GlanceStrip({
  items,
}: {
  items: { label: string; value: ReactNode; tone?: "neutral" | "good" | "warn" | "bad" }[];
}) {
  const toneClass = {
    neutral: "bg-slate-50 text-slate-800 dark:bg-white/5 dark:text-white",
    good: "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200",
    warn: "bg-amber-50 text-amber-900 dark:bg-amber-500/10 dark:text-amber-200",
    bad: "bg-rose-50 text-rose-800 dark:bg-rose-500/10 dark:text-rose-200",
  } as const;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item, index) => (
        <div
          key={item.label}
          className={cn(
            "min-h-[94px] rounded-[18px] px-4 py-3.5 transition-transform duration-200 hover:-translate-y-0.5",
            index === 0
              ? "text-white shadow-lg"
              : cn(
                  "border border-slate-100 shadow-[0_12px_28px_-24px_rgba(112,144,176,0.35)] dark:border-[var(--border)]",
                  toneClass[item.tone ?? "neutral"]
                )
          )}
          style={
            index === 0
              ? {
                  backgroundImage: "var(--theme-hero-gradient)",
                  boxShadow: "var(--theme-hero-shadow)",
                }
              : undefined
          }
        >
          <div className="flex items-center gap-1.5">
            {index === 0 ? <Activity size={12} aria-hidden /> : index === 1 ? <Zap size={12} aria-hidden /> : <ListChecks size={12} aria-hidden />}
            <p className={cn("text-[10px] font-bold uppercase tracking-wide", index === 0 ? "text-white/80" : "text-slate-400 dark:text-white/45")}>
            {item.label}
            </p>
          </div>
          <div className={cn("mt-2 font-bold leading-tight", index === 0 ? "text-[21px]" : "text-[17px]")}>
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}

export function dash(v: ReactNode) {
  if (v === null || v === undefined || v === "") return "—";
  return v;
}
