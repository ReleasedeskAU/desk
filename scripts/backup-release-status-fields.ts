/**
 * Pre-migration backup of Release.status + Release.approvalStatus for every row.
 * Writes a dated JSON snapshot under docs/backups/ (no secrets).
 *
 * Usage:
 *   npx tsx scripts/backup-release-status-fields.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@releasedesk/database";

const prisma = new PrismaClient();

/**
 * Dumps all Release status fields to a timestamped JSON backup.
 * Side effects: creates docs/backups/ and writes one file.
 * Throws: Prisma/DB errors; disconnects in finally.
 */
async function main() {
  const rows = await prisma.release.findMany({
    select: {
      id: true,
      releaseCode: true,
      name: true,
      status: true,
      approvalStatus: true,
      updatedAt: true,
    },
    orderBy: { releaseCode: "asc" },
  });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = resolve(process.cwd(), "docs", "backups");
  mkdirSync(dir, { recursive: true });
  const outPath = resolve(dir, `release-status-fields-${stamp}.json`);

  const payload = {
    takenAt: new Date().toISOString(),
    purpose:
      "Pre-migration backup before Release.status vocabulary + approvalStatus cleanup",
    rowCount: rows.length,
    statusDistribution: Object.fromEntries(
      [...rows.reduce((m, r) => m.set(r.status, (m.get(r.status) ?? 0) + 1), new Map())]
    ),
    approvalStatusDistribution: Object.fromEntries(
      [
        ...rows.reduce(
          (m, r) =>
            m.set(r.approvalStatus ?? "(null)", (m.get(r.approvalStatus ?? "(null)") ?? 0) + 1),
          new Map()
        ),
      ]
    ),
    rows,
  };

  writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Backup written: ${outPath}`);
  console.log(`Rows: ${rows.length}`);
  console.log("statusDistribution:", payload.statusDistribution);
  console.log("approvalStatusDistribution:", payload.approvalStatusDistribution);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
