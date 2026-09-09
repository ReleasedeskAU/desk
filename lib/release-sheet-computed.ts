/**
 * Sheet Computed / Workflow extras for GET Release (not stored columns).
 * Blocker/conflict counts are link totals — not guessed from English status names.
 */

import { prisma } from "@/lib/prisma";
import { loadPreviousReleaseStatus } from "@/lib/release-lifecycle-status-patch";

export type ReleaseSheetComputed = {
  previousStatus: string | null;
  blockerCount: number;
  conflictCount: number;
};

/**
 * Load Previous Status, Blocker Count, and Conflict Count for a release row.
 *
 * @param row - Stored release identity.
 * @returns Always-locked sheet fields. Throws if Prisma queries fail.
 */
export async function loadReleaseSheetComputed(row: {
  id: string;
  releaseCode: string;
  status: string;
}): Promise<ReleaseSheetComputed> {
  const [previousStatus, blockerCount, conflictCount] = await Promise.all([
    loadPreviousReleaseStatus(row.id, row.status),
    prisma.blocker.count({ where: { releaseCode: row.releaseCode } }),
    prisma.environmentConflict.count({
      where: {
        OR: [
          { release1Code: row.releaseCode },
          { release2Code: row.releaseCode },
        ],
      },
    }),
  ]);
  return { previousStatus, blockerCount, conflictCount };
}
