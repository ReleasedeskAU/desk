import { auth } from "@clerk/nextjs/server";
import { Suspense } from "react";
import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton";
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
 * Dashboard route — shell streams immediately; payload loads behind Suspense.
 */
export default async function DashboardPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const period: DashboardPeriod = parseDashboardPeriod(params.period ?? "all");

  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardLoader period={period} />
    </Suspense>
  );
}

/**
 * Server-prefetched dashboard payload so the client is not stuck racing Clerk
 * session readiness under Turbopack.
 * @param period - Validated dashboard period from the URL.
 */
async function DashboardLoader({ period }: { period: DashboardPeriod }) {
  const { userId } = await auth();
  let initialData: DashboardPayload | null = null;
  let initialError: string | null = null;

  if (userId) {
    try {
      await ensureDbAwake();
      initialData = await withDbRetry(
        async () => {
          const riskConfig = await loadRiskEngineConfig(userId);
          return buildDashboardPayload(period, riskConfig, userId);
        },
        {
          label: "dashboard-page",
          attempts: 3,
          baseDelayMs: 400,
        }
      );
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
    <CommandDashboardContent
      initialPeriod={period}
      initialData={initialData}
      initialError={initialError}
    />
  );
}
