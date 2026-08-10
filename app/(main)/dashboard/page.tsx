import { auth } from "@clerk/nextjs/server";
import { Suspense } from "react";
import { TablePageSuspenseFallback } from "@/components/ui/TableSkeleton";
import { buildDashboardPayload, type DashboardPayload } from "@/lib/dashboard-payload";
import { ensureDbAwake, isRetryableDbError, withDbRetry } from "@/lib/prisma";
import { parseDashboardPeriod, type DashboardPeriod } from "@/lib/dashboard-period";
import { loadRiskEngineConfig } from "@/lib/risk-engine-config-db";
import CommandDashboardContent from "./CommandDashboardContent";

type PageProps = {
  // Next.js 16+ passes searchParams as a Promise (required by generated PageProps).
  searchParams?: Promise<{ period?: string }>;
};

/**
 * Dashboard page — prefers server-side payload so the UI is not stuck on a
 * client fetch that races Clerk session readiness under Turbopack.
 */
export default async function DashboardPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  // Default to all-time portfolio view when the URL has no period query.
  const period: DashboardPeriod = parseDashboardPeriod(params.period ?? "all");

  const { userId } = await auth();
  let initialData: DashboardPayload | null = null;
  let initialError: string | null = null;

  if (userId) {
    try {
      await ensureDbAwake();
      initialData = await withDbRetry(async () => {
        const riskConfig = await loadRiskEngineConfig(userId);
        return buildDashboardPayload(period, riskConfig, userId);
      }, {
        label: "dashboard-page",
        attempts: 5,
        baseDelayMs: 800,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[dashboard/page]", message);
      const transient = isRetryableDbError(err);
      initialError =
        process.env.NODE_ENV === "production"
          ? transient
            ? "Database temporarily unavailable"
            : "Failed to load dashboard"
          : `Failed to load dashboard: ${message}`;
    }
  } else {
    initialError = "Sign in required";
  }

  return (
    <Suspense fallback={<TablePageSuspenseFallback />}>
      <CommandDashboardContent
        initialPeriod={period}
        initialData={initialData}
        initialError={initialError}
      />
    </Suspense>
  );
}
