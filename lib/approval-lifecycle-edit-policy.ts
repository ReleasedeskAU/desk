/**
 * Field-edit policy for approvals by lifecycle decision status.
 */
import type {
  ApprovalEditMode,
  ApprovalLifecycleConfig,
} from "@/lib/approval-lifecycle-config";
import { resolveApprovalLifecycleStatusRef } from "@/lib/approval-lifecycle-transition";

const LIMITED_ALLOWED = new Set([
  "decision",
  "overrideReason",
  "comments",
  "decisionDate",
  "cabMeetingId",
  "conditions",
]);

const READ_ONLY_ALLOWED = new Set([
  "decision",
  "overrideReason",
  "comments",
  "conditions",
]);

/**
 * Resolve edit mode for the current approval decision.
 */
export function resolveApprovalEditMode(
  config: ApprovalLifecycleConfig,
  decision: string
): ApprovalEditMode {
  return resolveApprovalLifecycleStatusRef(config, decision)?.editMode ?? "full";
}

/**
 * Whether a PATCH field may change under the given mode.
 * `decision` / `overrideReason` always pass through (transition engine decides).
 */
export function isApprovalFieldEditable(
  mode: ApprovalEditMode,
  field: string
): boolean {
  if (field === "decision" || field === "overrideReason") return true;
  if (mode === "full") return true;
  if (mode === "immutable") return false;
  if (mode === "read_only") return READ_ONLY_ALLOWED.has(field);
  return LIMITED_ALLOWED.has(field);
}

/**
 * List denied PATCH keys for the current approval decision.
 */
export function deniedApprovalEditFields(
  config: ApprovalLifecycleConfig,
  currentDecision: string,
  proposedKeys: string[]
): { mode: ApprovalEditMode; denied: string[] } {
  const mode = resolveApprovalEditMode(config, currentDecision);
  const denied = proposedKeys.filter((key) => !isApprovalFieldEditable(mode, key));
  return { mode, denied };
}
