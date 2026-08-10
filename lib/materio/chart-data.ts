import type { ReleaseLifecycleConfig } from "@/lib/release-lifecycle-config";
import { bucketReleaseStatusWithConfig } from "@/lib/release-lifecycle-status-ui";

/** Build Materio-style weekly bar chart points from release dates. */
export type WeeklyPoint = { label: string; releases: number; atRisk: number };

/**
 * Weekly release volume + attention bucket counts.
 * @param releases - Rows with date/status.
 * @param weeks - Number of weeks.
 * @param config - Optional lifecycle config for status bucketing.
 */
export function buildWeeklyOverview(
  releases: { releaseDate?: string | Date | null; date?: string; status?: string }[],
  weeks = 7,
  config?: ReleaseLifecycleConfig | null
): WeeklyPoint[] {
  const now = new Date();
  const buckets: WeeklyPoint[] = [];

  for (let i = weeks - 1; i >= 0; i--) {
    const start = new Date(now);
    start.setDate(start.getDate() - i * 7);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);

    const label = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    let count = 0;
    let atRisk = 0;

    releases.forEach((r) => {
      const raw = r.releaseDate ?? r.date;
      if (!raw) return;
      const d = new Date(raw);
      if (d >= start && d <= end) {
        count += 1;
        const bucket = bucketReleaseStatusWithConfig(r.status ?? "", config);
        if (bucket === "atRisk" || bucket === "blocked") atRisk += 1;
      }
    });

    buckets.push({ label, releases: count, atRisk });
  }

  return buckets;
}

export type GrowthPoint = { month: string; total: number; shipped: number };

export function buildGrowthSeries(
  releases: { releaseDate?: string | Date | null; date?: string; status?: string }[],
  months = 6,
  config?: ReleaseLifecycleConfig | null
): GrowthPoint[] {
  const now = new Date();
  const buckets: GrowthPoint[] = [];

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
    const label = d.toLocaleDateString("en-US", { month: "short" });

    let total = 0;
    let shipped = 0;
    releases.forEach((r) => {
      const raw = r.releaseDate ?? r.date;
      if (!raw) return;
      const rd = new Date(raw);
      if (rd >= d && rd <= end) {
        total += 1;
        if (bucketReleaseStatusWithConfig(r.status ?? "", config) === "shipped") {
          shipped += 1;
        }
      }
    });

    buckets.push({ month: label, total, shipped });
  }

  return buckets;
}

/** Mini sparkline for stat cards — last N weeks of release volume. */
export function buildSparkline(releases: { releaseDate?: string | Date | null; date?: string }[], points = 8): number[] {
  const weekly = buildWeeklyOverview(releases, points);
  return weekly.map((w) => w.releases);
}

export function pctChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

export type StackPoint = {
  label: string;
  planned: number;
  inProgress: number;
  shipped: number;
};

/** Materio Total Profit-style stacked bars by month. */
export function buildPortfolioStackSeries(
  releases: { releaseDate?: string | Date | null; date?: string; status?: string }[],
  months = 7,
  config?: ReleaseLifecycleConfig | null
): StackPoint[] {
  const now = new Date();
  const buckets: StackPoint[] = [];

  for (let i = months - 1; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59, 999);
    const label = start.toLocaleDateString("en-US", { month: "short", year: "2-digit" });

    let planned = 0;
    let inProgress = 0;
    let shipped = 0;

    releases.forEach((r) => {
      const raw = r.releaseDate ?? r.date;
      if (!raw) return;
      const rd = new Date(raw);
      if (rd < start || rd > end) return;
      const bucket = bucketReleaseStatusWithConfig(r.status ?? "", config);
      if (bucket === "shipped") shipped += 1;
      else if (bucket === "inProgress" || bucket === "blocked" || bucket === "atRisk")
        inProgress += 1;
      else planned += 1;
    });

    buckets.push({ label, planned, inProgress, shipped });
  }

  return buckets;
}

export type PortfolioSummary = {
  total: number;
  planned: number;
  inProgress: number;
  shipped: number;
  previousTotal: number;
};

export function buildPortfolioSummary(stack: StackPoint[]): PortfolioSummary {
  const last = stack[stack.length - 1] ?? { planned: 0, inProgress: 0, shipped: 0 };
  const prev = stack[stack.length - 2] ?? { planned: 0, inProgress: 0, shipped: 0 };
  const total = last.planned + last.inProgress + last.shipped;
  const previousTotal = prev.planned + prev.inProgress + prev.shipped;
  return {
    total,
    planned: last.planned,
    inProgress: last.inProgress,
    shipped: last.shipped,
    previousTotal,
  };
}
