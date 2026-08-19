/**
 * Additive dual-ack columns + one-time status remap for the sheet rebuild.
 *
 * Do not use `prisma db push` — the vendored schema is behind the live DB.
 *
 * Remap (idempotent):
 *   Clear → Resolved (status + statusKey=resolved)
 *   empty / unknown → Identified (intake)
 *   Waived → Removed (documented if rows appear later; live count was 0)
 *   Resolved / At Risk / Blocked / Identified keep labels; backfill statusKey
 *   Every row gets a durable statusKey
 *
 * Usage:
 *   npx tsx scripts/rebuild-dependency-lifecycle-data.ts
 */
import "@/lib/load-db-env-for-tests";
import { prisma } from "@/lib/prisma";
import { remapDependencyRowStatus } from "@/lib/dependency-status-remap";
import { createDefaultDependencyLifecycleConfig } from "@/lib/dependency-lifecycle-config";

const ACK_COLUMNS = [
  `ALTER TABLE "ReleaseDependency" ADD COLUMN IF NOT EXISTS "sourceAcknowledgedAt" TIMESTAMP(3)`,
  `ALTER TABLE "ReleaseDependency" ADD COLUMN IF NOT EXISTS "sourceAcknowledgedByUserId" TEXT`,
  `ALTER TABLE "ReleaseDependency" ADD COLUMN IF NOT EXISTS "targetAcknowledgedAt" TIMESTAMP(3)`,
  `ALTER TABLE "ReleaseDependency" ADD COLUMN IF NOT EXISTS "targetAcknowledgedByUserId" TEXT`,
] as const;

function countByStatus(
  rows: Array<{ status: string | null }>
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    const key = String(row.status ?? "").trim() || "(empty)";
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

async function main(): Promise<void> {
  for (const sql of ACK_COLUMNS) {
    await prisma.$executeRawUnsafe(sql);
  }

  const config = createDefaultDependencyLifecycleConfig();
  const rows = await prisma.releaseDependency.findMany({
    select: { id: true, status: true, statusKey: true },
  });

  console.log("[rebuild-dependency-lifecycle-data] before", {
    total: rows.length,
    byStatus: countByStatus(rows),
    emptyStatusKey: rows.filter((r) => !String(r.statusKey ?? "").trim()).length,
  });

  let updated = 0;
  let waivedMapped = 0;
  let clearMapped = 0;
  let emptyMapped = 0;

  for (const row of rows) {
    const rawStatus = String(row.status ?? "").trim();
    const rawKey = String(row.statusKey ?? "").trim().toLocaleLowerCase();
    const next = remapDependencyRowStatus(row.status, row.statusKey, config);
    if (!next.changed) continue;
    if (rawStatus.toLocaleLowerCase() === "waived" || rawKey === "waived") {
      waivedMapped += 1;
    }
    if (rawStatus.toLocaleLowerCase() === "clear" || rawKey === "clear") {
      clearMapped += 1;
    }
    if (!rawStatus && !rawKey) {
      emptyMapped += 1;
    }
    await prisma.releaseDependency.update({
      where: { id: row.id },
      data: { status: next.status, statusKey: next.statusKey },
    });
    updated += 1;
  }

  const after = await prisma.releaseDependency.findMany({
    select: { status: true, statusKey: true },
  });
  console.log("[rebuild-dependency-lifecycle-data] after", {
    total: after.length,
    updated,
    unchanged: rows.length - updated,
    clearMapped,
    emptyMapped,
    waivedMapped,
    byStatus: countByStatus(after),
    emptyStatusKey: after.filter((r) => !String(r.statusKey ?? "").trim()).length,
  });
}

main()
  .catch((err) => {
    console.error("[rebuild-dependency-lifecycle-data] failed", {
      message: err instanceof Error ? err.message : "unknown",
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
