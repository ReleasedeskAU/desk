/**
 * Native scope / change-request section permissions.
 * Section grants are separate from account role and do not carry between
 * scope and a change request. After approval, leftover grants do not keep
 * the section writable.
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
 * True when the actor may add an existing same-tenant user to a still-draft section.
 *
 * @param decision - Seat decision.
 * @param statusKey - Section status key.
 */
export function canGrantDraftSection(decision: SeatDecision, statusKey: string): boolean {
  return canSeatEditRelease(decision) && isScopeDraft(statusKey);
}
