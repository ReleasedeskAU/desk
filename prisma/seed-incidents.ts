/**
 * One-off, idempotent seed script for Incident.
 * Run manually: npx tsx prisma/seed-incidents.ts
 *
 * Source of truth: prisma/seed-data/incidents.json (18 records).
 * Does NOT touch prisma/seed.ts or the db:seed/db:setup scripts.
 *
 * Incident vs P1Issue: P1Issue is exclusively populated by connector sync
 * (Jira/ServiceNow, see lib/connectors/types.ts) and only ever carries
 * priority "P1" — it powers a small dashboard widget (DashboardP1Panel).
 * This Incident model is a separate, richer, seeded incident register
 * (P1/P2/P3, department, impact, assignedTo, relatedReleaseCode) that is
 * NOT connector-sourced. They are deliberately kept as two distinct models.
 */
import fs from "fs";
import path from "path";
import { PrismaClient } from "@releasedesk/database";
import { APPLICATION_NAME_ALIASES } from "./seed-data/app-name-aliases";

const prisma = new PrismaClient();

/** Seed Status display → canonical statusKey (Wave 4). */
const INCIDENT_SEED_STATUS_KEY: Readonly<Record<string, string>> = {
  Active: "open",
  Open: "open",
  Acknowledged: "acknowledged",
  Investigating: "investigating",
  Escalated: "escalated",
  Resolving: "resolving",
  Resolved: "resolved",
  Closed: "closed",
  Reopened: "reopened",
};

type RawIncident = {
  "Incident ID": string;
  Timestamp: string;
  Application: string;
  Department: string | null;
  Severity: string;
  Title: string;
  Status: string;
  Impact: string;
  "Assigned To": string | null;
  "Related Release": string | null;
  Environment: string;
};

async function main() {
  const rawPath = path.join(__dirname, "seed-data", "incidents.json");
  const rows = JSON.parse(fs.readFileSync(rawPath, "utf8")) as RawIncident[];
  console.log(`Read ${rows.length} rows from incidents.json`);

  const apps = await prisma.application.findMany({ select: { id: true, name: true } });
  const appIdByName = new Map(apps.map((a) => [a.name, a.id]));

  let seeded = 0;
  const unresolved: string[] = [];

  for (const row of rows) {
    const resolvedName = APPLICATION_NAME_ALIASES[row.Application] ?? row.Application;
    const applicationId = appIdByName.get(resolvedName);
    if (!applicationId) {
      unresolved.push(row.Application);
      console.warn(`  Skipping ${row["Incident ID"]} — no Application match for "${row.Application}"`);
      continue;
    }

    await prisma.incident.upsert({
      where: { incidentCode: row["Incident ID"] },
      update: {
        timestamp: new Date(row.Timestamp),
        applicationId,
        departmentName: row.Department ?? null,
        severity: row.Severity,
        title: row.Title,
        status: row.Status,
        statusKey: INCIDENT_SEED_STATUS_KEY[row.Status] ?? null,
        impact: row.Impact,
        assignedTo: row["Assigned To"] ?? null,
        relatedReleaseCode: row["Related Release"] ?? null,
        environmentName: row.Environment,
      },
      create: {
        incidentCode: row["Incident ID"],
        timestamp: new Date(row.Timestamp),
        applicationId,
        departmentName: row.Department ?? null,
        severity: row.Severity,
        title: row.Title,
        status: row.Status,
        statusKey: INCIDENT_SEED_STATUS_KEY[row.Status] ?? null,
        impact: row.Impact,
        assignedTo: row["Assigned To"] ?? null,
        relatedReleaseCode: row["Related Release"] ?? null,
        environmentName: row.Environment,
      },
    });
    seeded++;
  }

  console.log(`\nSeeded/updated ${seeded} Incident rows.`);
  if (unresolved.length > 0) {
    console.warn(`Unresolved application names (${unresolved.length}): ${JSON.stringify(unresolved)}`);
  } else {
    console.log("All application names resolved successfully.");
  }

  const total = await prisma.incident.count();
  console.log(`Total Incident rows in DB: ${total}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
