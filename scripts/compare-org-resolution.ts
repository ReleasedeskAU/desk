import { getDefaultOrganizationId } from "../lib/org-compat";
import { prisma } from "../lib/prisma";

async function main() {
  const defaultOrg = await getDefaultOrganizationId();
  const userOrg = await prisma.$queryRaw<Array<{ organizationId: string }>>`
    SELECT "organizationId" FROM "User" WHERE "organizationId" IS NOT NULL LIMIT 1
  `;
  const releaseOrg = await prisma.$queryRaw<Array<{ organizationId: string }>>`
    SELECT DISTINCT "organizationId" FROM "Release"
  `;
  console.log({ defaultOrg, userOrgSample: userOrg[0]?.organizationId, releaseOrgs: releaseOrg });
}

main().finally(() => prisma.$disconnect());
