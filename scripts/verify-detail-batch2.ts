/**
 * Step 2 Batch 2 proof: Zod primary-ID rejection + real DB persist/restore.
 * Run: npx tsx scripts/verify-detail-batch2.ts
 */
import { prisma } from "../lib/prisma";
import { patchApprovalSchema } from "../lib/validation/approval";
import { patchEnvironmentVersionSchema } from "../lib/validation/environment-version";
import { patchIntegrationFlowSchema } from "../lib/validation/integration-flow";
import { patchMonitoringAlertSchema } from "../lib/validation/monitoring-alert";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  assert(!patchApprovalSchema.safeParse({ approvalCode: "APR-HACK", comments: "x" }).success, "approval must reject approvalCode");
  assert(!patchEnvironmentVersionSchema.safeParse({ appCode: "APP-HACK", version: "1.0" }).success, "version must reject appCode");
  assert(!patchEnvironmentVersionSchema.safeParse({ id: "cuid-hack", version: "1.0" }).success, "version must reject id");
  assert(!patchIntegrationFlowSchema.safeParse({ flowCode: "IF-HACK", sourceSystem: "A" }).success, "flow must reject flowCode");
  assert(!patchMonitoringAlertSchema.safeParse({ alertCode: "ALT-HACK", metric: "x" }).success, "alert must reject alertCode");
  console.log("OK zod: primary IDs / identity fields rejected");

  const marker = `batch2-proof-${Date.now()}`;

  const approval = await prisma.approval.findFirst({ orderBy: { approvalCode: "asc" } });
  assert(approval, "need an approval");
  const approvalBefore = approval.comments;
  patchApprovalSchema.parse({ comments: marker });
  await prisma.approval.update({ where: { id: approval.id }, data: { comments: marker } });
  const approvalMid = await prisma.approval.findUniqueOrThrow({ where: { id: approval.id } });
  assert(approvalMid.comments === marker, "approval comments not persisted");
  await prisma.approval.update({ where: { id: approval.id }, data: { comments: approvalBefore } });
  console.log(
    `OK approval ${approval.approvalCode}: comments "${approvalBefore ?? "(null)"}" → "${marker}" → restored`
  );

  const version = await prisma.environmentVersion.findFirst({ orderBy: { id: "asc" } });
  assert(version, "need an environment version");
  const versionBefore = version.notes;
  patchEnvironmentVersionSchema.parse({ notes: marker });
  await prisma.environmentVersion.update({ where: { id: version.id }, data: { notes: marker } });
  const versionMid = await prisma.environmentVersion.findUniqueOrThrow({ where: { id: version.id } });
  assert(versionMid.notes === marker, "version notes not persisted");
  await prisma.environmentVersion.update({ where: { id: version.id }, data: { notes: versionBefore } });
  console.log(
    `OK version ${version.appCode ?? version.id}: notes "${versionBefore ?? "(null)"}" → "${marker}" → restored`
  );

  const flow = await prisma.integrationFlow.findFirst({ orderBy: { flowCode: "asc" } });
  assert(flow, "need an integration flow");
  const flowBefore = flow.businessPurpose;
  const flowNew = `${marker} ${flowBefore}`.slice(0, 500);
  patchIntegrationFlowSchema.parse({ businessPurpose: flowNew });
  await prisma.integrationFlow.update({ where: { id: flow.id }, data: { businessPurpose: flowNew } });
  const flowMid = await prisma.integrationFlow.findUniqueOrThrow({ where: { id: flow.id } });
  assert(flowMid.businessPurpose === flowNew, "flow businessPurpose not persisted");
  await prisma.integrationFlow.update({ where: { id: flow.id }, data: { businessPurpose: flowBefore } });
  console.log(`OK flow ${flow.flowCode}: businessPurpose updated with marker → restored`);

  const alert = await prisma.monitoringAlert.findFirst({ orderBy: { alertCode: "asc" } });
  assert(alert, "need a monitoring alert");
  const alertBefore = alert.assignedTo;
  patchMonitoringAlertSchema.parse({ assignedTo: marker });
  await prisma.monitoringAlert.update({ where: { id: alert.id }, data: { assignedTo: marker } });
  const alertMid = await prisma.monitoringAlert.findUniqueOrThrow({ where: { id: alert.id } });
  assert(alertMid.assignedTo === marker, "alert assignedTo not persisted");
  await prisma.monitoringAlert.update({ where: { id: alert.id }, data: { assignedTo: alertBefore } });
  console.log(
    `OK alert ${alert.alertCode}: assignedTo "${alertBefore ?? "(null)"}" → "${marker}" → restored`
  );

  console.log("Batch 2 DB+Zod proof complete (HTTP still needs signed-in browser).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
