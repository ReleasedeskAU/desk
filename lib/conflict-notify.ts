/**
 * In-app notice when a conflict is raised for Release Manager review.
 * Uses the existing AppNotificationRow inbox (header bell), not a parallel channel.
 */
import { prisma } from "@/lib/prisma";
import { appendAppNotification } from "@/lib/release-state-repo";

export const CONFLICT_NOTICE_TYPE = "conflict" as const;

const CONFLICT_CODE_RE = /\bCNF-\d+\b/i;

/**
 * Title, message, and conflict href for the RM inbox row.
 * @param args.releaseCode - Release the conflict was raised on
 * @param args.conflictCode - Conflict code (CNF-NNNN)
 */
export function buildConflictRaisedNotice(args: {
  releaseCode: string;
  conflictCode: string;
}): { title: string; message: string; href: string; type: typeof CONFLICT_NOTICE_TYPE } {
  return {
    title: `Conflict raised on release ${args.releaseCode} — needs review`,
    message: `${args.conflictCode} needs Release Manager review.`,
    href: `/conflicts/${args.conflictCode}`,
    type: CONFLICT_NOTICE_TYPE,
  };
}

/**
 * Conflict detail path from a stored notice title/message (CNF-NNNN).
 * @param title - Notification title
 * @param message - Notification message
 */
export function conflictHrefFromNotice(
  title: string,
  message: string
): string | undefined {
  const match = `${title} ${message}`.match(CONFLICT_CODE_RE);
  if (!match) return undefined;
  return `/conflicts/${match[0].toUpperCase()}`;
}

/**
 * Create one AppNotificationRow per newly raised conflict and keep the ops log.
 * Inbox is org-wide (same as other release notices); the copy is addressed to RMs.
 * @param args.releaseId - Optional release PK for the existing “View release” link
 * @param args.releaseCode - Release code in the title
 * @param args.conflicts - Newly created conflict codes
 * @param args.raisedBy - Actor display name
 */
export async function notifyConflictsRaisedForRm(args: {
  releaseId?: string | null;
  releaseCode: string;
  conflicts: ReadonlyArray<{ conflictCode: string }>;
  raisedBy: string;
}): Promise<void> {
  if (args.conflicts.length === 0) return;

  const managers = await prisma.user.findMany({
    where: {
      status: "Active",
      role: { contains: "Release Manager", mode: "insensitive" },
    },
    select: { name: true },
    take: 8,
  });
  const rmNames = managers.map((row) => row.name.trim()).filter(Boolean);
  const addressed = rmNames.length > 0 ? `For ${rmNames.join(", ")}: ` : "";

  for (const conflict of args.conflicts) {
    const notice = buildConflictRaisedNotice({
      releaseCode: args.releaseCode,
      conflictCode: conflict.conflictCode,
    });
    await appendAppNotification({
      title: notice.title,
      message: `${addressed}${notice.message} Raised by ${args.raisedBy}.`,
      releaseId: args.releaseId ?? undefined,
      type: CONFLICT_NOTICE_TYPE,
    });
    console.warn("[conflict-raise] notify release manager", {
      releaseCode: args.releaseCode,
      conflictCode: conflict.conflictCode,
      raisedBy: args.raisedBy,
      releaseManagers: rmNames,
    });
  }
}
