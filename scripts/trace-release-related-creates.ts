/**
 * Same-record trace for Release-page related creates.
 * Creates one of each entity type using the same fields the Release page forms
 * POST, then re-reads via the same list filters those sections use.
 *
 * Run: npx tsx scripts/trace-release-related-creates.ts
 */
import "@/lib/load-db-env-for-tests";
import { prisma } from "@/lib/prisma";
import { manualAlertCreateFields } from "@/lib/alert-source";
import { createApprovalRow, createRiskRow } from "@/lib/org-compat";
import { filterSeedDependencies } from "@/lib/dependency-view";
import { filterSeedConflicts } from "@/lib/conflict-view";

async function nextCode(
  rows: { code: string }[],
  prefix: string,
  pad: number
): Promise<string> {
  const next =
    rows.reduce((max, row) => {
      const match = row.code.match(new RegExp(`^${prefix}-(\\d+)$`, "i"));
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0) + 1;
  return `${prefix}-${String(next).padStart(pad, "0")}`;
}

async function main(): Promise<void> {
  const created: {
    dependencyId?: string;
    riskId?: string;
    incidentId?: string;
    alertId?: string;
    approvalId?: string;
    conflictId?: string;
  } = {};

  try {
    const releases = await prisma.release.findMany({
      where: { status: { notIn: ["Ready to deploy", "Deploying", "Deployed", "Closed"] } },
      include: { applications: { select: { applicationId: true } } },
      take: 8,
      orderBy: { releaseCode: "asc" },
    });
    const withApp = releases.filter((r) => r.applications[0]);
    const primary = withApp[0];
    if (!primary) throw new Error("Need a release with an application for the trace");
    const existingDepEnds = new Set(
      (
        await prisma.releaseDependency.findMany({
          where: { releaseId: primary.id },
          select: { dependsOnReleaseId: true },
        })
      ).map((row) => row.dependsOnReleaseId)
    );
    const other = withApp.find((r) => r.id !== primary.id && !existingDepEnds.has(r.id));
    if (!other) throw new Error("Need a second unlinked release for the dependency/conflict trace");
    const applicationId = primary.applications[0]!.applicationId;
    const user = await prisma.user.findFirst({ select: { id: true } });
    if (!user) throw new Error("Need a user for approval/risk owner");

    const depCode = await nextCode(
      (await prisma.releaseDependency.findMany({ select: { dependencyCode: true } })).map(
        (r) => ({ code: r.dependencyCode ?? "" })
      ),
      "DEP",
      3
    );
    const dep = await prisma.releaseDependency.create({
      data: {
        dependencyCode: depCode,
        releaseId: primary.id,
        dependsOnReleaseId: other.id,
        dependencyType: "Hard",
        status: "Pending",
        impactIfBlocked: "Release Delay",
        notes: "release-page-trace",
      },
      include: {
        release: { select: { id: true, releaseCode: true, name: true } },
        dependsOnRelease: { select: { id: true, releaseCode: true, name: true } },
      },
    });
    created.dependencyId = dep.id;
    const depList = filterSeedDependencies(
      [
        {
          id: dep.id,
          depCode: dep.dependencyCode ?? "",
          releaseCode: dep.release.releaseCode,
          releaseName: dep.release.name,
          releaseDbId: dep.release.id,
          dependsOnCode: dep.dependsOnRelease.releaseCode,
          dependsOnName: dep.dependsOnRelease.name,
          dependsOnDbId: dep.dependsOnRelease.id,
          dependencyType: dep.dependencyType ?? "",
          status: dep.status ?? "",
          impactIfBlocked: dep.impactIfBlocked ?? "",
          notes: dep.notes,
        },
      ],
      { linkedReleaseQ: primary.releaseCode }
    );
    if (!depList.some((row) => row.id === dep.id)) {
      throw new Error("Dependency did not appear on linked-release filter");
    }

    const riskCode = await nextCode(
      (await prisma.risk.findMany({ select: { riskCode: true } })).map((r) => ({
        code: r.riskCode,
      })),
      "RSK",
      3
    );
    const risk = await createRiskRow({
      riskCode,
      releaseId: primary.id,
      category: "Technical",
      description: "release-page-trace",
      likelihood: 2,
      impact: 2,
      status: "Identified",
      applicationName: "trace",
      departmentName: "trace",
    });
    created.riskId = risk.id;
    const riskHit = await prisma.risk.findFirst({
      where: { id: risk.id, releaseId: primary.id },
      select: { id: true },
    });
    if (!riskHit) throw new Error("Risk did not appear on releaseId filter");

    const incidentCode = await nextCode(
      (await prisma.incident.findMany({ select: { incidentCode: true } })).map((r) => ({
        code: r.incidentCode,
      })),
      "INC",
      3
    );
    const incident = await prisma.incident.create({
      data: {
        incidentCode,
        timestamp: new Date(),
        applicationId,
        severity: "P2 - High",
        title: "release-page-trace",
        status: "Active",
        impact: "Degraded",
        relatedReleaseCode: primary.releaseCode,
        environmentName: "UAT",
      },
    });
    created.incidentId = incident.id;
    const incidentHit = await prisma.incident.findFirst({
      where: { id: incident.id, relatedReleaseCode: primary.releaseCode },
      select: { id: true },
    });
    if (!incidentHit) throw new Error("Incident did not appear on relatedReleaseCode filter");

    const alertCode = await nextCode(
      (await prisma.monitoringAlert.findMany({ select: { alertCode: true } })).map((r) => ({
        code: r.alertCode,
      })),
      "ALT",
      3
    );
    const source = manualAlertCreateFields();
    const alert = await prisma.monitoringAlert.create({
      data: {
        alertCode,
        timestamp: new Date(),
        applicationId,
        alertType: "Warning",
        severity: "Warning",
        metric: "release-page-trace",
        status: "Pending",
        environmentName: "UAT",
        autoGenerated: source.autoGenerated,
        alertSource: source.alertSource,
      },
    });
    created.alertId = alert.id;
    if (alert.autoGenerated !== false || alert.alertSource !== "Manual") {
      throw new Error("Manual alert source fields were not persisted");
    }
    const alertHit = await prisma.monitoringAlert.findFirst({
      where: { id: alert.id, applicationId },
      select: { id: true, autoGenerated: true, alertSource: true },
    });
    if (!alertHit) throw new Error("Alert did not appear on application filter");

    const approvalCode = await nextCode(
      (await prisma.approval.findMany({ select: { approvalCode: true } })).map((r) => ({
        code: r.approvalCode,
      })),
      "APR",
      4
    );
    const approval = await createApprovalRow({
      approvalCode,
      releaseId: primary.id,
      approvalType: "CAB Final",
      approverId: user.id,
      submittedDate: new Date(),
      decision: "Pending",
    });
    created.approvalId = approval.id;
    const approvalHit = await prisma.approval.findFirst({
      where: { id: approval.id, releaseId: primary.id },
      select: { id: true },
    });
    if (!approvalHit) throw new Error("Approval did not appear on releaseId filter");

    const conflictCode = await nextCode(
      (await prisma.environmentConflict.findMany({ select: { conflictCode: true } })).map((r) => ({
        code: r.conflictCode,
      })),
      "CNF",
      4
    );
    const conflict = await prisma.environmentConflict.create({
      data: {
        conflictCode,
        status: "Detected",
        priority: "P2 - High",
        release1Code: primary.releaseCode,
        release2Code: other.releaseCode,
        applicationName: "trace",
        departmentName: "trace",
        conflictingEnvironment: "UAT",
        environmentConflictType: "Schedule",
        notes: "release-page-trace",
        sourceOrder: 99999,
      },
    });
    created.conflictId = conflict.id;
    const conflictList = filterSeedConflicts(
      [
        {
          id: conflict.id,
          conflictCode: conflict.conflictCode,
          status: conflict.status,
          priority: conflict.priority,
          assignedTo: "",
          release1Code: conflict.release1Code,
          release2Code: conflict.release2Code,
          release1DbId: primary.id,
          release2DbId: other.id,
          application: conflict.applicationName,
          department: conflict.departmentName,
          conflictingEnvironment: conflict.conflictingEnvironment,
          environmentConflictType: conflict.environmentConflictType,
          notes: conflict.notes,
        },
      ],
      { eitherReleaseQ: primary.releaseCode }
    );
    if (!conflictList.some((row) => row.id === conflict.id)) {
      throw new Error("Conflict did not appear on either-release filter");
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          releaseId: primary.id,
          releaseCode: primary.releaseCode,
          sameRecord: {
            dependency: created.dependencyId,
            risk: created.riskId,
            incident: created.incidentId,
            alert: created.alertId,
            approval: created.approvalId,
            conflict: created.conflictId,
          },
        },
        null,
        2
      )
    );
  } finally {
    if (created.dependencyId) {
      await prisma.releaseDependency.delete({ where: { id: created.dependencyId } }).catch(() => undefined);
    }
    if (created.riskId) {
      await prisma.risk.delete({ where: { id: created.riskId } }).catch(() => undefined);
    }
    if (created.incidentId) {
      await prisma.incident.delete({ where: { id: created.incidentId } }).catch(() => undefined);
    }
    if (created.alertId) {
      await prisma.monitoringAlert.delete({ where: { id: created.alertId } }).catch(() => undefined);
    }
    if (created.approvalId) {
      await prisma.approval.delete({ where: { id: created.approvalId } }).catch(() => undefined);
    }
    if (created.conflictId) {
      await prisma.environmentConflict.delete({ where: { id: created.conflictId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[trace-release-related-creates] failed", {
    message: err instanceof Error ? err.message : "unknown",
  });
  process.exitCode = 1;
});
