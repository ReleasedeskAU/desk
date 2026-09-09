/**
 * Plain-language edit-policy denial messages (user-facing).
 */

const MODE_PLAIN: Record<string, string> = {
  immutable: "locked after that decision",
  "read-only": "view-only",
  "read_only": "view-only",
  limited: "limited — only some fields can change",
  full: "editable",
};

/**
 * Shown when a release name change is rejected at pending CAB (lifecycle key
 * `pending_cab` — tenant labels such as “Pending approval” still map here).
 */
export const RELEASE_NAME_PENDING_CAB_DENIED_MESSAGE =
  "The release name can’t be changed at this stage. Leave it as it is, or ask a release manager if it needs a correction.";

/**
 * Build EDIT_POLICY_DENIED error text without exposing raw mode tokens as the headline idea.
 *
 * @param args.entity - e.g. "release", "risk"
 * @param args.mode - Engine edit mode (immutable / read-only / limited / full)
 * @param args.statusLabel - Current status or decision label
 * @param args.statusWord - "status" or "decision"
 * @param args.deniedFields - Human-readable field labels when available
 */
export function editPolicyDeniedMessage(args: {
  entity: string;
  mode: string;
  statusLabel: string;
  statusWord?: "status" | "decision";
  deniedFields: string[];
}): string {
  const fields =
    args.deniedFields.length > 0
      ? args.deniedFields.join(", ")
      : "the requested fields";
  const modeKey = args.mode.trim().toLowerCase().replaceAll("_", "-");
  const plain =
    MODE_PLAIN[modeKey] ??
    MODE_PLAIN[args.mode] ??
    "not editable";
  const word = args.statusWord ?? "status";
  if (modeKey === "immutable" || args.mode === "immutable") {
    return `These fields can’t be edited in “${args.statusLabel}”. This ${args.entity} is locked after that decision. Fields affected: ${fields}.`;
  }
  return `These fields can’t be edited while this ${args.entity} is ${plain} in ${word} “${args.statusLabel}”. Fields affected: ${fields}.`;
}

/**
 * Release PATCH edit-policy error copy.
 * A name-only denial at pending CAB uses a short plain-language message
 * instead of mode tokens and field keys (RD-141). Other denials keep the
 * generic edit-policy wording. Does not change which fields are denied.
 *
 * @param args.mode - Engine edit mode (immutable / read-only / limited / full)
 * @param args.statusLabel - Display status for generic denials
 * @param args.statusKey - Resolved lifecycle status key, or null if unmapped
 * @param args.deniedFields - PATCH body keys that were denied
 * @returns User-facing error and optional field key for inline highlight
 */
export function releaseEditPolicyDeniedError(args: {
  mode: string;
  statusLabel: string;
  statusKey: string | null;
  deniedFields: string[];
}): { error: string; field?: string } {
  const nameOnlyDenied =
    args.deniedFields.length === 1 && args.deniedFields[0] === "name";
  // Map via lifecycle key so a renamed “Pending approval” label still matches.
  if (args.statusKey === "pending_cab" && nameOnlyDenied) {
    return {
      error: RELEASE_NAME_PENDING_CAB_DENIED_MESSAGE,
      field: "name",
    };
  }
  return {
    error: editPolicyDeniedMessage({
      entity: "release",
      mode: args.mode,
      statusLabel: args.statusLabel,
      deniedFields: args.deniedFields,
    }),
  };
}
