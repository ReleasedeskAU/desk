/**
 * One-shot: count Release pins vs UserReleaseLifecycleConfigVersion rows.
 * Usage: node scripts/check-lifecycle-pins.mjs (requires DATABASE_URL).
 */
import { PrismaClient } from "@releasedesk/database";

const prisma = new PrismaClient();
try {
  const total = await prisma.release.count();
  const unpinned = await prisma.release.count({
    where: { lifecycleConfigVersionId: null },
  });
  const pinned = total - unpinned;
  const versions = await prisma.userReleaseLifecycleConfigVersion.count();
  console.log(JSON.stringify({ total, pinned, unpinned, versions }, null, 2));
} finally {
  await prisma.$disconnect();
}
