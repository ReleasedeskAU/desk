/**
 * One-off, idempotent seed script for MonitoringAlert.
 * Run manually: npx tsx prisma/seed-monitoring-alerts.ts
 *
 * Source of truth: prisma/seed-data/monitoring-alerts.json (40 records).
 * Does NOT touch prisma/seed.ts or the db:seed/db:setup scripts.
 */
import fs from "fs";
import path from "path";
import { PrismaClient } from "@releasedesk/database";
import { APPLICATION_NAME_ALIASES } from "./seed-data/app-name-aliases";

const prisma = new PrismaClient();

type RawAlert = {
  "Alert ID": string;
  Timestamp: string;
  Application: string;
  Department: string | null;
  "Alert Type": string;
  Severity: string;
  Metric: string;
  Threshold: number | string | null;
  "Current Value": number | string | null;
  Status: string;
  "Assigned To": string | null;
  Environment: string;
};

async function main() {
  const rawPath = path.join(__dirname, "seed-data", "monitoring-alerts.json");
  const rows = JSON.parse(fs.readFileSync(rawPath, "utf8")) as RawAlert[];
  console.log(`Read ${rows.length} rows from monitoring-alerts.json`);

  const apps = await prisma.application.findMany({ select: { id: true, name: true } });
  const appIdByName = new Map(apps.map((a) => [a.name, a.id]));

  let seeded = 0;
  const unresolved: string[] = [];

  for (const row of rows) {
    const resolvedName = APPLICATION_NAME_ALIASES[row.Application] ?? row.Application;
    const applicationId = appIdByName.get(resolvedName);
    if (!applicationId) {
      unresolved.push(row.Application);
      console.warn(`  Skipping ${row["Alert ID"]} — no Application match for "${row.Application}"`);
      continue;
    }

    await prisma.monitoringAlert.upsert({
      where: { alertCode: row["Alert ID"] },
      update: {
        timestamp: new Date(row.Timestamp),
        applicationId,
        departmentName: row.Department ?? null,
        alertType: row["Alert Type"],
        severity: row.Severity,
        metric: row.Metric,
        threshold: row.Threshold != null ? String(row.Threshold) : null,
        currentValue: row["Current Value"] != null ? String(row["Current Value"]) : null,
        status: row.Status,
        assignedTo: row["Assigned To"] ?? null,
        environmentName: row.Environment,
      },
      create: {
        alertCode: row["Alert ID"],
        timestamp: new Date(row.Timestamp),
        applicationId,
        departmentName: row.Department ?? null,
        alertType: row["Alert Type"],
        severity: row.Severity,
        metric: row.Metric,
        threshold: row.Threshold != null ? String(row.Threshold) : null,
        currentValue: row["Current Value"] != null ? String(row["Current Value"]) : null,
        status: row.Status,
        assignedTo: row["Assigned To"] ?? null,
        environmentName: row.Environment,
      },
    });
    seeded++;
  }

  console.log(`\nSeeded/updated ${seeded} MonitoringAlert rows.`);
  if (unresolved.length > 0) {
    console.warn(`Unresolved application names (${unresolved.length}): ${JSON.stringify(unresolved)}`);
  } else {
    console.log("All application names resolved successfully.");
  }

  const total = await prisma.monitoringAlert.count();
  console.log(`Total MonitoringAlert rows in DB: ${total}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
