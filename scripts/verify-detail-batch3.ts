/**
 * Step 2 Batch 3 proof: Zod primary-ID rejection + real DB persist/restore.
 * Run: npx tsx scripts/verify-detail-batch3.ts
 */
import { prisma } from "../lib/prisma";
import { patchIncidentSchema } from "../lib/validation/incident";
import { patchPlannedMaintenanceSchema } from "../lib/validation/planned-maintenance";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  assert(!patchIncidentSchema.safeParse({ incidentCode: "INC-HACK", title: "x" }).success, "incident must reject incidentCode");
  assert(
    !patchPlannedMaintenanceSchema.safeParse({ maintenanceCode: "MNT-HACK", type: "x" }).success,
    "maintenance must reject maintenanceCode"
  );
  console.log("OK zod: primary IDs rejected");

  const marker = `batch3-proof-${Date.now()}`;

  const incident = await prisma.incident.findFirst({ orderBy: { incidentCode: "asc" } });
  assert(incident, "need an incident");
  const incidentBefore = incident.assignedTo;
  patchIncidentSchema.parse({ assignedTo: marker });
  await prisma.incident.update({ where: { id: incident.id }, data: { assignedTo: marker } });
  const incidentMid = await prisma.incident.findUniqueOrThrow({ where: { id: incident.id } });
  assert(incidentMid.assignedTo === marker, "incident assignedTo not persisted");
  await prisma.incident.update({ where: { id: incident.id }, data: { assignedTo: incidentBefore } });
  console.log(
    `OK incident ${incident.incidentCode}: assignedTo "${incidentBefore ?? "(null)"}" → "${marker}" → restored`
  );

  const maint = await prisma.plannedMaintenance.findFirst({ orderBy: { maintenanceCode: "asc" } });
  assert(maint, "need a planned maintenance row");
  const maintBefore = maint.notes;
  patchPlannedMaintenanceSchema.parse({ notes: marker });
  await prisma.plannedMaintenance.update({ where: { id: maint.id }, data: { notes: marker } });
  const maintMid = await prisma.plannedMaintenance.findUniqueOrThrow({ where: { id: maint.id } });
  assert(maintMid.notes === marker, "maintenance notes not persisted");
  await prisma.plannedMaintenance.update({ where: { id: maint.id }, data: { notes: maintBefore } });
  console.log(
    `OK maintenance ${maint.maintenanceCode}: notes "${maintBefore ?? "(null)"}" → "${marker}" → restored`
  );

  console.log("Batch 3 DB+Zod proof complete (HTTP still needs signed-in browser).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
