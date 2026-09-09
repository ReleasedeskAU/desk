/**
 * Native scope / change-request section permissions.
 *
 * Section editors (grants) are not account-role editors and not Release Managers.
 * While a section is draft, the current manager or owner may add ANY existing
 * same-tenant user as a section editor. That person may edit only that
 * section's description and add attachments until it is approved — they cannot
 * approve, cannot add people, and do not gain a manager/owner seat.
 * Grants do not carry between scope and a change request. After approval,
 * add is denied; leftover grants do not keep the section writable.
 */
import {
  canSeatEditRelease,
  type SeatDecision,
} from "@/lib/release-seats";
import { isScopeApproved, isScopeDraft } from "@/lib/release-scope-status";

export type ScopeSectionKind = "scope" | "change_request";

export type ScopeSectionState = {
  kind: ScopeSectionKind;
  statusKey: string;
  granteeUserIds: readonly string[];
};

export type ScopeSectionCapabilities = {
  canEditDescription: boolean;
  canAddAttachments: boolean;
  canApprove: boolean;
  canAddGrant: boolean;
  canRemoveGrant: boolean;
  canStartChangeRequest: boolean;
  grantHint: string | null;
};

/**
 * Capabilities for one native section. Default deny.
 *
 * @param decision - Owner-or-current-manager decision.
 * @param section - Draft/approved state plus grants for THIS section only.
 */
export function scopeSectionCapabilities(
  decision: SeatDecision,
  section: ScopeSectionState
): ScopeSectionCapabilities {
  const draft = isScopeDraft(section.statusKey);
  const approved = isScopeApproved(section.statusKey);
  const seatOk = canSeatEditRelease(decision);
  const granted =
    Boolean(decision.directoryUserId) &&
    draft &&
    section.granteeUserIds.includes(decision.directoryUserId as string);

  const canEditDescription = (seatOk || granted) && draft;
  const canAddAttachments = canEditDescription;
  const canApprove = seatOk && draft;
  const canAddGrant = seatOk && draft;
  const canRemoveGrant = canAddGrant;
  const canStartChangeRequest =
    seatOk && section.kind === "scope" && approved;

  return {
    canEditDescription,
    canAddAttachments,
    canApprove,
    canAddGrant,
    canRemoveGrant,
    canStartChangeRequest,
    grantHint: granted ? "You can edit this section" : null,
  };
}

/**
 * True when the current manager or owner may add a section editor.
 * The grantee may be any existing same-tenant user (see
 * `isAssignableScopeSectionEditor`) — not limited to account-role editors.
 *
 * @param decision - Seat decision.
 * @param statusKey - Section status key.
 */
export function canGrantDraftSection(decision: SeatDecision, statusKey: string): boolean {
  return canSeatEditRelease(decision) && isScopeDraft(statusKey);
}
