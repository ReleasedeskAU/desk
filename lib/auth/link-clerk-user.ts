/**
 * Link a Clerk session id onto the matching directory User row (email match).
 * Used so Category A cron can resolve per-user lifecycle thresholds.
 */
import { prisma, withDbRetry } from "@/lib/prisma";

/**
 * Best-effort: set `User.clerkUserId` when the signed-in Clerk email matches a
 * directory User that is not yet linked. Never overwrites an existing link.
 * Failures are logged and swallowed — session auth must not break.
 *
 * @param clerkUserId - Clerk `auth().userId`
 * @param email - Primary Clerk email address
 */
export async function ensureUserClerkLink(
  clerkUserId: string,
  email: string
): Promise<void> {
  const trimmedEmail = email.trim();
  const trimmedClerk = clerkUserId.trim();
  if (!trimmedEmail || !trimmedClerk) return;

  try {
    await withDbRetry(
      async () => {
        const directory = await prisma.user.findUnique({
          where: { email: trimmedEmail },
          select: { id: true, clerkUserId: true },
        });
        if (!directory) return;
        // Already linked to this Clerk id — nothing to do.
        if (directory.clerkUserId === trimmedClerk) return;
        // Security: never steal / reassign a row already bound to another Clerk user.
        if (directory.clerkUserId != null) return;

        const taken = await prisma.user.findUnique({
          where: { clerkUserId: trimmedClerk },
          select: { id: true },
        });
        if (taken && taken.id !== directory.id) {
          console.warn("[auth] clerkUserId already linked to another User", {
            clerkUserId: trimmedClerk,
          });
          return;
        }

        await prisma.user.update({
          where: { id: directory.id },
          data: { clerkUserId: trimmedClerk },
        });
      },
      { attempts: 2, baseDelayMs: 300, label: "clerk-user-link" }
    );
  } catch (err) {
    console.warn("[auth] ensureUserClerkLink failed", {
      message: err instanceof Error ? err.message : "unknown",
    });
  }
}
