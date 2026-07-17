/**
 * One-off, idempotent seed script for PlannedMaintenance.
 * Run manually: npx tsx prisma/seed-planned-maintenance.ts
 *
 * Source of truth: prisma/seed-data/planned-maintenance.json (20 records).
 * Every record has exactly one Application(s) value and one Environment(s)
 * value (confirmed, no multi-app/env spans) — a single applicationId/
 * environmentName pair per record is sufficient, no join table needed.
 *
 * applicationId is nullable in the schema (org/infra-wide maintenance with
 * no specific application) — if a name fails to resolve we keep the row
 * with applicationId=null rather than dropping it, and report it.
 *
 * Does NOT touch prisma/seed.ts or the db:seed/db:setup scripts.
 */
import fs from "fs";
import path from "path";
import { PrismaClient } from "@releasedesk/database";
import { APPLICATION_NAME_ALIASES } from "./seed-data/app-name-aliases";

const prisma = new PrismaClient();

type RawMaintenance = {
  "Maintenance ID": string;
  "Scheduled Date": string;
  "Start Time": string;
  "End Time": string;
  Type: string;
  "Application(s)": string | null;
  "Environment(s)": string;
  Department: string | null;
  Impact: string;
  Requestor: string | null;
  "Approval Status": string;
  Notes: string | null;
};

async function main() {
  const rawPath = path.join(__dirname, "seed-data", "planned-maintenance.json");
  const rows = JSON.parse(fs.readFileSync(rawPath, "utf8")) as RawMaintenance[];
  console.log(`Read ${rows.length} rows from planned-maintenance.json`);

  const apps = await prisma.application.findMany({ select: { id: true, name: true } });
  const appIdByName = new Map(apps.map((a) => [a.name, a.id]));

  let seeded = 0;
  const unresolved: string[] = [];

  for (const row of rows) {
    let applicationId: string | null = null;
    if (row["Application(s)"]) {
      const resolvedName = APPLICATION_NAME_ALIASES[row["Application(s)"]] ?? row["Application(s)"];
      applicationId = appIdByName.get(resolvedName) ?? null;
      if (!applicationId) {
        unresolved.push(row["Application(s)"]);
        console.warn(`  ${row["Maintenance ID"]} — no Application match for "${row["Application(s)"]}", keeping row with applicationId=null`);
      }
    }

    await prisma.plannedMaintenance.upsert({
      where: { maintenanceCode: row["Maintenance ID"] },
      update: {
        scheduledDate: new Date(row["Scheduled Date"]),
        startTime: row["Start Time"],
        endTime: row["End Time"],
        type: row.Type,
        applicationId,
        environmentName: row["Environment(s)"],
        departmentName: row.Department ?? null,
        impact: row.Impact,
        requestor: row.Requestor ?? null,
        approvalStatus: row["Approval Status"],
        notes: row.Notes ?? null,
      },
      create: {
        maintenanceCode: row["Maintenance ID"],
        scheduledDate: new Date(row["Scheduled Date"]),
        startTime: row["Start Time"],
        endTime: row["End Time"],
        type: row.Type,
        applicationId,
        environmentName: row["Environment(s)"],
        departmentName: row.Department ?? null,
        impact: row.Impact,
        requestor: row.Requestor ?? null,
        approvalStatus: row["Approval Status"],
        notes: row.Notes ?? null,
      },
    });
    seeded++;
  }

  console.log(`\nSeeded/updated ${seeded} PlannedMaintenance rows.`);
  if (unresolved.length > 0) {
    console.warn(`Unresolved application names (${unresolved.length}): ${JSON.stringify(unresolved)}`);
  } else {
    console.log("All application names resolved successfully.");
  }

  const total = await prisma.plannedMaintenance.count();
  console.log(`Total PlannedMaintenance rows in DB: ${total}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
