/**
 * Idempotent sync: bring live DB in line with prisma/seed-data/*.json
 * (extracted from ReleaseDesk_SampleData_V0.6_12072026.xlsx).
 *
 * Additive/upsert only — does not wipe unrelated rows.
 * Run: npx tsx scripts/sync-db-from-seed.ts
 */
import fs from "fs";
import path from "path";
import { PrismaClient } from "@releasedesk/database";
import { APPLICATION_NAME_ALIASES } from "../prisma/seed-data/app-name-aliases";
import { seedSystemMapping } from "../lib/seed-system-mapping";

const prisma = new PrismaClient();
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
const toFloat = (v: unknown): number | undefined => {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(String(v).replace("%", ""));
  return Number.isFinite(n) ? n : undefined;
};

function cryptoRandomId(): string {
  return `cm${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function resolveAppId(rawName: string, appIdByName: Map<string, string>): string | undefined {
  if (appIdByName.has(rawName)) return appIdByName.get(rawName);
  const alias = APPLICATION_NAME_ALIASES[rawName];
  if (alias && appIdByName.has(alias)) return appIdByName.get(alias);
  // fuzzy: excel sometimes shortens names
  for (const [name, id] of appIdByName) {
    if (name.startsWith(rawName) || rawName.startsWith(name)) return id;
  }
  return undefined;
}

async function upsertByCode<T extends { id: string }>(
  find: () => Promise<T | null>,
  create: () => Promise<T>,
  update: (id: string) => Promise<T>
): Promise<T> {
  const existing = await find();
  if (existing) return update(existing.id);
  return create();
}

async function main() {
  console.log("=== sync start ===");
  const orgRows = await prisma.$queryRawUnsafe<{ organizationId: string }[]>(
    `SELECT "organizationId" FROM "User" WHERE "organizationId" IS NOT NULL LIMIT 1`
  );
  const organizationId = orgRows[0]?.organizationId;
  if (!organizationId) throw new Error("No organizationId found on existing users");
  console.log("using organizationId", organizationId);

  // Departments
  const departments = DATA("departments.json");
  const deptIdByName = new Map<string, string>();
  for (const d of await prisma.department.findMany()) deptIdByName.set(d.name, d.id);
  for (const d of departments) {
    const existing = deptIdByName.get(d.name);
    if (existing) continue;
    const rec = await prisma.department.create({ data: { name: d.name, head: "" } });
    deptIdByName.set(d.name, rec.id);
    console.log("+ department", d.name);
  }

  // Applications + Environments
  const applications = DATA("applications.json");
  const appIdByName = new Map<string, string>();
  for (const a of await prisma.application.findMany()) appIdByName.set(a.name, a.id);
  const envIdByAppEnv = new Map<string, string>();
  for (const e of await prisma.environment.findMany()) {
    envIdByAppEnv.set(`${e.applicationId}::${e.name}`, e.id);
    envIdByAppEnv.set(`${e.applicationId}::${e.type}`, e.id);
  }

  for (const a of applications) {
    const departmentId = deptIdByName.get(a.department);
    if (!departmentId) {
      console.warn("skip app — missing dept", a.application, a.department);
      continue;
    }
    let appId = appIdByName.get(a.application);
    if (!appId) {
      const prodEnv = a.environments.find((e: { env: string }) => e.env === "Prod");
      const app = await prisma.application.create({
        data: {
          name: a.application,
          departmentId,
          type: "Unclassified",
          productOwner: a.applicationOwner ?? "",
          techLead: a.techLead ?? "",
          support: prodEnv?.envOwner ?? "",
          criticality: "Unclassified",
        },
      });
      appId = app.id;
      appIdByName.set(a.application, appId);
      console.log("+ application", a.application);
    }
    for (const e of a.environments) {
      const key = `${appId}::${e.env}`;
      if (envIdByAppEnv.has(key)) continue;
      const env = await prisma.environment.create({
        data: {
          applicationId: appId!,
          name: e.env,
          type: e.env,
          owner: e.envOwner ?? "",
          status: "Active",
        },
      });
      envIdByAppEnv.set(key, env.id);
    }
  }

  console.log("departments/apps done");
  // Users
  const users = DATA("users.json");
  const userDbIdByUserId = new Map<string, string>();
  const userNameByUserId = new Map<string, string>();
  const existingUsersByUserId = new Map<string, Awaited<ReturnType<typeof prisma.user.findFirst>>>();
  const emailOwnerUserId = new Map<string, string>();
  for (const u of await prisma.user.findMany()) {
    if (u.userId) userDbIdByUserId.set(u.userId, u.id);
    userNameByUserId.set(u.userId ?? u.email, u.name);
    if (u.userId) existingUsersByUserId.set(u.userId, u);
    emailOwnerUserId.set(u.email.toLowerCase(), u.userId ?? u.id);
  }
  for (const u of users) {
    const sourceUserId = String(u["User ID"]);
    const sourceEmail = String(u["Email"]);
    const existing = existingUsersByUserId.get(sourceUserId) ?? null;
    const emailOwner = emailOwnerUserId.get(sourceEmail.toLowerCase());
    const email =
      emailOwner && emailOwner !== sourceUserId
        ? existing?.email ?? sourceEmail.replace("@", `+${sourceUserId.toLowerCase()}@`)
        : sourceEmail;
    if (existing) {
      // Operational sync does not rewrite existing master users. This also
      // preserves deterministic placeholder emails for duplicate workbook emails.
      userDbIdByUserId.set(u["User ID"], existing.id);
      userNameByUserId.set(u["User ID"], u["Name"]);
    } else {
      const orgRows = await prisma.$queryRawUnsafe<{ organizationId: string }[]>(
        `SELECT "organizationId" FROM "User" WHERE "organizationId" IS NOT NULL LIMIT 1`
      );
      const organizationId = orgRows[0]?.organizationId;
      if (!organizationId) throw new Error("No organizationId found on existing users");
      await prisma.$executeRawUnsafe(
        `INSERT INTO "User" (id, "userId", name, email, role, department, manager, "accessLevel", status, "lastLogin", "organizationId", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())`,
        cryptoRandomId(),
        u["User ID"],
        u["Name"],
        email,
        u["Role"],
        u["Department"],
        u["Manager"] || null,
        u["Access Level"],
        u["Status"],
        toDate(u["Last Login"]),
        organizationId
      );
      const created = await prisma.user.findFirst({ where: { email } });
      if (!created) throw new Error("Failed to create user " + email);
      userDbIdByUserId.set(u["User ID"], created.id);
      userNameByUserId.set(u["User ID"], u["Name"]);
      existingUsersByUserId.set(sourceUserId, created);
      emailOwnerUserId.set(email.toLowerCase(), sourceUserId);
      console.log("+ user", email);
    }
  }

  console.log("users done");
  // Releases
  const releases = DATA("releases.json");
  const releaseIdByCode = new Map<string, string>();
  for (const r of await prisma.release.findMany({ select: { id: true, releaseCode: true } })) {
    releaseIdByCode.set(r.releaseCode, r.id);
  }

  for (const [sourceIndex, r] of releases.entries()) {
    const departmentId = deptIdByName.get(r["Department"]);
    if (!departmentId) {
      console.warn("skip release — dept", r["Release ID"], r["Department"]);
      continue;
    }
    const ownerUserId = r["Release Owner ID"];
    const ownerDbId = ownerUserId ? userDbIdByUserId.get(ownerUserId) : undefined;
    const ownerName = (ownerUserId && userNameByUserId.get(ownerUserId)) || ownerUserId || "Unknown";

    const data = {
      name: r["Release Name"],
      owner: ownerName,
      status: r["Status"],
      releaseDate: toDate(r["End Date"])!,
      priority: r["Priority"],
      impact: r["Impact"],
      departmentId,
      // Intentionally omit notes + dependencies: V0.6 dropped those columns;
      // do not blank out existing V0.5 values in the DB.
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
      externalDependencies: r["External Dependencies "] || null,
      readinessPercent: toFloat(r["Readiness %"]),
      blockers: r["Blockers"] ? String(r["Blockers"]) : null,
      vendorMaintenance: r["Vendor Maintenance"] || null,
      changeFreeze: r["Change Freeze"] || null,
      regulatory: r["Regulatory"] || null,
      approvalStatus: r["Approval Status"] || null,
      rollbackPlan: r["Rollback Plan"] || null,
      goLiveChecklistPercent: toFloat(r["Go-Live Checklist %"]),
      deploymentWindow: r["Deployment Window"] || null,
      releaseOwnerId: ownerDbId ?? null,
      devSignoff: r["Dev Signoff"] || null,
      testSignoff: r["Test Sign-off"] || null,
      uatSignoff: r["UAT Sign-off"] || null,
      securityClearance: r["Security Clearance"] || null,
      dressRehearsal: r["Dress Rehearsal"] || null,
      hypercarePlan: r["Hypercare Plan"] || null,
      commsPlan: r["Comms Plan"] || null,
      trainingStatus: r["Training Status"] || null,
      // Omit supportBriefed — column absent in V0.5/V0.6 Releases; leave DB values as-is
      releaseHealth: r["Release Health"] || null,
      sourceOrder: sourceIndex + 1,
    };

    let releaseId = releaseIdByCode.get(r["Release ID"]);
    if (releaseId) {
      await prisma.release.update({ where: { id: releaseId }, data });
    } else {
      const release = await prisma.release.create({
        data: { releaseCode: r["Release ID"], ...data },
      });
      releaseId = release.id;
      releaseIdByCode.set(r["Release ID"], releaseId);
      console.log("+ release", r["Release ID"]);
    }

    await prisma.releaseApplication.deleteMany({ where: { releaseId } });
    await prisma.releaseStakeholder.deleteMany({ where: { releaseId } });

    const appId = resolveAppId(String(r["Application"] ?? ""), appIdByName);
    if (appId) {
      const existingLink = await prisma.releaseApplication.findFirst({
        where: { releaseId, applicationId: appId },
      });
      if (!existingLink) {
        await prisma.releaseApplication.create({
          data: { releaseId, applicationId: appId },
        });
      }
    }

    for (const sid of splitIds(r["Stakeholder IDs"])) {
      const suDbId = userDbIdByUserId.get(sid);
      if (!suDbId) continue;
      const existingStakeholder = await prisma.releaseStakeholder.findFirst({
        where: { releaseId, userId: suDbId },
      });
      if (!existingStakeholder) {
        await prisma.releaseStakeholder.create({
          data: { releaseId, userId: suDbId },
        });
      }
    }
  }

  const releaseCodes = releases.map((r: Record<string, unknown>) => String(r["Release ID"]));
  await prisma.release.deleteMany({ where: { releaseCode: { notIn: releaseCodes } } });

  console.log("releases done");
  // Dependencies
  await prisma.releaseDependency.deleteMany({});
  for (const [sourceIndex, d] of DATA("dependencies.json").entries()) {
    const releaseId = releaseIdByCode.get(d["Release ID"]);
    const dependsOnReleaseId = releaseIdByCode.get(d["Depends On Release"]);
    if (!releaseId || !dependsOnReleaseId) continue;
    const depData = {
      dependencyType: d["Dependency Type"],
      status: d["Status"],
      impactIfBlocked: d["Impact if Blocked"],
      notes: d["Notes"],
      dependencyCode: String(d["Dep ID"]),
      sourceOrder: sourceIndex + 1,
    };
    await upsertByCode(
      () =>
        prisma.releaseDependency.findFirst({
          where: { releaseId, dependsOnReleaseId },
        }),
      () =>
        prisma.releaseDependency.create({
          data: { releaseId, dependsOnReleaseId, ...depData },
        }),
      (id) => prisma.releaseDependency.update({ where: { id }, data: depData })
    );
  }

  console.log("dependencies done");
  // Env bookings
  const bookingRows = DATA("env_booking.json");
  for (const [sourceIndex, b] of bookingRows.entries()) {
    if (!String(b["Booking ID"] ?? "").startsWith("ENV-")) continue;
    const applicationId = resolveAppId(String(b["Application"] ?? ""), appIdByName);
    if (!applicationId) {
      console.warn("skip booking app", b["Booking ID"], b["Application"]);
      continue;
    }
    const releaseId = releaseIdByCode.get(b["Release ID"]) ?? null;
    const legDates = [b["Test Start"], b["Test End"], b["UAT Start"], b["UAT End"], b["Pre-Prod Start"], b["Pre-Prod End"]]
      .map(toDate)
      .filter(Boolean) as Date[];
    const prodDate = toDate(b["Prod Release Date"]) ?? new Date();
    const fromDate = legDates.length ? new Date(Math.min(...legDates.map((d) => d.getTime()))) : prodDate;
    const toDt = legDates.length ? new Date(Math.max(...legDates.map((d) => d.getTime()))) : prodDate;
    const bookingCode = String(b["Booking ID"]);
    const testEnvName = b["Test Env"] ? String(b["Test Env"]) : null;
    const environmentId = testEnvName
      ? envIdByAppEnv.get(`${applicationId}::${testEnvName}`) ??
        envIdByAppEnv.get(`${applicationId}::${testEnvName.toUpperCase()}`) ??
        null
      : null;
    const data = {
      applicationId,
      environmentId,
      bookedBy: "Unknown",
      team: String(b["Department"] ?? "Unknown"),
      departmentName: b["Department"] ? String(b["Department"]) : null,
      fromDate,
      toDate: toDt,
      releaseId,
      dependencies: b["Dependencies"] ? String(b["Dependencies"]) : null,
      purpose: b["Notes"] ? String(b["Notes"]) : null,
      releaseSize: b["Release Size"] ? String(b["Release Size"]) : null,
      prodReleaseDate: toDate(b["Prod Release Date"]),
      cabDate: toDate(b["CAB Date"]),
      testEnvCode: testEnvName,
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
    // Live rows were seeded without bookingCode — match by code first, then by releaseId.
    const existing =
      (await prisma.envBooking.findUnique({ where: { bookingCode } })) ??
      (releaseId
        ? await prisma.envBooking.findFirst({ where: { releaseId, bookingCode: null } })
        : null) ??
      (releaseId ? await prisma.envBooking.findFirst({ where: { releaseId } }) : null);
    if (existing) {
      await prisma.envBooking.update({
        where: { id: existing.id },
        data: { bookingCode, ...data },
      });
    } else {
      await prisma.envBooking.create({ data: { bookingCode, ...data } });
      console.log("+ booking", bookingCode);
    }
  }
  const bookingCodes = bookingRows.map((b: Record<string, unknown>) => String(b["Booking ID"]));
  await prisma.envBooking.deleteMany({
    where: { OR: [{ bookingCode: null }, { bookingCode: { notIn: bookingCodes } }] },
  });

  console.log("env bookings done");
  // Risks
  const riskRows = DATA("risk.json");
  for (const [sourceIndex, r] of riskRows.entries()) {
    const releaseId = releaseIdByCode.get(r["Release ID"]);
    if (!releaseId) continue;
    const riskOwnerId = r["Risk Owner ID"] ? userDbIdByUserId.get(r["Risk Owner ID"]) : undefined;
    const data = {
      releaseId,
      applicationName: r["Application"] ? String(r["Application"]) : null,
      departmentName: r["Department"] ? String(r["Department"]) : null,
      category: String(r["Risk Category"]),
      description: String(r["Risk Description"]),
      likelihood: Number(r["Likelihood"]),
      impact: Number(r["Impact"]),
      riskScore: Number(r["Risk Score"]),
      affectedArea: r["Affected Area"] ? String(r["Affected Area"]) : null,
      mitigationStrategy: r["Mitigation Strategy"] ? String(r["Mitigation Strategy"]) : null,
      riskOwnerId: riskOwnerId ?? null,
      status: String(r["Status"]),
      notes: r["Notes"] ? String(r["Notes"]) : null,
      sourceOrder: sourceIndex + 1,
    };
    await upsertByCode(
      () => prisma.risk.findFirst({ where: { riskCode: String(r["Risk ID"]) } }),
      () => prisma.risk.create({ data: { riskCode: r["Risk ID"], ...data } }),
      (id) => prisma.risk.update({ where: { id }, data })
    );
  }
  await prisma.risk.deleteMany({
    where: { riskCode: { notIn: riskRows.map((r: Record<string, unknown>) => String(r["Risk ID"])) } },
  });

  console.log("risks done");
  // Drift
  const driftRows = DATA("drift.json");
  for (const [sourceIndex, d] of driftRows.entries()) {
    const releaseId = releaseIdByCode.get(d["Release ID"]);
    const applicationId = resolveAppId(String(d["Application"] ?? ""), appIdByName);
    if (!releaseId || !applicationId) continue;
    const data = {
      releaseId,
      applicationId,
      departmentName: d["Department"] ? String(d["Department"]) : null,
      environmentName: String(d["Environment"]),
      driftType: String(d["Drift Type:"]),
      driftCategory: d["Drift Category"] ? String(d["Drift Category"]) : null,
      detectedDate: toDate(d["Detected Date"])!,
      severity: String(d["Severity"]),
      description: String(d["Description"]),
      impactOnRelease: d["Impact on Release"] ? String(d["Impact on Release"]) : null,
      remediationAction: d["Remediation Action"] ? String(d["Remediation Action"]) : null,
      status: String(d["Status"]),
      etaToFix: toDate(d["ETA to Fix"]),
      sourceOrder: sourceIndex + 1,
    };
    await upsertByCode(
      () => prisma.drift.findFirst({ where: { driftCode: String(d["Drift ID"]) } }),
      () => prisma.drift.create({ data: { driftCode: d["Drift ID"], ...data } }),
      (id) => prisma.drift.update({ where: { id }, data })
    );
  }
  await prisma.drift.deleteMany({
    where: { driftCode: { notIn: driftRows.map((d: Record<string, unknown>) => String(d["Drift ID"])) } },
  });

  console.log("drift done");
  // Approvals
  const approvalRows = DATA("approvals.json");
  for (const [sourceIndex, a] of approvalRows.entries()) {
    const releaseId = releaseIdByCode.get(a["Release ID"]);
    const approverId = userDbIdByUserId.get(a["Approver ID"]);
    if (!releaseId || !approverId) continue;
    const data = {
      releaseId,
      applicationName: a["Application"] ? String(a["Application"]) : null,
      departmentName: a["Department"] ? String(a["Department"]) : null,
      approvalType: String(a["Approval Type"]),
      approverId,
      submittedDate: toDate(a["Submitted Date"])!,
      decisionDate: toDate(a["Decision Date"]),
      decision: a["Decision"] ? String(a["Decision"]) : "Pending",
      comments: a["Comments"] ? String(a["Comments"]) : null,
      cabMeetingId: a["CAB Meeting ID"] ? String(a["CAB Meeting ID"]) : null,
      sourceOrder: sourceIndex + 1,
    };
    await upsertByCode(
      () => prisma.approval.findFirst({ where: { approvalCode: String(a["Approval ID"]) } }),
      () => prisma.approval.create({ data: { approvalCode: a["Approval ID"], ...data } }),
      (id) => prisma.approval.update({ where: { id }, data })
    );
  }
  await prisma.approval.deleteMany({
    where: {
      approvalCode: {
        notIn: approvalRows.map((a: Record<string, unknown>) => String(a["Approval ID"])),
      },
    },
  });

  console.log("approvals done");
  // Leave
  const leaveRows = DATA("leave_calendar.json");
  for (const [sourceIndex, l] of leaveRows.entries()) {
    const userId = userDbIdByUserId.get(l["User ID"]);
    if (!userId) continue;
    const data = {
      userId,
      leaveStart: toDate(l["Leave Start"])!,
      leaveEnd: toDate(l["Leave End"])!,
      leaveType: String(l["Leave Type"]),
      days: Number(l["Days"]),
      riskImpact: l["Risk Impact"] ? String(l["Risk Impact"]) : null,
      riskScore: Number(l["Risk Score"] ?? 0),
      sourceOrder: sourceIndex + 1,
    };
    const leave = await upsertByCode(
      () => prisma.leaveRecord.findFirst({ where: { leaveCode: String(l["Leave ID"]) } }),
      () => prisma.leaveRecord.create({ data: { leaveCode: l["Leave ID"], ...data } }),
      (id) => prisma.leaveRecord.update({ where: { id }, data })
    );
    await prisma.leaveRecordRelease.deleteMany({ where: { leaveRecordId: leave.id } });
    for (const relCode of splitIds(l["Affected Release"])) {
      const releaseId = releaseIdByCode.get(relCode);
      if (!releaseId) continue;
      const existingLeaveRel = await prisma.leaveRecordRelease.findFirst({
        where: { leaveRecordId: leave.id, releaseId },
      });
      if (!existingLeaveRel) {
        await prisma.leaveRecordRelease.create({
          data: { leaveRecordId: leave.id, releaseId },
        });
      }
    }
  }
  await prisma.leaveRecord.deleteMany({
    where: {
      leaveCode: { notIn: leaveRows.map((l: Record<string, unknown>) => String(l["Leave ID"])) },
    },
  });

  console.log("leave done");
  // Calendar — replace all seeded events to match Excel exactly (count + Application)
  // Live DB requires organizationId (v2 column not in current Prisma schema).
  await prisma.$executeRawUnsafe(`DELETE FROM "CalendarEvent"`);
  for (const [sourceIndex, c] of DATA("calendar.json").entries()) {
    const releaseId = c["Release ID"] ? releaseIdByCode.get(c["Release ID"]) ?? null : null;
    await prisma.$executeRawUnsafe(
      `INSERT INTO "CalendarEvent"
        (id, date, "eventType", "releaseId", title, "applicationName", "departmentName", "sizeImpact", notes, "organizationId", "sourceOrder", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())`,
      cryptoRandomId(),
      toDate(c["Date"]),
      String(c["Event Type"]),
      releaseId,
      String(c["Release Name"] ?? c["Event Type"]),
      c["Application"] ? String(c["Application"]) : null,
      c["Department"] ? String(c["Department"]) : null,
      c["Size/Impact"] ? String(c["Size/Impact"]) : null,
      c["Notes"] ? String(c["Notes"]) : null,
      organizationId,
      sourceIndex + 1
    );
  }
  console.log("Calendar Events replaced:", DATA("calendar.json").length);

  // Versions — upsert by app+env+version is hard; ensure count by recreate missing
  const versionRows = DATA("versions.json");
  const versionIds: string[] = [];
  for (const [sourceIndex, v] of versionRows.entries()) {
    const applicationId = resolveAppId(String(v["Application"] ?? ""), appIdByName);
    if (!applicationId) continue;
    const environmentId =
      envIdByAppEnv.get(`${applicationId}::${v["Environment"]}`) ??
      envIdByAppEnv.get(`${applicationId}::${String(v["Environment"]).toUpperCase()}`);
    if (!environmentId) continue;
    const existing = await prisma.environmentVersion.findFirst({
      where: {
        applicationId,
        environmentId,
        version: String(v["Version"]),
      },
    });
    const data = {
      appCode: v["App ID"] ? String(v["App ID"]) : null,
      updatedBy: v["Deployed By"] ? String(v["Deployed By"]) : null,
      buildNumber: v["Build Number"] ? String(v["Build Number"]) : null,
      deployDate: toDate(v["Deploy Date"]),
      status: v["Status"] ? String(v["Status"]) : null,
      notes: v["Notes"] ? String(v["Notes"]) : null,
      sourceOrder: sourceIndex + 1,
    };
    if (existing) {
      await prisma.environmentVersion.update({ where: { id: existing.id }, data });
      versionIds.push(existing.id);
    } else {
      const created = await prisma.environmentVersion.create({
        data: {
          applicationId,
          environmentId,
          version: String(v["Version"]),
          ...data,
        },
      });
      versionIds.push(created.id);
    }
  }
  await prisma.environmentVersion.deleteMany({ where: { id: { notIn: versionIds } } });

  // Incidents
  const incidentRows = DATA("incidents.json");
  for (const [sourceIndex, i] of incidentRows.entries()) {
    const applicationId = resolveAppId(String(i["Application"] ?? ""), appIdByName);
    if (!applicationId) {
      console.warn("skip incident app", i["Incident ID"], i["Application"]);
      continue;
    }
    const data = {
      timestamp: toDate(i["Timestamp"])!,
      applicationId,
      departmentName: i["Department"] ? String(i["Department"]) : null,
      severity: String(i["Severity"]),
      title: String(i["Title"]),
      status: String(i["Status"]),
      impact: String(i["Impact"]),
      assignedTo: i["Assigned To"] ? String(i["Assigned To"]) : null,
      relatedReleaseCode: i["Related Release"] ? String(i["Related Release"]) : null,
      environmentName: String(i["Environment"] ?? ""),
      sourceOrder: sourceIndex + 1,
    };
    await upsertByCode(
      () => prisma.incident.findFirst({ where: { incidentCode: String(i["Incident ID"]) } }),
      () => prisma.incident.create({ data: { incidentCode: i["Incident ID"], ...data } }),
      (id) => prisma.incident.update({ where: { id }, data })
    );
  }
  await prisma.incident.deleteMany({
    where: {
      incidentCode: {
        notIn: incidentRows.map((i: Record<string, unknown>) => String(i["Incident ID"])),
      },
    },
  });

  // Monitoring alerts
  const alertRows = DATA("monitoring-alerts.json");
  for (const [sourceIndex, a] of alertRows.entries()) {
    const applicationId = resolveAppId(String(a["Application"] ?? ""), appIdByName);
    if (!applicationId) continue;
    const data = {
      timestamp: toDate(a["Timestamp"])!,
      applicationId,
      departmentName: a["Department"] ? String(a["Department"]) : null,
      alertType: String(a["Alert Type"]),
      severity: String(a["Severity"]),
      metric: String(a["Metric"]),
      threshold: a["Threshold"] != null ? String(a["Threshold"]) : null,
      currentValue: a["Current Value"] != null ? String(a["Current Value"]) : null,
      status: String(a["Status"]),
      assignedTo: a["Assigned To"] ? String(a["Assigned To"]) : null,
      environmentName: String(a["Environment"] ?? ""),
      sourceOrder: sourceIndex + 1,
    };
    await upsertByCode(
      () => prisma.monitoringAlert.findFirst({ where: { alertCode: String(a["Alert ID"]) } }),
      () => prisma.monitoringAlert.create({ data: { alertCode: a["Alert ID"], ...data } }),
      (id) => prisma.monitoringAlert.update({ where: { id }, data })
    );
  }
  await prisma.monitoringAlert.deleteMany({
    where: {
      alertCode: { notIn: alertRows.map((a: Record<string, unknown>) => String(a["Alert ID"])) },
    },
  });

  // Application status — replace to match Excel 36 Prod/UAT/Test/Dev rows
  await prisma.applicationStatus.deleteMany({});
  for (const [sourceIndex, s] of DATA("application-status.json").entries()) {
    const applicationId = resolveAppId(String(s["Application"] ?? ""), appIdByName);
    if (!applicationId) {
      console.warn("skip app status", s["Application"]);
      continue;
    }
    const uptime = toFloat(s["Uptime %"]);
    await prisma.applicationStatus.create({
      data: {
        applicationId,
        environmentName: String(s["Environment"]),
        status: String(s["Status"]),
        lastCheck: toDate(s["Last Check"]) ?? new Date(),
        uptimePercent: (() => {
          const uptime = toFloat(s["Uptime %"]);
          if (uptime == null) return null;
          // Excel may store 98.5 or 0.985 — normalize to percent 0-100
          return uptime <= 1 ? uptime * 100 : uptime;
        })(),
        notes: s["Notes"] ? String(s["Notes"]) : null,
        sourceOrder: sourceIndex + 1,
      },
    });
  }
  console.log("ApplicationStatus replaced:", DATA("application-status.json").length);

  // Planned maintenance
  const maintenanceRows = DATA("planned-maintenance.json");
  for (const [sourceIndex, m] of maintenanceRows.entries()) {
    const appName = String(m["Application(s)"] ?? "").split(",")[0]?.trim();
    const applicationId = appName ? resolveAppId(appName, appIdByName) : null;
    const data = {
      scheduledDate: toDate(m["Scheduled Date"])!,
      startTime: String(m["Start Time"] ?? ""),
      endTime: String(m["End Time"] ?? ""),
      type: String(m["Type"]),
      applicationId: applicationId ?? null,
      environmentName: String(m["Environment(s)"] ?? "").split(",")[0]?.trim() || "Prod",
      departmentName: m["Department"] ? String(m["Department"]) : null,
      impact: String(m["Impact"] ?? ""),
      requestor: m["Requestor"] ? String(m["Requestor"]) : null,
      approvalStatus: String(m["Approval Status"] ?? ""),
      notes: m["Notes"] ? String(m["Notes"]) : null,
      sourceOrder: sourceIndex + 1,
    };
    await upsertByCode(
      () =>
        prisma.plannedMaintenance.findFirst({
          where: { maintenanceCode: String(m["Maintenance ID"]) },
        }),
      () =>
        prisma.plannedMaintenance.create({
          data: { maintenanceCode: m["Maintenance ID"], ...data },
        }),
      (id) => prisma.plannedMaintenance.update({ where: { id }, data })
    );
  }
  await prisma.plannedMaintenance.deleteMany({
    where: {
      maintenanceCode: {
        notIn: maintenanceRows.map((m: Record<string, unknown>) => String(m["Maintenance ID"])),
      },
    },
  });

  // Environment Conflicts — full workbook snapshot.
  const conflictRows = DATA("conflicts.json");
  await prisma.environmentConflict.deleteMany({});
  await prisma.environmentConflict.createMany({
    data: conflictRows.map((c: Record<string, unknown>, sourceIndex: number) => ({
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

  // Blockers — full workbook snapshot.
  const blockerRows = DATA("blockers.json");
  await prisma.blocker.deleteMany({});
  await prisma.blocker.createMany({
    data: blockerRows.map((b: Record<string, unknown>, sourceIndex: number) => ({
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

  // System Mapping source sections — preserve the workbook tables and rebuild graph edges.
  const coreRows = DATA("system-core.json");
  await prisma.systemCoreRecord.deleteMany({});
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
  await prisma.systemMatrixRow.deleteMany({});
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

  const integrationRows = DATA("integration-flows.json");
  await prisma.integrationFlow.deleteMany({});
  await prisma.integrationFlow.createMany({
    data: integrationRows.map((r: Record<string, unknown>, sourceIndex: number) => ({
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

  // Risk factors — upsert 44 catalog rows from Excel
  let rfOrder = 0;
  for (const f of DATA("risk_factors.json")) {
    rfOrder++;
    const existing = await prisma.riskFactor.findFirst({
      where: { factorName: String(f["Factor Name"]), category: String(f["Category"]) },
    });
    const data = {
      category: String(f["Category"]),
      factorName: String(f["Factor Name"]),
      weight: Number(f["Weight"]),
      description: f["Description"] ? String(f["Description"]) : null,
      active: true,
      order: rfOrder,
    };
    if (existing) await prisma.riskFactor.update({ where: { id: existing.id }, data });
    else await prisma.riskFactor.create({ data });
  }
  console.log("RiskFactors upserted:", DATA("risk_factors.json").length);

  // Reference data — drift_type (legacy) + Excel catalog sections (additive upsert)
  async function upsertReferenceRows(
    rows: { category: string; value: string; sortOrder: number }[]
  ) {
    for (const r of rows) {
      await upsertByCode(
        () =>
          prisma.referenceData.findFirst({
            where: { category: r.category, value: r.value },
          }),
        () => prisma.referenceData.create({ data: { ...r, active: true } }),
        (id) =>
          prisma.referenceData.update({
            where: { id },
            data: { sortOrder: r.sortOrder, active: true },
          })
      );
    }
  }

  await upsertReferenceRows(
    ["Infrastructure", "Configuration", "Data", "Integration", "Security"].map((v, i) => ({
      category: "drift_type",
      value: v,
      sortOrder: i + 1,
    }))
  );

  const refCatalogPath = path.join(DATA_DIR, "reference_data.json");
  if (fs.existsSync(refCatalogPath)) {
    const catalog = DATA("reference_data.json") as {
      category: string;
      value: string;
      sortOrder: number;
    }[];
    await upsertReferenceRows(catalog);
    console.log("ReferenceData catalog upserted:", catalog.length);
  } else {
    console.warn("reference_data.json missing — skipped Excel catalog sections");
  }

  // Final counts
  const counts = {
    Department: await prisma.department.count(),
    Application: await prisma.application.count(),
    Environment: await prisma.environment.count(),
    EnvironmentVersion: await prisma.environmentVersion.count(),
    User: await prisma.user.count(),
    Release: await prisma.release.count(),
    CalendarEvent: await prisma.calendarEvent.count(),
    EnvBooking: await prisma.envBooking.count(),
    Risk: await prisma.risk.count(),
    RiskFactor: await prisma.riskFactor.count(),
    Drift: await prisma.drift.count(),
    Approval: await prisma.approval.count(),
    LeaveRecord: await prisma.leaveRecord.count(),
    MonitoringAlert: await prisma.monitoringAlert.count(),
    Incident: await prisma.incident.count(),
    ApplicationStatus: await prisma.applicationStatus.count(),
    PlannedMaintenance: await prisma.plannedMaintenance.count(),
    ReferenceData: await prisma.referenceData.count(),
    ReleaseDependency: await prisma.releaseDependency.count(),
    EnvironmentConflict: await prisma.environmentConflict.count(),
    Blocker: await prisma.blocker.count(),
    SystemCoreRecord: await prisma.systemCoreRecord.count(),
    SystemMatrixRow: await prisma.systemMatrixRow.count(),
    IntegrationFlow: await prisma.integrationFlow.count(),
  };
  console.log("FINAL COUNTS", JSON.stringify(counts, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
