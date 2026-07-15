/**
 * Step 2 Batch 1 proof: Zod primary-ID rejection + real DB persist/restore.
 * Run: npx tsx scripts/verify-detail-batch1.ts
 */
import { prisma } from "../lib/prisma";
import { patchBookingSchema } from "../lib/validation/booking";
import { patchDependencySchema } from "../lib/validation/dependency";
import { patchRiskSchema } from "../lib/validation/risk";
import { patchDriftSchema } from "../lib/validation/drift";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  assert(!patchBookingSchema.safeParse({ bookingCode: "BK-HACK", purpose: "x" }).success, "booking must reject bookingCode");
  assert(
    !patchDependencySchema.safeParse({ dependencyCode: "DEP-HACK", notes: "x" }).success &&
      !patchDependencySchema.safeParse({ depCode: "DEP-HACK", notes: "x" }).success,
    "dependency must reject code fields"
  );
  assert(!patchRiskSchema.safeParse({ riskCode: "RSK-HACK", notes: "x" }).success, "risk must reject riskCode");
  assert(!patchRiskSchema.safeParse({ riskScore: 99, notes: "x" }).success, "risk must reject riskScore");
  assert(!patchDriftSchema.safeParse({ driftCode: "DFT-HACK", description: "x" }).success, "drift must reject driftCode");
  console.log("OK zod: primary IDs / forbidden fields rejected");

  const marker = `batch1-proof-${Date.now()}`;

  const booking = await prisma.envBooking.findFirst({
    where: { bookingCode: { not: null } },
    orderBy: { bookingCode: "asc" },
  });
  assert(booking, "need a booking");
  const bookingBefore = booking.purpose;
  patchBookingSchema.parse({ purpose: marker });
  await prisma.envBooking.update({ where: { id: booking.id }, data: { purpose: marker } });
  const bookingMid = await prisma.envBooking.findUniqueOrThrow({ where: { id: booking.id } });
  assert(bookingMid.purpose === marker, "booking purpose not persisted");
  await prisma.envBooking.update({ where: { id: booking.id }, data: { purpose: bookingBefore } });
  console.log(
    `OK booking ${booking.bookingCode}: purpose "${bookingBefore ?? "(null)"}" → "${marker}" → restored`
  );

  const dep = await prisma.releaseDependency.findFirst({
    where: { dependencyCode: { not: null } },
    orderBy: { dependencyCode: "asc" },
  });
  assert(dep, "need a dependency");
  const depBefore = dep.notes;
  patchDependencySchema.parse({ notes: marker });
  await prisma.releaseDependency.update({ where: { id: dep.id }, data: { notes: marker } });
  const depMid = await prisma.releaseDependency.findUniqueOrThrow({ where: { id: dep.id } });
  assert(depMid.notes === marker, "dependency notes not persisted");
  await prisma.releaseDependency.update({ where: { id: dep.id }, data: { notes: depBefore } });
  console.log(
    `OK dependency ${dep.dependencyCode}: notes "${depBefore ?? "(null)"}" → "${marker}" → restored`
  );

  const risk = await prisma.risk.findFirst({ orderBy: { riskCode: "asc" } });
  assert(risk, "need a risk");
  const riskBefore = risk.notes;
  patchRiskSchema.parse({ notes: marker });
  await prisma.risk.update({ where: { id: risk.id }, data: { notes: marker } });
  const riskMid = await prisma.risk.findUniqueOrThrow({ where: { id: risk.id } });
  assert(riskMid.notes === marker, "risk notes not persisted");
  await prisma.risk.update({ where: { id: risk.id }, data: { notes: riskBefore } });
  console.log(`OK risk ${risk.riskCode}: notes "${riskBefore ?? "(null)"}" → "${marker}" → restored`);

  const drift = await prisma.drift.findFirst({ orderBy: { driftCode: "asc" } });
  assert(drift, "need a drift");
  const driftBefore = drift.description;
  const newDesc = `${marker} ${driftBefore}`.slice(0, 500);
  patchDriftSchema.parse({ description: newDesc });
  await prisma.drift.update({ where: { id: drift.id }, data: { description: newDesc } });
  const driftMid = await prisma.drift.findUniqueOrThrow({ where: { id: drift.id } });
  assert(driftMid.description === newDesc, "drift description not persisted");
  await prisma.drift.update({ where: { id: drift.id }, data: { description: driftBefore } });
  console.log(
    `OK drift ${drift.driftCode}: description updated with marker → restored (len ${driftBefore.length}→${newDesc.length}→${driftBefore.length})`
  );

  console.log("Batch 1 DB+Zod proof complete (HTTP still needs signed-in browser).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
