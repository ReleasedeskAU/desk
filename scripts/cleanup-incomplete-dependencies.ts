/**
 * Removes lightweight release-form dependency stubs that lack DEP codes/metadata.
 * Run: npx tsx scripts/cleanup-incomplete-dependencies.ts
 */
import { prisma } from "../lib/prisma";

async function main() {
  const stubs = await prisma.releaseDependency.findMany({
    where: { dependencyCode: null },
    include: {
      release: { select: { releaseCode: true, name: true } },
      dependsOnRelease: { select: { releaseCode: true } },
    },
  });

  if (!stubs.length) {
    console.log("OK no incomplete dependency stubs found");
    return;
  }

  console.log(
    stubs.map((row) => ({
      id: row.id,
      release: row.release.releaseCode,
      dependsOn: row.dependsOnRelease.releaseCode,
    }))
  );

  const deleted = await prisma.releaseDependency.deleteMany({
    where: { dependencyCode: null },
  });
  console.log(`OK deleted ${deleted.count} incomplete dependency stub(s)`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
