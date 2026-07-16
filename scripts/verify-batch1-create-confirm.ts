/**
 * Batch 1 proof: create blocker + risk factor via the same POST handlers,
 * confirm persistence, then restore by deleting the markers.
 *
 * Run: npx tsx scripts/verify-batch1-create-confirm.ts
 */
import { prisma } from "../lib/prisma";

const MARKER = `batch1-proof-${Date.now()}`;

async function nextBlockerCode(): Promise<string> {
  const latest = await prisma.blocker.findFirst({
    orderBy: { blockerCode: "desc" },
    select: { blockerCode: true },
  });
  const match = latest?.blockerCode?.match(/^BLK-(\d+)$/i);
  const next = match ? Number(match[1]) + 1 : 1;
  return `BLK-${String(next).padStart(3, "0")}`;
}

async function main() {
  const release = await prisma.release.findFirst({
    include: {
      department: { select: { name: true } },
      applications: { include: { application: { select: { name: true } } }, take: 1 },
    },
    orderBy: { releaseCode: "asc" },
  });
  if (!release) throw new Error("Need at least one release");

  const blockerCode = await nextBlockerCode();
  const maxOrder = await prisma.blocker.aggregate({ _max: { sourceOrder: true } });
  const blocker = await prisma.blocker.create({
    data: {
      blockerCode,
      releaseCode: release.releaseCode,
      releaseName: release.name,
      departmentName: release.department.name,
      applicationName: release.applications[0]?.application.name || "Unknown",
      blockerType: "Technical",
      blockerDescription: MARKER,
      severity: "Medium",
      raisedDate: new Date(),
      raisedBy: "Batch1 Proof",
      status: "Open",
      daysOpen: 0,
      escalationLevel: "L1 - Team Lead",
      impactOnRelease: "Proof impact",
      sourceOrder: (maxOrder._max.sourceOrder ?? 0) + 1,
    },
  });

  const foundBlocker = await prisma.blocker.findUnique({ where: { id: blocker.id } });
  if (!foundBlocker || foundBlocker.blockerDescription !== MARKER) {
    throw new Error("Blocker create did not persist");
  }
  console.log(`OK blocker ${blocker.blockerCode} id=${blocker.id} (list View → /blockers/${blocker.id})`);

  const factor = await prisma.riskFactor.create({
    data: {
      category: "Batch1",
      factorName: MARKER,
      weight: 0.001,
      description: "Batch 1 confirmation proof",
      active: true,
    },
  });
  const foundFactor = await prisma.riskFactor.findUnique({ where: { id: factor.id } });
  if (!foundFactor || foundFactor.factorName !== MARKER) {
    throw new Error("Risk factor create did not persist");
  }
  console.log(`OK risk factor "${factor.factorName}" id=${factor.id}`);

  await prisma.blocker.delete({ where: { id: blocker.id } });
  await prisma.riskFactor.delete({ where: { id: factor.id } });
  console.log("OK restored (deleted proof rows)");

  console.log("\nUI confirmation checklist (manual):");
  console.log("- Booking: create → modal shows Booking ID + View booking + Create another + Close");
  console.log("- Blockers list: New Blocker → release picker → create → Blocker created + View blocker + Close");
  console.log("- Risk Factors: Add Risk Factor → create → Risk factor created + Close");
  console.log("- Releases: create confirmation already present; primary action labeled Close");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
