/**
 * Compile-time guards so Vercel typecheck cannot regress on dashboard payload shape.
 * Run via: npx tsc --noEmit -p .
 */
import type { DashboardPayload } from "../lib/dashboard-payload";
import type { ChartDatum } from "../components/dashboard/DashboardVisualSections";

type Expect<T extends true> = T;
type Extends<A, B> = A extends B ? true : false;

/** freeze chart rows must be usable as ChartDatum (color optional). */
type _FreezeOk = Expect<
  Extends<DashboardPayload["changeFreeze"]["types"][number], ChartDatum>
>;

/** pipeline / maintenance chart rows must be ChartDatum-compatible. */
type _PipelineOk = Expect<
  Extends<DashboardPayload["pipelineDetail"]["byStatus"][number], ChartDatum>
>;
type _MaintenanceOk = Expect<
  Extends<DashboardPayload["maintenanceChart"][number], ChartDatum>
>;

/** Client prop contract used by CommandDashboardContent. */
type ClientInitialData = DashboardPayload | null;
type _InitialDataOk = Expect<Extends<DashboardPayload, NonNullable<ClientInitialData>>>;

export {};
