/**
 * One-off, idempotent seed script for ApplicationStatus.
 * Run manually: npx tsx prisma/seed-application-status.ts
 *
 * Source of truth: prisma/seed-data/application-status.json.
 *
 * IMPORTANT DATA-QUALITY FINDING: the raw JSON array has 85 entries, but
 * only 36 are real status rows. The other 49 are a collapsible
 * "documentation/guide" section from the original worksheet that got
 * flattened into the same array during extraction — every one of those rows
 * has Status=null and Environment=null and its "Application" field holds a
 * sentence of help text (e.g. "📖 QUICK REFERENCE: Application Health...").
 * Seeding those verbatim would violate NOT NULL constraints on status/
 * environmentName and would never resolve to a real Application. They are
 * filtered out here rather than silently seeded as garbage rows — see the
 * console warning below for the exact count filtered.
 *
 * This is a CURRENT STATE table (one row per applicationId+environmentName,
 * upserted/overwritten), not an append-only history log.
 *
 * Does NOT touch prisma/seed.ts or the db:seed/db:setup scripts.
 */
import fs from "fs";
import path from "path";
import { PrismaClient } from "@releasedesk/database";
import { APPLICATION_NAME_ALIASES } from "./seed-data/app-name-aliases";

const prisma = new PrismaClient();

type RawStatus = {
  Application: string | null;
  Department: string | null;
  Environment: string | null;
  Status: string | null;
  "Last Check": string | null;
  "Uptime %": number | null;
  Notes: string | null;
};

async function main() {
  const rawPath = path.join(__dirname, "seed-data", "application-status.json");
  const allRows = JSON.parse(fs.readFileSync(rawPath, "utf8")) as RawStatus[];
  console.log(`Read ${allRows.length} raw entries from application-status.json`);

  const rows = allRows.filter((r) => r.Status !== null && r.Environment !== null && r.Application);
  const filteredOut = allRows.length - rows.length;
  console.log(`Filtered out ${filteredOut} non-data documentation rows (null Status/Environment).`);
  console.log(`Real ApplicationStatus data rows: ${rows.length}`);

  const apps = await prisma.application.findMany({ select: { id: true, name: true } });
  const appIdByName = new Map(apps.map((a) => [a.name, a.id]));

  let seeded = 0;
  const unresolved: string[] = [];

  for (const row of rows) {
    const resolvedName = APPLICATION_NAME_ALIASES[row.Application!] ?? row.Application!;
    const applicationId = appIdByName.get(resolvedName);
    if (!applicationId) {
      unresolved.push(row.Application!);
      console.warn(`  Skipping status row — no Application match for "${row.Application}" (env ${row.Environment})`);
      continue;
    }

    await prisma.applicationStatus.upsert({
      where: { applicationId_environmentName: { applicationId, environmentName: row.Environment! } },
      update: {
        status: row.Status!,
        lastCheck: new Date(row["Last Check"]!),
        uptimePercent: row["Uptime %"] ?? null,
        notes: row.Notes ?? null,
      },
      create: {
        applicationId,
        environmentName: row.Environment!,
        status: row.Status!,
        lastCheck: new Date(row["Last Check"]!),
        uptimePercent: row["Uptime %"] ?? null,
        notes: row.Notes ?? null,
      },
    });
    seeded++;
  }

  console.log(`\nSeeded/updated ${seeded} ApplicationStatus rows.`);
  if (unresolved.length > 0) {
    console.warn(`Unresolved application names (${unresolved.length}): ${JSON.stringify([...new Set(unresolved)])}`);
  } else {
    console.log("All application names resolved successfully.");
  }

  const total = await prisma.applicationStatus.count();
  console.log(`Total ApplicationStatus rows in DB: ${total}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
