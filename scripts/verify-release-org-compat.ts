import { createReleaseRow, getDefaultOrganizationId } from "../lib/org-compat";
import { prisma } from "../lib/prisma";

const stamp = Date.now();
let createdId: string | undefined;

async function main() {
  const [department, organizationId] = await Promise.all([
    prisma.department.findFirst({ select: { id: true } }),
    getDefaultOrganizationId(),
  ]);
  if (!department || !organizationId) throw new Error("Release proof prerequisites are missing");

  const release = await createReleaseRow({
    releaseCode: `REL-ORG-PROOF-${stamp}`,
    name: "Organization compatibility proof",
    programProject: "Proof",
    owner: "Proof",
    status: "Planned",
    releaseDate: new Date(),
    priority: "P3 - Medium",
    impact: "Medium",
    departmentId: department.id,
  });
  createdId = release.id;

  const rows = await prisma.$queryRaw<Array<{ organizationId: string }>>`
    SELECT "organizationId" FROM "Release" WHERE id = ${release.id}
  `;
  if (rows[0]?.organizationId !== organizationId) {
    throw new Error("Release organizationId was not persisted correctly");
  }
  console.log(`OK release ${release.releaseCode} organizationId=${organizationId}`);
}

main()
  .finally(async () => {
    if (createdId) await prisma.release.deleteMany({ where: { id: createdId } });
    await prisma.$disconnect();
  });
