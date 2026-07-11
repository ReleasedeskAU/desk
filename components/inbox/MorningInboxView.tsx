"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ProgressLink } from "@/components/layout/NavigationProgress";
import { NeedsYourDecisionPanel } from "@/components/dashboard/needs-your-decision";
import { ReleaseFiltersBar } from "@/components/releases/ReleaseFiltersBar";
import { SourceBadgeInline } from "@/components/dashboard/UnifiedPortfolioPanel";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { filterLabel } from "@/lib/release-filters";
import {
  inboxSectionLabel,
  inboxSectionOrder,
  type InboxItem,
  type InboxSection,
} from "@/lib/inbox-shared";
import { useReleaseFilters } from "@/context/ReleaseFiltersContext";
import { loadJsonEffect } from "@/lib/safe-fetch";
import { formatDate, cn } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarClock,
  GitBranch,
  Package,
  RefreshCw,
  Sparkles,
  Ticket,
  User,
} from "lucide-react";

type Period = "month" | "quarter" | "year";

type InboxData = {
  counts: Record<InboxSection, number>;
  items: InboxItem[];
};

const SECTION_ICONS: Record<InboxSection, typeof AlertTriangle> = {
  attention: AlertTriangle,
  p1: Ticket,
  approaching: CalendarClock,
  mapping: GitBranch,
  approvals: Package,
  mine: User,
};

const SECTION_FILTERS: { id: InboxSection | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "attention", label: "Blocked & at risk" },
  { id: "p1", label: "P1 issues" },
  { id: "approaching", label: "Undecided soon" },
  { id: "mapping", label: "Mapping" },
  { id: "approvals", label: "Approvals" },
  { id: "mine", label: "My releases" },
];

const PERIOD_LABEL: Record<Period, string> = {
  month: "This month",
  quarter: "This quarter",
  year: "This year",
};

function InboxCard({ children, accent }: { children: React.ReactNode; accent?: string }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[24px] bg-white p-6 shadow-[0_18px_40px_-24px_rgba(112,144,176,0.18)]",
        "dark:bg-[var(--card)] dark:shadow-[0_18px_40px_-24px_rgba(0,0,0,0.45)]"
      )}
    >
      {accent && <div className={cn("absolute inset-x-0 top-0 h-[3px]", accent)} />}
      {children}
    </div>
  );
}

export function MorningInboxView() {
  const searchParams = useSearchParams();
  const [period, setPeriod] = useState<Period>("year");
  const [data, setData] = useState<InboxData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const initialSection = (searchParams.get("section") as InboxSection | "all") || "all";
  const [section, setSection] = useState<InboxSection | "all">(
    SECTION_FILTERS.some((s) => s.id === initialSection) ? initialSection : "all"
  );
  const { filterQuery, filters, departments, applications, environments, hasRefinement } =
    useReleaseFilters();

  const scopeLabel = useMemo(
    () => filterLabel(filters, departments, applications, environments),
    [filters, departments, applications, environments]
  );

  useEffect(() => {
    setLoading(true);
    return loadJsonEffect<{ counts: Record<string, number>; items: InboxItem[] }>(
      `/api/inbox?period=${period}${filterQuery}`,
      (payload) => setData({ counts: payload.counts, items: payload.items }),
      { label: "inbox", onFinally: () => setLoading(false) },
    );
  }, [period, filterQuery, refreshKey]);

  const filtered = useMemo(() => {
    if (!data) return [];
    if (section === "all") return data.items;
    return data.items.filter((i) => i.section === section);
  }, [data, section]);

  const grouped = useMemo(() => {
    const map = new Map<InboxSection, InboxItem[]>();
    filtered.forEach((item) => {
      const list = map.get(item.section) ?? [];
      list.push(item);
      map.set(item.section, list);
    });
    return Array.from(map.entries()).sort(
      (a, b) => inboxSectionOrder(a[0]) - inboxSectionOrder(b[0])
    );
  }, [filtered]);

  const totalCount = data?.items.length ?? 0;
  const attentionCount = data?.counts.attention ?? 0;
  const p1Count = data?.counts.p1 ?? 0;
  const approvalsCount = data?.counts.approvals ?? 0;

  return (
    <div
      className="-mx-4 -mt-6 min-h-screen px-4 pb-9 pt-6 md:-mx-6 md:px-6 md:pt-9 lg:-mx-8 lg:px-8 bg-[#F4F7FE] dark:bg-[var(--background)]"
      style={{ fontFamily: "'Plus Jakarta Sans','DM Sans',ui-sans-serif,system-ui,sans-serif" }}
    >
      <div className="mx-auto max-w-[1380px] space-y-7">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-[30px] font-bold tracking-tight text-[#1B2559] dark:text-white">Morning Inbox</h1>
            <p className="mt-1 text-[13px] text-slate-500 dark:text-white/55">
              {hasRefinement
                ? `Action queue for ${scopeLabel}`
                : "Your daily action queue — blockers, P1s, mapping conflicts, and approvals"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-2xl bg-white p-1.5 shadow-[0_18px_40px_-24px_rgba(112,144,176,0.25)] dark:bg-[var(--card)] dark:shadow-[0_18px_40px_-24px_rgba(0,0,0,0.4)]">
              {(["month", "quarter", "year"] as Period[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  className={cn(
                    "rounded-xl px-4 py-2 text-[13px] font-semibold capitalize transition-all",
                    period === p
                      ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md"
                      : "text-slate-500 hover:bg-slate-50 dark:text-white/55 dark:hover:bg-white/5"
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setRefreshKey((k) => k + 1)}
              className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-[0_18px_40px_-24px_rgba(112,144,176,0.25)] hover:text-slate-700 dark:bg-[var(--card)] dark:text-white/55 dark:hover:text-white/80 dark:shadow-[0_18px_40px_-24px_rgba(0,0,0,0.4)]"
              aria-label="Refresh inbox"
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </button>
          </div>
        </div>

        {/* Hero */}
        <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-r from-[#3E2CBB] via-[#5A3FE0] to-[#7C5CFF] p-7 text-white shadow-[0_30px_60px_-25px_rgba(90,63,224,0.55)]">
          <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
          <div className="relative flex flex-wrap items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.18em] text-white/60">
                <Sparkles size={13} /> {PERIOD_LABEL[period]}
              </div>
              <div className="mt-2 flex flex-wrap items-end gap-8">
                {[
                  { n: totalCount, l: "Total items", href: "/inbox" },
                  { n: attentionCount, l: "Blocked & at risk", href: "/inbox?section=attention" },
                  { n: p1Count, l: "Open P1s", href: "/inbox?section=p1" },
                  { n: approvalsCount, l: "Pending approvals", href: "/inbox?section=approvals" },
                ].map((x) => (
                  <ProgressLink key={x.l} href={x.href} className="group text-left focus:outline-none">
                    <div className="text-[44px] font-bold leading-none tabular-nums transition-transform duration-300 group-hover:scale-105">
                      {loading ? "—" : x.n}
                    </div>
                    <div className="mt-1 flex items-center gap-1 text-[13px] font-medium text-white/70 group-hover:text-white">
                      {x.l} <ArrowUpRight size={14} className="opacity-0 transition-opacity group-hover:opacity-100" />
                    </div>
                  </ProgressLink>
                ))}
              </div>
            </div>
            <div className="hidden h-24 w-px bg-white/15 md:block" />
            <div className="max-w-[320px] text-[13px] leading-relaxed text-white/80">
              {totalCount === 0 && !loading
                ? "Inbox clear for this scope — review the dashboard for portfolio trends."
                : `${totalCount} item${totalCount === 1 ? "" : "s"} in queue. Triage decisions first, then work through section filters below.`}
            </div>
          </div>
        </div>

        <ReleaseFiltersBar />

        <NeedsYourDecisionPanel period="all" />

        {/* Section filters */}
        <div className="flex flex-wrap gap-2">
          {SECTION_FILTERS.map((f) => {
            const count = f.id === "all" ? totalCount : data?.counts[f.id as InboxSection] ?? 0;
            const active = section === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setSection(f.id)}
                className={cn(
                  "rounded-full px-4 py-2 text-[12px] font-bold border transition-all duration-300",
                  active
                    ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white border-transparent shadow-md"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-[var(--border)] dark:bg-[var(--card)] dark:text-white/70 dark:hover:bg-white/5"
                )}
              >
                {f.label}
                {count > 0 && (
                  <span className="ml-1.5 rounded-full bg-black/10 px-1.5 py-0.5 text-[10px] font-bold">{count}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Queue */}
        {loading ? (
          <TableSkeleton columns={4} rows={6} showFilterBar={false} />
        ) : filtered.length === 0 ? (
          <InboxCard accent="bg-gradient-to-r from-emerald-400 to-teal-400">
            <div className="py-10 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-2xl dark:bg-emerald-500/15">
                ✨
              </div>
              <p className="text-lg font-bold text-emerald-900 dark:text-emerald-300">Inbox clear for this scope</p>
              <p className="mt-2 text-sm text-emerald-700/80 dark:text-emerald-400/80">
                No action items match your filters. Check the{" "}
                <ProgressLink href="/dashboard" className="font-semibold underline">
                  Dashboard
                </ProgressLink>{" "}
                for portfolio overview.
              </p>
            </div>
          </InboxCard>
        ) : section === "all" ? (
          <div className="space-y-5">
            {grouped.map(([sec, items]) => (
              <InboxSectionBlock key={sec} section={sec} items={items} />
            ))}
          </div>
        ) : (
          <InboxSectionBlock section={section as InboxSection} items={filtered} />
        )}
      </div>
    </div>
  );
}

function InboxSectionBlock({ section, items }: { section: InboxSection; items: InboxItem[] }) {
  const Icon = SECTION_ICONS[section];
  const accents: Record<InboxSection, string> = {
    attention: "bg-gradient-to-r from-rose-500 to-orange-400",
    p1: "bg-gradient-to-r from-amber-500 to-yellow-400",
    approaching: "bg-gradient-to-r from-violet-500 to-indigo-400",
    mapping: "bg-gradient-to-r from-sky-500 to-cyan-400",
    approvals: "bg-gradient-to-r from-emerald-500 to-teal-400",
    mine: "bg-gradient-to-r from-indigo-500 to-violet-400",
  };

  return (
    <InboxCard accent={accents[section]}>
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400">
          <Icon size={18} />
        </span>
        <div>
          <h2 className="text-[15px] font-bold text-[#1B2559] dark:text-white">{inboxSectionLabel(section)}</h2>
          <p className="text-[12px] text-slate-400 dark:text-white/50">
            {items.length} item{items.length === 1 ? "" : "s"} requiring attention
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={item.id}
            className="rounded-2xl border border-slate-100 bg-slate-50/60 px-4 py-3 transition-colors hover:bg-white dark:border-[var(--border)] dark:bg-white/5 dark:hover:bg-white/[0.08]"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <SourceBadgeInline source={item.source} />
                  <ProgressLink href={item.href} className="text-[13px] font-bold text-indigo-600 hover:underline dark:text-indigo-400">
                    {item.title}
                  </ProgressLink>
                </div>
                <p className="mt-1 text-[12px] text-slate-500 dark:text-white/55">{item.subtitle}</p>
                <p className="mt-1.5 text-[12px] leading-snug text-slate-600 dark:text-white/70">{item.reason}</p>
              </div>
              <div className="shrink-0 text-right text-[11px]">
                <p className="font-semibold text-slate-700 dark:text-white/80">{item.responsible}</p>
                <p className="mt-0.5 text-slate-400 dark:text-white/45">{item.date ? formatDate(item.date) : "—"}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </InboxCard>
  );
}
