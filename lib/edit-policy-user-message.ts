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
