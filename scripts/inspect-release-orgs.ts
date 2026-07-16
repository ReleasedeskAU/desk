import { prisma } from "../lib/prisma";

async function main() {
  const orgs = await prisma.$queryRaw<Array<{ id: string; name: string | null }>>`
    SELECT id, name FROM "Organization" ORDER BY "createdAt" ASC
  `;
  const releasesByOrg = await prisma.$queryRaw<Array<{ organizationId: string; count: bigint }>>`
    SELECT "organizationId", COUNT(*)::bigint AS count
    FROM "Release"
    GROUP BY "organizationId"
    ORDER BY count DESC
  `;
  const uiCreated = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count FROM "Release"
    WHERE "releaseCode" LIKE 'REL-ORG-PROOF-%' OR name ILIKE '%proof%'
  `;
  console.log(
    JSON.stringify(
      {
        orgs,
        releasesByOrg: releasesByOrg.map((row) => ({
          organizationId: row.organizationId,
          count: Number(row.count),
        })),
        possibleProofRows: Number(uiCreated[0]?.count ?? 0),
      },
      null,
      2
    )
  );
}

main().finally(() => prisma.$disconnect());
