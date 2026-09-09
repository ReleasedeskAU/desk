/**
 * Release Manager / Owner seat rules.
 *
 * Do not use hasMinRole("editor") or requireRole("editor") here — those admit
 * admin and deny a readonly owner. Account role never blocks a current seat.
 */
import { mapAccessLevelToRole } from "@/lib/auth/role-rank";
import type { SessionUser, UserRole } from "@/lib/auth/roles";
import type { ReleaseLifecycleConfig } from "@/lib/release-lifecycle-config";
import { resolveLifecycleStatusRef } from "@/lib/release-lifecycle-transition";

export type DirectoryUserRef = {
  id: string;
  userId?: string | null;
  clerkUserId?: string | null;
  email: string;
  name: string;
  accessLevel?: string | null;
  role?: string | null;
  status?: string | null;
};

export type ReleaseSeatIds = {
  releaseOwnerId: string | null | undefined;
  releaseManagerId: string | null | undefined;
};

/**
 * Resolve whether the session is this directory user.
 * Clerk id wins; email is the fallback used before the link is filled.
 *
 * @param session - Authenticated session.
 * @param user - Directory User row.
 */
export function sessionMatchesDirectoryUser(
  session: SessionUser,
  user: Pick<DirectoryUserRef, "id" | "clerkUserId" | "email">
): boolean {
  const clerk = (user.clerkUserId ?? "").trim();
  if (clerk && clerk === session.id) return true;
  const email = (user.email ?? "").trim().toLowerCase();
  const sessionEmail = (session.email ?? "").trim().toLowerCase();
  return Boolean(email && sessionEmail && email === sessionEmail);
}

/**
 * Privilege tier from the directory row (accessLevel), not job-title `role`.
 *
 * @param user - Directory user.
 */
export function directoryUserPrivilege(user: DirectoryUserRef): UserRole {
  return mapAccessLevelToRole(user.accessLevel);
}

/**
 * Exact editor seat candidate: privilege editor, not admin, not readonly.
 * Inactive directory rows are excluded.
 *
 * @param user - Directory user.
 */
export function isExactEditorDirectoryUser(user: DirectoryUserRef): boolean {
  if ((user.status ?? "Active").trim().toLowerCase() === "inactive") return false;
  return directoryUserPrivilege(user) === "editor";
}

/**
 * Any existing same-tenant Release Desk user (editor, readonly/clerk, admin).
 * Inactive rows are excluded from pickers.
 *
 * @param user - Directory user.
 */
export function isAssignableOwnerDirectoryUser(user: DirectoryUserRef): boolean {
  return (user.status ?? "Active").trim().toLowerCase() !== "inactive";
}

/**
 * Live or terminal releases deny manager/owner/scope writes.
 * Live = deployingMilestone or deployedMilestone. Terminal = status.terminal.
 * Unknown status is not guessed as live/terminal.
 *
 * @param config - Caller lifecycle config.
 * @param status - Current release status label or key.
 */
export function isReleaseSeatWriteLocked(
  config: ReleaseLifecycleConfig,
  status: string | null | undefined
): boolean {
  const resolved = resolveLifecycleStatusRef(config, status ?? "");
  if (!resolved) return false;
  return (
    resolved.terminal === true ||
    resolved.deployingMilestone === true ||
    resolved.deployedMilestone === true
  );
}

export type SeatDecision = {
  directoryUserId: string | null;
  isCurrentOwner: boolean;
  isCurrentManager: boolean;
  holdsSeat: boolean;
  isExactEditor: boolean;
  writeLocked: boolean;
};

/**
 * Compute owner-or-current-manager on this release. Session identity only.
 *
 * @param args.session - Authenticated session.
 * @param args.directoryUser - Linked directory row, or null when unprovisioned.
 * @param args.seats - Current owner/manager FKs.
 * @param args.writeLocked - Live or terminal.
 */
export function computeReleaseSeats(args: {
  session: SessionUser;
  directoryUser: DirectoryUserRef | null;
  seats: ReleaseSeatIds;
  writeLocked: boolean;
}): SeatDecision {
  const directoryUserId = args.directoryUser?.id ?? null;
  const isCurrentOwner = Boolean(
    directoryUserId && args.seats.releaseOwnerId && directoryUserId === args.seats.releaseOwnerId
  );
  const isCurrentManager = Boolean(
    directoryUserId &&
      args.seats.releaseManagerId &&
      directoryUserId === args.seats.releaseManagerId
  );
  return {
    directoryUserId,
    isCurrentOwner,
    isCurrentManager,
    holdsSeat: isCurrentOwner || isCurrentManager,
    isExactEditor: args.session.role === "editor",
    writeLocked: args.writeLocked,
  };
}

export type AssignmentIntent = {
  releaseOwnerId?: string | null;
  releaseManagerId?: string | null;
};

/**
 * Decide whether this actor may apply owner/manager writes.
 * Manager write and owner write are separate — one does not imply the other.
 *
 * @param decision - Seat decision for the session.
 * @param intent - Requested assignment fields (only keys present are checked).
 * @returns Denial code or null when allowed.
 */
export function assignmentWriteDenial(
  decision: SeatDecision,
  intent: AssignmentIntent
): { code: string; error: string } | null {
  if (decision.writeLocked) {
    return {
      code: "RELEASE_SEAT_WRITES_LOCKED",
      error: "Live and terminal releases cannot change owner, manager, or scope.",
    };
  }
  const ownerChanging = Object.prototype.hasOwnProperty.call(intent, "releaseOwnerId");
  const managerChanging = Object.prototype.hasOwnProperty.call(intent, "releaseManagerId");

  if (ownerChanging && !decision.holdsSeat) {
    return {
      code: "OWNER_ASSIGN_DENIED",
      error: "Only the current Release Manager or current owner can change the owner.",
    };
  }

  if (managerChanging) {
    if (decision.holdsSeat) return null;
    const target = intent.releaseManagerId;
    if (
      decision.isExactEditor &&
      decision.directoryUserId &&
      target === decision.directoryUserId
    ) {
      return null;
    }
    return {
      code: "MANAGER_ASSIGN_DENIED",
      error:
        "Editors who are not the current manager or owner may only assign the manager seat to themselves.",
    };
  }

  return null;
}

/**
 * Whether the session may edit non-assignment release fields (and approve).
 * Seat holders only. Account role does not block a seat. Live/terminal deny.
 *
 * @param decision - Seat decision.
 */
export function canSeatEditRelease(decision: SeatDecision): boolean {
  return decision.holdsSeat && !decision.writeLocked;
}

/**
 * Picker lists: managers = exact editors; owners = any existing same-tenant user.
 * Never typed names. Never users outside the directory set passed in.
 *
 * @param users - Same-tenant directory users.
 */
export function assignmentPickerOptions(users: DirectoryUserRef[]): {
  managers: DirectoryUserRef[];
  owners: DirectoryUserRef[];
} {
  return {
    managers: users.filter(isExactEditorDirectoryUser),
    owners: users.filter(isAssignableOwnerDirectoryUser),
  };
}
