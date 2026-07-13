/**
 * Fast, idempotent finalizer for the V0.6 operational workbook snapshot.
 * Existing imported values were already reconciled by sync-db-from-seed;
 * this removes extra bookings, persists missing sheets, and records source order.
 */
import fs from "fs";
import path from "path";
import { prisma } from "../lib/prisma";
import { seedSystemMapping } from "../lib/seed-system-mapping";
import { APPLICATION_NAME_ALIASES } from "../prisma/seed-data/app-name-aliases";

type Row = Record<string, string>;
const dataDir = path.join(process.cwd(), "prisma", "seed-data");
const rows = (file: string): Row[] =>
  JSON.parse(fs.readFileSync(path.join(dataDir, file), "utf8"));
const toDate = (value: string) => (value ? new Date(value) : null);
const toInt = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
};
const isConflict = (value: string) => value.includes("CONFLICT");

async function inBatches<T>(items: T[], fn: (item: T, index: number) => Promise<unknown>) {
  const batchSize = 12;
  for (let start = 0; start < items.length; start += batchSize) {
    const batch = items.slice(start, start + batchSize);
    await Promise.all(batch.map((item, offset) => fn(item, start + offset)));
  }
}

async function main() {
  const organizationRows = await prisma.$queryRawUnsafe<{ organizationId: string }[]>(
    `SELECT "organizationId" FROM "User" WHERE "organizationId" IS NOT NULL LIMIT 1`
  );
  const organizationId = organizationRows[0]?.organizationId;
  if (!organizationId) throw new Error("No organizationId found");

  const applications = await prisma.application.findMany({
    include: { environments: true },
  });
  const appIdByName = new Map(applications.map((app) => [app.name, app.id]));
  const envIdByAppEnv = new Map<string, string>();
  for (const app of applications) {
    for (const environment of app.environments) {
      envIdByAppEnv.set(`${app.id}::${environment.name.toLowerCase()}`, environment.id);
      envIdByAppEnv.set(`${app.id}::${environment.type.toLowerCase()}`, environment.id);
    }
  }
  const resolveAppId = (name: string) => {
    const exact = appIdByName.get(name);
    if (exact) return exact;
    const alias = APPLICATION_NAME_ALIASES[name];
    if (alias) return appIdByName.get(alias);
    for (const [candidate, id] of appIdByName) {
      if (candidate.startsWith(name) || name.startsWith(candidate)) return id;
    }
    return undefined;
  };

  const releases = await prisma.release.findMany({
    select: { id: true, releaseCode: true },
  });
  const releaseIdByCode = new Map(releases.map((release) => [release.releaseCode, release.id]));

  const releaseRows = rows("releases.json");
  await inBatches(releaseRows, (row, index) =>
    prisma.release.update({
      where: { releaseCode: row["Release ID"] },
      data: {
        sourceOrder: index + 1,
        externalDependencies: row["External Dependencies "] || null,
      },
    })
  );
  await prisma.release.deleteMany({
    where: { releaseCode: { notIn: releaseRows.map((row) => row["Release ID"]) } },
  });

  const dependencyRows = rows("dependencies.json");
  await prisma.releaseDependency.deleteMany({});
  await prisma.releaseDependency.createMany({
    data: dependencyRows.flatMap((row, index) => {
      const releaseId = releaseIdByCode.get(row["Release ID"]);
      const dependsOnReleaseId = releaseIdByCode.get(row["Depends On Release"]);
      if (!releaseId || !dependsOnReleaseId) return [];
      return [{
        dependencyCode: row["Dep ID"],
        releaseId,
        dependsOnReleaseId,
        dependencyType: row["Dependency Type"] || null,
        status: row["Status"] || null,
        impactIfBlocked: row["Impact if Blocked"] || null,
        notes: row["Notes"] || null,
        sourceOrder: index + 1,
      }];
    }),
  });

  const bookingRows = rows("env_booking.json");
  await prisma.envBooking.deleteMany({});
  await prisma.envBooking.createMany({
    data: bookingRows.flatMap((row, index) => {
      const applicationId = resolveAppId(row["Application"]);
      if (!applicationId) return [];
      const legDates = [
        row["Test Start"],
        row["Test End"],
        row["UAT Start"],
        row["UAT End"],
        row["Pre-Prod Start"],
        row["Pre-Prod End"],
      ].map(toDate).filter((date): date is Date => Boolean(date));
      const prodDate = toDate(row["Prod Release Date"]) ?? new Date(0);
      const fromDate = legDates.length
        ? new Date(Math.min(...legDates.map((date) => date.getTime())))
        : prodDate;
      const toDateValue = legDates.length
        ? new Date(Math.max(...legDates.map((date) => date.getTime())))
        : prodDate;
      return [{
        organizationId,
        bookingCode: row["Booking ID"],
        applicationId,
        bookedBy: "Unknown",
        team: row["Department"] || "Unknown",
        departmentName: row["Department"] || null,
        fromDate,
        toDate: toDateValue,
        releaseId: releaseIdByCode.get(row["Release ID"]) ?? null,
        dependencies: row["Dependencies"] || null,
        purpose: row["Notes"] || null,
        releaseSize: row["Release Size"] || null,
        prodReleaseDate: toDate(row["Prod Release Date"]),
        cabDate: toDate(row["CAB Date"]),
        testEnvCode: row["Test Env"] || null,
        testStart: toDate(row["Test Start"]),
        testEnd: toDate(row["Test End"]),
        testDays: toInt(row["Test Days"]),
        uatEnvCode: row["UAT Env"] || null,
        uatStart: toDate(row["UAT Start"]),
        uatEnd: toDate(row["UAT End"]),
        uatDays: toInt(row["UAT Days"]),
        preProdEnvCode: row["Pre-Prod Env"] || null,
        preProdStart: toDate(row["Pre-Prod Start"]),
        preProdEnd: toDate(row["Pre-Prod End"]),
        preProdDays: toInt(row["Pre-Prod Days"]),
        conflictFlag: isConflict(row["Conflict Flag"]),
        environmentConflictId: row["Environment Conflict ID"] || null,
        sourceOrder: index + 1,
      }];
    }),
  });

  const conflicts = rows("conflicts.json");
  await prisma.environmentConflict.deleteMany({});
  await prisma.environmentConflict.createMany({
    data: conflicts.map((row, index) => ({
      conflictCode: row["Conflict ID"],
      status: row["Status"],
      priority: row["Priority"],
      assignedTo: row["Assigned To"] || null,
      release1Code: row["Release 1"],
      release2Code: row["Release 2"],
      applicationName: row["Application"],
      departmentName: row["Department"],
      conflictingEnvironment: row["Conflicting Environment"],
      environmentConflictType: row["Environment Conflict Type"],
      notes: row["Notes"] || null,
      sourceOrder: index + 1,
    })),
  });

  const blockers = rows("blockers.json");
  await prisma.blocker.deleteMany({});
  await prisma.blocker.createMany({
    data: blockers.map((row, index) => ({
      blockerCode: row["Blocker ID"],
      releaseCode: row["Release ID"],
      releaseName: row["Release Name"],
      departmentName: row["Department"],
      applicationName: row["Application"],
      blockerType: row["Blocker Type"],
      blockerDescription: row["Blocker Description"],
      severity: row["Severity"],
      raisedDate: toDate(row["Raised Date"])!,
      raisedBy: row["Raised By"],
      assignedTo: row["Assigned To"] || null,
      status: row["Status"],
      targetResolutionDate: toDate(row["Target Resolution Date"]),
      actualResolutionDate: toDate(row["Actual Resolution Date"]),
      daysOpen: toInt(row["Days Open"]) ?? 0,
      escalationLevel: row["Escalation Level"],
      rootCause: row["Root Cause"] || null,
      resolutionNotes: row["Resolution Notes"] || null,
      impactOnRelease: row["Impact on Release"],
      sourceOrder: index + 1,
    })),
  });

  const core = rows("system-core.json");
  await prisma.systemCoreRecord.deleteMany({});
  await prisma.systemCoreRecord.createMany({
    data: core.map((row, index) => ({
      system: row.System,
      department: row.Department,
      type: row.Type,
      integratesWith: row["Integrates With"],
      dataFlow: row["Data Flow"],
      keyDataExchanged: row["Key Data Exchanged"],
      sourceOrder: index + 1,
    })),
  });

  const matrix = rows("system-matrix.json");
  await prisma.systemMatrixRow.deleteMany({});
  await prisma.systemMatrixRow.createMany({
    data: matrix.map((row, index) => ({
      fromDepartment: row["From \\ To"],
      finance: row.Finance,
      hr: row.HR,
      it: row.IT,
      crm: row.CRM,
      manufacturing: row.Manufacturing,
      logistics: row.Logistics,
      legal: row.Legal,
      security: row.Security,
      sourceOrder: index + 1,
    })),
  });
  await seedSystemMapping(prisma);

  const flows = rows("integration-flows.json");
  await prisma.integrationFlow.deleteMany({});
  await prisma.integrationFlow.createMany({
    data: flows.map((row, index) => ({
      flowCode: row["Flow ID"],
      sourceSystem: row["Source System"],
      targetSystem: row["Target System"],
      integrationType: row["Integration Type"],
      frequency: row.Frequency,
      dataElements: row["Data Elements"],
      businessPurpose: row["Business Purpose"],
      sourceOrder: index + 1,
    })),
  });

  const orderedByCode: Array<[string, string, (code: string, order: number) => Promise<unknown>]> = [
    ["risk.json", "Risk ID", (code, order) => prisma.risk.update({ where: { riskCode: code }, data: { sourceOrder: order } })],
    ["drift.json", "Drift ID", (code, order) => prisma.drift.update({ where: { driftCode: code }, data: { sourceOrder: order } })],
    ["approvals.json", "Approval ID", (code, order) => prisma.approval.update({ where: { approvalCode: code }, data: { sourceOrder: order } })],
    ["leave_calendar.json", "Leave ID", (code, order) => prisma.leaveRecord.update({ where: { leaveCode: code }, data: { sourceOrder: order } })],
    ["monitoring-alerts.json", "Alert ID", (code, order) => prisma.monitoringAlert.update({ where: { alertCode: code }, data: { sourceOrder: order } })],
    ["incidents.json", "Incident ID", (code, order) => prisma.incident.update({ where: { incidentCode: code }, data: { sourceOrder: order } })],
    ["planned-maintenance.json", "Maintenance ID", (code, order) => prisma.plannedMaintenance.update({ where: { maintenanceCode: code }, data: { sourceOrder: order } })],
  ];
  for (const [file, key, update] of orderedByCode) {
    await inBatches(rows(file), (row, index) => update(row[key], index + 1));
  }

  const versionRows = rows("versions.json");
  await inBatches(versionRows, async (row, index) => {
    const applicationId = resolveAppId(row.Application);
    if (!applicationId) return;
    const environmentId = envIdByAppEnv.get(`${applicationId}::${row.Environment.toLowerCase()}`);
    if (!environmentId) return;
    await prisma.environmentVersion.update({
      where: { applicationId_environmentId: { applicationId, environmentId } },
      data: { appCode: row["App ID"], sourceOrder: index + 1 },
    });
  });

  const statusRows = rows("application-status.json");
  await inBatches(statusRows, async (row, index) => {
    const applicationId = resolveAppId(row.Application);
    if (!applicationId) return;
    await prisma.applicationStatus.update({
      where: {
        applicationId_environmentName: {
          applicationId,
          environmentName: row.Environment,
        },
      },
      data: { sourceOrder: index + 1 },
    });
  });

  const calendarRows = rows("calendar.json");
  const dbCalendar = await prisma.calendarEvent.findMany();
  const calendarBuckets = new Map<string, string[]>();
  const calendarKey = (
    date: string,
    eventType: string,
    title: string,
    application: string,
    department: string,
    sizeImpact: string,
    notes: string
  ) =>
    [date.slice(0, 10), eventType, title, application, department, sizeImpact, notes].join("\u001f");
  for (const event of dbCalendar) {
    const key = calendarKey(
      event.date.toISOString(),
      event.eventType,
      event.title,
      event.applicationName ?? "",
      event.departmentName ?? "",
      event.sizeImpact ?? "",
      event.notes ?? ""
    );
    const ids = calendarBuckets.get(key) ?? [];
    ids.push(event.id);
    calendarBuckets.set(key, ids);
  }
  await inBatches(calendarRows, async (row, index) => {
    const key = calendarKey(
      row.Date,
      row["Event Type"],
      row["Release Name"],
      row.Application,
      row.Department,
      row["Size/Impact"],
      row.Notes
    );
    const id = calendarBuckets.get(key)?.shift();
    if (!id) throw new Error(`Calendar row ${index + 1} not found in DB`);
    await prisma.calendarEvent.update({
      where: { id },
      data: { sourceOrder: index + 1 },
    });
  });

  console.log("V0.6 operational finalizer complete");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
