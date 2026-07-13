/**
 * ReleaseDesk seed script
 * Loads prisma/seed-data/*.json (verbatim from ReleaseDesk_SampleData.xlsx)
 * into the database via Prisma, in FK-safe dependency order.
 *
 * Run: npm run db:seed  (or npx prisma db seed)
 *
 * GAP-FILL fields are documented in releasedesk-seed/SEED_NOTES.md.
 */
import fs from "fs";
import path from "path";
import { prisma } from "../lib/prisma";
import { seedSystemMapping } from "../lib/seed-system-mapping";
import { APPLICATION_NAME_ALIASES } from "./seed-data/app-name-aliases";

const DATA_DIR = path.join(process.cwd(), "prisma", "seed-data");
const DATA = (f: string) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), "utf-8"));

const toDate = (v: unknown): Date | null => (v ? new Date(String(v)) : null);
const isConflict = (v: unknown) => typeof v === "string" && v.includes("CONFLICT");
const splitIds = (v: unknown): string[] =>
  v ? String(v).split(",").map((s) => s.trim()).filter(Boolean) : [];
const toInt = (v: unknown): number | undefined => {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : undefined;
};

function resolveAppId(
  rawName: string,
  appIdByName: Map<string, string>
): string | undefined {
  if (appIdByName.has(rawName)) return appIdByName.get(rawName);
  const alias = APPLICATION_NAME_ALIASES[rawName];
  if (alias && appIdByName.has(alias)) return appIdByName.get(alias);
  return undefined;
}

async function main() {
  // ── 1. Departments ──────────────────────────────────────────────
  const departments = DATA("departments.json");
  const deptIdByName = new Map<string, string>();
  for (const d of departments) {
    const rec = await prisma.department.create({
      data: {
        name: d.name,
        head: "", // GAP-FILL: no "head" field exists in Reference Data for departments
      },
    });
    deptIdByName.set(d.name, rec.id);
  }
  console.log(`Departments: ${departments.length}`);

  // ── 2. Applications + Environments ──────────────────────────────
  const applications = DATA("applications.json");
  const appIdByName = new Map<string, string>();
  for (const a of applications) {
    const departmentId = deptIdByName.get(a.department)!;
    const prodEnv = a.environments.find((e: { env: string }) => e.env === "Prod");
    const app = await prisma.application.create({
      data: {
        name: a.application,
        departmentId,
        type: "Unclassified", // GAP-FILL
        productOwner: a.applicationOwner ?? "",
        techLead: a.techLead ?? "",
        support: prodEnv?.envOwner ?? "", // GAP-FILL
        criticality: "Unclassified", // GAP-FILL
      },
    });
    appIdByName.set(a.application, app.id);

    for (const e of a.environments) {
      await prisma.environment.create({
        data: {
          applicationId: app.id,
          name: e.env,
          type: e.env,
          owner: e.envOwner ?? "",
          status: "Active", // GAP-FILL
        },
      });
    }
  }
  console.log(`Applications: ${applications.length}`);

  const envCount = await prisma.environment.count();
  console.log(`Environments: ${envCount}`);

  // ── 3. Environment Versions ─────────────────────────────────────
  const versions = DATA("versions.json");
  const envIdByAppEnv = new Map<string, string>();
  {
    const envs = await prisma.environment.findMany();
    for (const e of envs) envIdByAppEnv.set(`${e.applicationId}::${e.name}`, e.id);
  }
  let envVersionCount = 0;
  for (const [sourceIndex, v] of versions.entries()) {
    const applicationId = appIdByName.get(v["Application"]);
    if (!applicationId) continue;
    const environmentId = envIdByAppEnv.get(`${applicationId}::${v["Environment"]}`);
    if (!environmentId) continue;
    await prisma.environmentVersion.create({
      data: {
        applicationId,
        environmentId,
        appCode: v["App ID"] || null,
        version: v["Version"],
        updatedBy: v["Deployed By"],
        buildNumber: v["Build Number"],
        deployDate: toDate(v["Deploy Date"]),
        status: v["Status"],
        notes: v["Notes"],
        sourceOrder: sourceIndex + 1,
      },
    });
    envVersionCount++;
  }
  console.log(`Environment Versions: ${envVersionCount}`);

  // ── 4. Users ─────────────────────────────────────────────────────
  const users = DATA("users.json");
  const userDbIdByUserId = new Map<string, string>();
  const userNameByUserId = new Map<string, string>();
  for (const u of users) {
    const rec = await prisma.user.create({
      data: {
        userId: u["User ID"],
        name: u["Name"],
        email: u["Email"],
        role: u["Role"],
        department: u["Department"],
        manager: u["Manager"],
        accessLevel: u["Access Level"],
        status: u["Status"],
        lastLogin: toDate(u["Last Login"]),
      },
    });
    userDbIdByUserId.set(u["User ID"], rec.id);
    userNameByUserId.set(u["User ID"], u["Name"]);
  }
  console.log(`Users: ${users.length}`);

  // ── 5. Releases (+ ReleaseApplication + ReleaseStakeholder) ─────
  const releases = DATA("releases.json");
  const releaseIdByCode = new Map<string, string>();
  const releaseOwnerDbIdByCode = new Map<string, string | undefined>();
  for (const [sourceIndex, r] of releases.entries()) {
    const departmentId = deptIdByName.get(r["Department"])!;
    const ownerUserId = r["Release Owner ID"];
    const ownerDbId = ownerUserId ? userDbIdByUserId.get(ownerUserId) : undefined;
    const ownerName = userNameByUserId.get(ownerUserId) ?? ownerUserId ?? "Unknown";

    const release = await prisma.release.create({
      data: {
        releaseCode: r["Release ID"],
        name: r["Release Name"],
        owner: ownerName, // GAP-FILL
        status: r["Status"],
        releaseDate: toDate(r["End Date"])!,
        priority: r["Priority"],
        impact: r["Impact"],
        departmentId,
        notes: r["Notes"],
        releaseSize: r["Release Size"],
        cabDate: toDate(r["CAB Date"]),
        startDate: toDate(r["Start Date"]),
        testEnvRequired: r["Test Env Required"],
        uatEnvRequired: r["UAT Env Required"],
        conflictFlag: isConflict(r["Conflict Flag"]),
        conflictId: r["Conflict ID"] || null,
        conflictingRelease: r["Conflicting Release"] || null,
        conflictType: r["Conflict Type"] || null,
        conflictNotes: r["Conflict Notes"] || null,
        dependencies: r["Dependencies"] ? String(r["Dependencies"]) : null,
        externalDependencies: r["External Dependencies "] || null,
        readinessPercent: r["Readiness %"],
        blockers: r["Blockers"],
        vendorMaintenance: r["Vendor Maintenance"],
        changeFreeze: r["Change Freeze"],
        regulatory: r["Regulatory"],
        approvalStatus: r["Approval Status"],
        rollbackPlan: r["Rollback Plan"],
        goLiveChecklistPercent: r["Go-Live Checklist %"],
        deploymentWindow: r["Deployment Window"],
        releaseOwnerId: ownerDbId,
        devSignoff: r["Dev Signoff"] || null,
        testSignoff: r["Test Sign-off"] || null,
        uatSignoff: r["UAT Sign-off"] || null,
        securityClearance: r["Security Clearance"] || null,
        dressRehearsal: r["Dress Rehearsal"] || null,
        hypercarePlan: r["Hypercare Plan"] || null,
        commsPlan: r["Comms Plan"] || null,
        trainingStatus: r["Training Status"] || null,
        supportBriefed: r["Support Briefed"] || null,
        releaseHealth: r["Release Health"] || null,
        sourceOrder: sourceIndex + 1,
      },
    });
    releaseIdByCode.set(r["Release ID"], release.id);
    releaseOwnerDbIdByCode.set(r["Release ID"], ownerDbId);

    const appId = appIdByName.get(r["Application"]);
    if (appId) {
      await prisma.releaseApplication.create({
        data: { releaseId: release.id, applicationId: appId },
      });
    }

    for (const sid of splitIds(r["Stakeholder IDs"])) {
      const suDbId = userDbIdByUserId.get(sid);
      if (!suDbId) continue;
      await prisma.releaseStakeholder.create({
        data: { releaseId: release.id, userId: suDbId },
      });
    }
  }
  console.log(`Releases: ${releases.length}`);

  // ── 6. Release Dependencies ─────────────────────────────────────
  const deps = DATA("dependencies.json");
  let depCount = 0;
  for (const [sourceIndex, d] of deps.entries()) {
    const releaseId = releaseIdByCode.get(d["Release ID"]);
    const dependsOnReleaseId = releaseIdByCode.get(d["Depends On Release"]);
    if (!releaseId || !dependsOnReleaseId) continue;
    await prisma.releaseDependency.create({
      data: {
        dependencyCode: d["Dep ID"],
        releaseId,
        dependsOnReleaseId,
        dependencyType: d["Dependency Type"],
        status: d["Status"],
        impactIfBlocked: d["Impact if Blocked"],
        notes: d["Notes"],
        sourceOrder: sourceIndex + 1,
      },
    });
    depCount++;
  }
  console.log(`Release Dependencies: ${depCount}`);

  // ── 7. Env Bookings ──────────────────────────────────────────────
  const bookings = DATA("env_booking.json").filter((b: Record<string, unknown>) =>
    String(b["Booking ID"] ?? "").startsWith("ENV-")
  );
  let bookingCount = 0;
  for (const [sourceIndex, b] of bookings.entries()) {
    const applicationId = resolveAppId(String(b["Application"] ?? ""), appIdByName);
    if (!applicationId) continue;
    const releaseId = releaseIdByCode.get(b["Release ID"]);
    const ownerDbId = releaseId ? releaseOwnerDbIdByCode.get(b["Release ID"]) : undefined;
    const bookedBy = ownerDbId
      ? [...userDbIdByUserId.entries()].find(([, dbId]) => dbId === ownerDbId)?.[0]
      : undefined;
    const bookedByName = bookedBy ? userNameByUserId.get(bookedBy) : "Unknown";

    const legDates = [b["Test Start"], b["Test End"], b["UAT Start"], b["UAT End"], b["Pre-Prod Start"], b["Pre-Prod End"]]
      .map(toDate)
      .filter(Boolean) as Date[];
    const prodDate = toDate(b["Prod Release Date"]) ?? new Date();
    const fromDate = legDates.length ? new Date(Math.min(...legDates.map((d) => d.getTime()))) : prodDate;
    const toDt = legDates.length ? new Date(Math.max(...legDates.map((d) => d.getTime()))) : prodDate;

    const bookingCode = String(b["Booking ID"]);
    const data = {
      applicationId,
      bookedBy: bookedByName ?? "Unknown",
      team: b["Department"] ?? "Unknown",
      departmentName: b["Department"],
      fromDate,
      toDate: toDt,
      releaseId,
      // Keep blank Dependencies blank (source sheet uses empty, not "NA", on some rows)
      dependencies: b["Dependencies"] ? String(b["Dependencies"]) : null,
      purpose: b["Notes"] ? String(b["Notes"]) : null,
      releaseSize: b["Release Size"] ? String(b["Release Size"]) : null,
      prodReleaseDate: toDate(b["Prod Release Date"]),
      cabDate: toDate(b["CAB Date"]),
      testEnvCode: b["Test Env"] ? String(b["Test Env"]) : null,
      testStart: toDate(b["Test Start"]),
      testEnd: toDate(b["Test End"]),
      testDays: toInt(b["Test Days"]),
      uatEnvCode: b["UAT Env"] ? String(b["UAT Env"]) : null,
      uatStart: toDate(b["UAT Start"]),
      uatEnd: toDate(b["UAT End"]),
      uatDays: toInt(b["UAT Days"]),
      preProdEnvCode: b["Pre-Prod Env"] ? String(b["Pre-Prod Env"]) : null,
      preProdStart: toDate(b["Pre-Prod Start"]),
      preProdEnd: toDate(b["Pre-Prod End"]),
      preProdDays: toInt(b["Pre-Prod Days"]),
      conflictFlag: isConflict(b["Conflict Flag"]),
      environmentConflictId: b["Environment Conflict ID"] ? String(b["Environment Conflict ID"]) : null,
      sourceOrder: sourceIndex + 1,
    };

    await prisma.envBooking.upsert({
      where: { bookingCode },
      create: { bookingCode, ...data },
      update: data,
    });
    bookingCount++;
  }
  console.log(`Env Bookings: ${bookingCount}`);

  // ── 8. Risk ──────────────────────────────────────────────────────
  const risks = DATA("risk.json");
  for (const [sourceIndex, r] of risks.entries()) {
    const releaseId = releaseIdByCode.get(r["Release ID"]);
    if (!releaseId) continue;
    const riskOwnerId = r["Risk Owner ID"] ? userDbIdByUserId.get(r["Risk Owner ID"]) : undefined;
    await prisma.risk.create({
      data: {
        riskCode: r["Risk ID"],
        releaseId,
        applicationName: r["Application"] || null,
        departmentName: r["Department"] || null,
        category: r["Risk Category"],
        description: r["Risk Description"],
        likelihood: r["Likelihood"],
        impact: r["Impact"],
        riskScore: r["Risk Score"],
        affectedArea: r["Affected Area"],
        mitigationStrategy: r["Mitigation Strategy"],
        riskOwnerId,
        status: r["Status"],
        notes: r["Notes"],
        sourceOrder: sourceIndex + 1,
      },
    });
  }
  console.log(`Risk: ${risks.length}`);

  // ── 9. Drift ─────────────────────────────────────────────────────
  const drifts = DATA("drift.json");
  for (const [sourceIndex, d] of drifts.entries()) {
    const releaseId = releaseIdByCode.get(d["Release ID"]);
    const applicationId = appIdByName.get(d["Application"]);
    if (!releaseId || !applicationId) continue;
    await prisma.drift.create({
      data: {
        driftCode: d["Drift ID"],
        releaseId,
        applicationId,
        environmentName: d["Environment"],
        driftType: d["Drift Type:"],
        driftCategory: d["Drift Category"],
        detectedDate: toDate(d["Detected Date"])!,
        severity: d["Severity"],
        description: d["Description"],
        impactOnRelease: d["Impact on Release"],
        remediationAction: d["Remediation Action"],
        status: d["Status"],
        etaToFix: toDate(d["ETA to Fix"]),
        sourceOrder: sourceIndex + 1,
      },
    });
  }
  console.log(`Drift: ${drifts.length}`);

  // ── 10. Approvals ────────────────────────────────────────────────
  const approvals = DATA("approvals.json");
  let approvalCount = 0;
  for (const [sourceIndex, a] of approvals.entries()) {
    const releaseId = releaseIdByCode.get(a["Release ID"]);
    const approverId = userDbIdByUserId.get(a["Approver ID"]);
    if (!releaseId || !approverId) continue;
    await prisma.approval.create({
      data: {
        approvalCode: a["Approval ID"],
        releaseId,
        approvalType: a["Approval Type"],
        approverId,
        submittedDate: toDate(a["Submitted Date"])!,
        decisionDate: toDate(a["Decision Date"]),
        decision: a["Decision"] ?? "Pending",
        comments: a["Comments"],
        cabMeetingId: a["CAB Meeting ID"],
        sourceOrder: sourceIndex + 1,
      },
    });
    approvalCount++;
  }
  console.log(`Approvals: ${approvalCount}`);

  // ── 11. Leave Records (+ affected releases) ─────────────────────
  const leaves = DATA("leave_calendar.json");
  for (const [sourceIndex, l] of leaves.entries()) {
    const userId = userDbIdByUserId.get(l["User ID"]);
    if (!userId) continue;
    const leave = await prisma.leaveRecord.create({
      data: {
        leaveCode: l["Leave ID"],
        userId,
        leaveStart: toDate(l["Leave Start"])!,
        leaveEnd: toDate(l["Leave End"])!,
        leaveType: l["Leave Type"],
        days: l["Days"],
        riskImpact: l["Risk Impact"],
        riskScore: l["Risk Score"],
        sourceOrder: sourceIndex + 1,
      },
    });
    for (const relCode of splitIds(l["Affected Release"])) {
      const releaseId = releaseIdByCode.get(relCode);
      if (!releaseId) continue;
      await prisma.leaveRecordRelease.create({
        data: { leaveRecordId: leave.id, releaseId },
      });
    }
  }
  console.log(`Leave Records: ${leaves.length}`);

  // ── 12. Calendar Events ──────────────────────────────────────────
  const calendar = DATA("calendar.json");
  for (const [sourceIndex, c] of calendar.entries()) {
    const releaseId = c["Release ID"] ? releaseIdByCode.get(c["Release ID"]) : undefined;
    await prisma.calendarEvent.create({
      data: {
        date: toDate(c["Date"])!,
        eventType: c["Event Type"],
        releaseId,
        title: c["Release Name"] ?? c["Event Type"],
        applicationName: c["Application"] || null,
        departmentName: c["Department"],
        sizeImpact: c["Size/Impact"],
        notes: c["Notes"],
        sourceOrder: sourceIndex + 1,
      },
    });
  }
  console.log(`Calendar Events: ${calendar.length}`);

  const conflicts = DATA("conflicts.json");
  await prisma.environmentConflict.createMany({
    data: conflicts.map((c: Record<string, unknown>, sourceIndex: number) => ({
      conflictCode: String(c["Conflict ID"]),
      status: String(c["Status"]),
      priority: String(c["Priority"]),
      assignedTo: c["Assigned To"] ? String(c["Assigned To"]) : null,
      release1Code: String(c["Release 1"]),
      release2Code: String(c["Release 2"]),
      applicationName: String(c["Application"]),
      departmentName: String(c["Department"]),
      conflictingEnvironment: String(c["Conflicting Environment"]),
      environmentConflictType: String(c["Environment Conflict Type"]),
      notes: c["Notes"] ? String(c["Notes"]) : null,
      sourceOrder: sourceIndex + 1,
    })),
  });

  const blockers = DATA("blockers.json");
  await prisma.blocker.createMany({
    data: blockers.map((b: Record<string, unknown>, sourceIndex: number) => ({
      blockerCode: String(b["Blocker ID"]),
      releaseCode: String(b["Release ID"]),
      releaseName: String(b["Release Name"]),
      departmentName: String(b["Department"]),
      applicationName: String(b["Application"]),
      blockerType: String(b["Blocker Type"]),
      blockerDescription: String(b["Blocker Description"]),
      severity: String(b["Severity"]),
      raisedDate: toDate(b["Raised Date"])!,
      raisedBy: String(b["Raised By"]),
      assignedTo: b["Assigned To"] ? String(b["Assigned To"]) : null,
      status: String(b["Status"]),
      targetResolutionDate: toDate(b["Target Resolution Date"]),
      actualResolutionDate: toDate(b["Actual Resolution Date"]),
      daysOpen: toInt(b["Days Open"]) ?? 0,
      escalationLevel: String(b["Escalation Level"]),
      rootCause: b["Root Cause"] ? String(b["Root Cause"]) : null,
      resolutionNotes: b["Resolution Notes"] ? String(b["Resolution Notes"]) : null,
      impactOnRelease: String(b["Impact on Release"]),
      sourceOrder: sourceIndex + 1,
    })),
  });

  const coreRows = DATA("system-core.json");
  await prisma.systemCoreRecord.createMany({
    data: coreRows.map((r: Record<string, unknown>, sourceIndex: number) => ({
      system: String(r["System"]),
      department: String(r["Department"]),
      type: String(r["Type"]),
      integratesWith: String(r["Integrates With"]),
      dataFlow: String(r["Data Flow"]),
      keyDataExchanged: String(r["Key Data Exchanged"]),
      sourceOrder: sourceIndex + 1,
    })),
  });

  const matrixRows = DATA("system-matrix.json");
  await prisma.systemMatrixRow.createMany({
    data: matrixRows.map((r: Record<string, unknown>, sourceIndex: number) => ({
      fromDepartment: String(r["From \\ To"]),
      finance: String(r["Finance"]),
      hr: String(r["HR"]),
      it: String(r["IT"]),
      crm: String(r["CRM"]),
      manufacturing: String(r["Manufacturing"]),
      logistics: String(r["Logistics"]),
      legal: String(r["Legal"]),
      security: String(r["Security"]),
      sourceOrder: sourceIndex + 1,
    })),
  });

  await seedSystemMapping(prisma);

  const flows = DATA("integration-flows.json");
  await prisma.integrationFlow.createMany({
    data: flows.map((r: Record<string, unknown>, sourceIndex: number) => ({
      flowCode: String(r["Flow ID"]),
      sourceSystem: String(r["Source System"]),
      targetSystem: String(r["Target System"]),
      integrationType: String(r["Integration Type"]),
      frequency: String(r["Frequency"]),
      dataElements: String(r["Data Elements"]),
      businessPurpose: String(r["Business Purpose"]),
      sourceOrder: sourceIndex + 1,
    })),
  });

  for (const [sourceIndex, row] of DATA("monitoring-alerts.json").entries()) {
    const applicationId = resolveAppId(String(row["Application"]), appIdByName);
    if (!applicationId) continue;
    await prisma.monitoringAlert.create({
      data: {
        alertCode: row["Alert ID"],
        timestamp: toDate(row["Timestamp"])!,
        applicationId,
        departmentName: row["Department"] || null,
        alertType: row["Alert Type"],
        severity: row["Severity"],
        metric: row["Metric"],
        threshold: row["Threshold"] || null,
        currentValue: row["Current Value"] || null,
        status: row["Status"],
        assignedTo: row["Assigned To"] || null,
        environmentName: row["Environment"],
        sourceOrder: sourceIndex + 1,
      },
    });
  }

  for (const [sourceIndex, row] of DATA("incidents.json").entries()) {
    const applicationId = resolveAppId(String(row["Application"]), appIdByName);
    if (!applicationId) continue;
    await prisma.incident.create({
      data: {
        incidentCode: row["Incident ID"],
        timestamp: toDate(row["Timestamp"])!,
        applicationId,
        departmentName: row["Department"] || null,
        severity: row["Severity"],
        title: row["Title"],
        status: row["Status"],
        impact: row["Impact"],
        assignedTo: row["Assigned To"] || null,
        relatedReleaseCode: row["Related Release"] || null,
        environmentName: row["Environment"],
        sourceOrder: sourceIndex + 1,
      },
    });
  }

  for (const [sourceIndex, row] of DATA("application-status.json").entries()) {
    const applicationId = resolveAppId(String(row["Application"]), appIdByName);
    if (!applicationId) continue;
    const uptime = Number(String(row["Uptime %"]).replace("%", ""));
    await prisma.applicationStatus.create({
      data: {
        applicationId,
        environmentName: row["Environment"],
        status: row["Status"],
        lastCheck: toDate(row["Last Check"])!,
        uptimePercent: Number.isFinite(uptime) ? (uptime <= 1 ? uptime * 100 : uptime) : null,
        notes: row["Notes"] || null,
        sourceOrder: sourceIndex + 1,
      },
    });
  }

  for (const [sourceIndex, row] of DATA("planned-maintenance.json").entries()) {
    const appName = String(row["Application(s)"] ?? "").split(",")[0].trim();
    await prisma.plannedMaintenance.create({
      data: {
        maintenanceCode: row["Maintenance ID"],
        scheduledDate: toDate(row["Scheduled Date"])!,
        startTime: row["Start Time"],
        endTime: row["End Time"],
        type: row["Type"],
        applicationId: appName ? resolveAppId(appName, appIdByName) ?? null : null,
        environmentName: String(row["Environment(s)"] ?? "").split(",")[0].trim(),
        departmentName: row["Department"] || null,
        impact: row["Impact"],
        requestor: row["Requestor"] || null,
        approvalStatus: row["Approval Status"],
        notes: row["Notes"] || null,
        sourceOrder: sourceIndex + 1,
      },
    });
  }

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
