/**
 * Batch 2 proof: create/verify/restore Risk, Drift, Approval, Leave,
 * and EnvironmentVersion records against the real database.
 *
 * Run: npx tsx scripts/verify-batch2-create-confirm.ts
 */
import { prisma } from "../lib/prisma";
import {
  createApprovalRow,
  createDriftRow,
  createEnvironmentVersionRow,
  createLeaveRow,
  createRiskRow,
  getDefaultOrganizationId,
} from "../lib/org-compat";

const stamp = Date.now();
const marker = `batch2-proof-${stamp}`;

const createdIds: {
  risk?: string;
  drift?: string;
  approval?: string;
  leave?: string;
  version?: string;
  environment?: string;
} = {};

async function nextOrder(model: {
  aggregate: (args: { _max: { sourceOrder: true } }) => Promise<{ _max: { sourceOrder: number | null } }>;
}): Promise<number> {
  const result = await model.aggregate({ _max: { sourceOrder: true } });
  return (result._max.sourceOrder ?? 0) + 1;
}

async function assertOrganization(table: string, id: string, expected: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ organizationId: string }>>(
    `SELECT "organizationId" FROM "${table}" WHERE id = $1`,
    id
  );
  if (rows[0]?.organizationId !== expected) {
    throw new Error(`${table} organizationId was not persisted correctly`);
  }
}

async function main() {
  const [release, application, user] = await Promise.all([
    prisma.release.findFirst({ orderBy: { releaseCode: "asc" } }),
    prisma.application.findFirst({ orderBy: { name: "asc" } }),
    prisma.user.findFirst({ orderBy: { name: "asc" } }),
  ]);
  if (!release || !application || !user) {
    throw new Error("Proof needs at least one release, application, and user");
  }

  const organizationId = await getDefaultOrganizationId();
  if (!organizationId) throw new Error("Proof requires the live organization-aware schema");

  const risk = await createRiskRow({
      riskCode: `RSK-PROOF-${stamp}`,
      releaseId: release.id,
      applicationName: application.name,
      category: "Technical",
      description: marker,
      likelihood: 2,
      impact: 3,
      riskOwnerId: user.id,
      status: "Open",
      sourceOrder: await nextOrder(prisma.risk),
  });
  createdIds.risk = risk.id;
  const persistedRisk = await prisma.risk.findUnique({ where: { id: risk.id } });
  if (persistedRisk?.description !== marker) throw new Error("Risk did not persist");
  await assertOrganization("Risk", risk.id, organizationId);
  console.log(`OK risk ${risk.riskCode} id=${risk.id}`);

  const driftType =
    (
      await prisma.referenceData.findFirst({
        where: { category: "drift_type", active: true },
        orderBy: { sortOrder: "asc" },
      })
    )?.value ?? "Configuration";
  const drift = await createDriftRow({
      driftCode: `DRF-PROOF-${stamp}`,
      releaseId: release.id,
      applicationId: application.id,
      departmentName: "Proof",
      environmentName: "Test",
      driftType,
      detectedDate: new Date(),
      severity: "Medium",
      description: marker,
      status: "Open",
      sourceOrder: await nextOrder(prisma.drift),
  });
  createdIds.drift = drift.id;
  const persistedDrift = await prisma.drift.findUnique({ where: { id: drift.id } });
  if (persistedDrift?.description !== marker) throw new Error("Drift did not persist");
  await assertOrganization("Drift", drift.id, organizationId);
  console.log(`OK drift ${drift.driftCode} id=${drift.id}`);

  const approval = await createApprovalRow({
      approvalCode: `APR-PROOF-${stamp}`,
      releaseId: release.id,
      applicationName: application.name,
      approvalType: "CAB",
      approverId: user.id,
      submittedDate: new Date(),
      decision: "Pending",
      comments: marker,
      sourceOrder: await nextOrder(prisma.approval),
  });
  createdIds.approval = approval.id;
  const persistedApproval = await prisma.approval.findUnique({ where: { id: approval.id } });
  if (persistedApproval?.comments !== marker) throw new Error("Approval did not persist");
  await assertOrganization("Approval", approval.id, organizationId);
  console.log(`OK approval ${approval.approvalCode} id=${approval.id}`);

  const leave = await createLeaveRow({
      leaveCode: `LEV-PROOF-${stamp}`,
      userId: user.id,
      leaveStart: new Date(),
      leaveEnd: new Date(),
      leaveType: "Annual Leave",
      days: 1,
      riskImpact: marker,
      riskScore: 1,
      sourceOrder: await nextOrder(prisma.leaveRecord),
      releaseIds: [release.id],
  });
  createdIds.leave = leave.id;
  const persistedLeave = await prisma.leaveRecord.findUnique({ where: { id: leave.id } });
  if (persistedLeave?.riskImpact !== marker) throw new Error("Leave did not persist");
  await assertOrganization("LeaveRecord", leave.id, organizationId);
  console.log(`OK leave ${leave.leaveCode} id=${leave.id}`);

  const environment = await prisma.environment.create({
    data: {
      applicationId: application.id,
      name: `Proof-${stamp}`,
      type: "Test",
      owner: "Batch 2 Proof",
      status: "Active",
    },
  });
  createdIds.environment = environment.id;
  const version = await createEnvironmentVersionRow({
      applicationId: application.id,
      environmentId: environment.id,
      version: "proof-1.0.0",
      buildNumber: String(stamp),
      deployDate: new Date(),
      updatedBy: "Batch 2 Proof",
      status: "Current",
      notes: marker,
      sourceOrder: await nextOrder(prisma.environmentVersion),
  });
  createdIds.version = version.id;
  const persistedVersion = await prisma.environmentVersion.findUnique({ where: { id: version.id } });
  if (persistedVersion?.notes !== marker) throw new Error("Environment version did not persist");
  console.log(`OK environment version ${version.appCode} id=${version.id}`);
}

async function cleanup() {
  if (createdIds.version) {
    await prisma.environmentVersion.deleteMany({ where: { id: createdIds.version } });
  }
  if (createdIds.environment) {
    await prisma.environment.deleteMany({ where: { id: createdIds.environment } });
  }
  if (createdIds.leave) {
    await prisma.leaveRecord.deleteMany({ where: { id: createdIds.leave } });
  }
  if (createdIds.approval) {
    await prisma.approval.deleteMany({ where: { id: createdIds.approval } });
  }
  if (createdIds.drift) {
    await prisma.drift.deleteMany({ where: { id: createdIds.drift } });
  }
  if (createdIds.risk) {
    await prisma.risk.deleteMany({ where: { id: createdIds.risk } });
  }
}

main()
  .then(() => console.log("OK Batch 2 persistence proof complete"))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await cleanup();
      console.log("OK restored (deleted all Batch 2 proof rows)");
    } finally {
      await prisma.$disconnect();
    }
  });
