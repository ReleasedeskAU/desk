import { PrismaClient } from "@prisma/client";

/** Prints one Conflict / Leave / Blocker id for local screenshot navigation. */
async function main() {
  const prisma = new PrismaClient();
  try {
    const [conflict, leave, blocker] = await Promise.all([
      prisma.environmentConflict.findFirst({
        select: { id: true, conflictCode: true },
        orderBy: { conflictCode: "asc" },
      }),
      prisma.leaveRecord.findFirst({
        select: { id: true, leaveCode: true },
        orderBy: { leaveCode: "asc" },
      }),
      prisma.blocker.findFirst({
        select: { id: true, blockerCode: true },
        orderBy: { blockerCode: "asc" },
      }),
    ]);
    console.log(JSON.stringify({ conflict, leave, blocker }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
