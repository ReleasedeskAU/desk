import { prisma } from "../lib/prisma";

async function main() {
  const rows = await prisma.releaseDependency.findMany({
    include: {
      release: { select: { releaseCode: true, name: true } },
      dependsOnRelease: { select: { releaseCode: true, name: true } },
    },
    orderBy: [{ sourceOrder: "asc" }, { id: "asc" }],
  });

  const incomplete = rows.filter(
    (r) => !r.dependencyCode || !r.dependencyType || !r.status
  );

  console.log(
    JSON.stringify(
      {
        total: rows.length,
        incompleteCount: incomplete.length,
        incomplete: incomplete.map((r) => ({
          id: r.id,
          dependencyCode: r.dependencyCode,
          releaseCode: r.release.releaseCode,
          releaseName: r.release.name,
          dependsOnCode: r.dependsOnRelease.releaseCode,
          dependencyType: r.dependencyType,
          status: r.status,
          sourceOrder: r.sourceOrder,
        })),
        firstFive: rows.slice(0, 5).map((r) => ({
          dependencyCode: r.dependencyCode,
          releaseCode: r.release.releaseCode,
          dependencyType: r.dependencyType,
          status: r.status,
          sourceOrder: r.sourceOrder,
        })),
      },
      null,
      2
    )
  );
}

main().finally(() => prisma.$disconnect());
