/**
 * Audits existing Release rows for organizationId completeness vs default org.
 * Run: npx tsx scripts/audit-release-organization-ids.ts
 */
import { getDefaultOrganizationId } from "../lib/org-compat";
import { prisma } from "../lib/prisma";

async function main() {
  const defaultOrgId = await getDefaultOrganizationId();
  if (!defaultOrgId) {
    console.log("SKIP: no organization-aware schema detected");
    return;
  }

  const [total, nullCount, wrongOrg, correctOrg, sampleNull, sampleWrong] = await Promise.all([
    prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM "Release"`,
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM "Release" WHERE "organizationId" IS NULL
    `,
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM "Release"
      WHERE "organizationId" IS NOT NULL AND "organizationId" <> ${defaultOrgId}
    `,
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM "Release"
      WHERE "organizationId" = ${defaultOrgId}
    `,
    prisma.$queryRaw<Array<{ releaseCode: string; id: string }>>`
      SELECT "releaseCode", id FROM "Release" WHERE "organizationId" IS NULL LIMIT 5
    `,
    prisma.$queryRaw<Array<{ releaseCode: string; id: string; organizationId: string }>>`
      SELECT "releaseCode", id, "organizationId" FROM "Release"
      WHERE "organizationId" IS NOT NULL AND "organizationId" <> ${defaultOrgId}
      LIMIT 5
    `,
  ]);

  const summary = {
    defaultOrgId,
    total: Number(total[0]?.count ?? 0),
    nullOrganizationId: Number(nullCount[0]?.count ?? 0),
    wrongOrganizationId: Number(wrongOrg[0]?.count ?? 0),
    correctOrganizationId: Number(correctOrg[0]?.count ?? 0),
    sampleNull,
    sampleWrong,
  };
  console.log(JSON.stringify(summary, null, 2));

  if (summary.nullOrganizationId > 0 || summary.wrongOrganizationId > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
