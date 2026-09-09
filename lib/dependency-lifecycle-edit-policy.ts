/**
 * Field-edit policy for dependencies by lifecycle status.
 */
import type {
  DependencyEditMode,
  DependencyLifecycleConfig,
} from "@/lib/dependency-lifecycle-config";
import { resolveDependencyLifecycleStatusRef } from "@/lib/dependency-lifecycle-transition";

const LIMITED_ALLOWED = new Set(["status", "overrideReason", "notes", "acknowledgeSide"]);
const READ_ONLY_ALLOWED = new Set(["status", "overrideReason", "notes", "acknowledgeSide"]);

/**
 * Edit-form body keys whose visibility follows the lifecycle edit policy.
 * Matches the Entity Field Locks Dependencies rows that the form actually renders.
 * Origin and Dep ID are not form fields (Dep ID is the locked identity label).
 */
export const DEPENDENCY_EDIT_FORM_FIELDS = [
  "releaseId",
  "dependsOnReleaseId",
  "dependencyType",
  "status",
  "impactIfBlocked",
  "notes",
] as const;

export type DependencyEditFormField = (typeof DEPENDENCY_EDIT_FORM_FIELDS)[number];

export type DependencyEditFormDraft = {
  releaseId: string;
  dependsOnReleaseId: string;
  dependencyType: string;
  status: string;
  impactIfBlocked: string;
  notes: string;
};

/**
 * Resolve edit mode for the current dependency status.
 */
export function resolveDependencyEditMode(
  config: DependencyLifecycleConfig,
  status: string
): DependencyEditMode {
  return resolveDependencyLifecycleStatusRef(config, status)?.editMode ?? "full";
}

/**
 * Whether a PATCH field may change under the given mode.
 */
export function isDependencyFieldEditable(
  mode: DependencyEditMode,
  field: string
): boolean {
  if (field === "status" || field === "overrideReason") return true;
  if (mode === "full") return true;
  if (mode === "immutable") return false;
  if (mode === "read_only") return READ_ONLY_ALLOWED.has(field);
  return LIMITED_ALLOWED.has(field);
}

/**
 * List denied PATCH keys for the current dependency status.
 */
export function deniedDependencyEditFields(
  config: DependencyLifecycleConfig,
  currentStatus: string,
  proposedKeys: string[]
): { mode: DependencyEditMode; denied: string[] } {
  const mode = resolveDependencyEditMode(config, currentStatus);
  const denied = proposedKeys.filter(
    (key) => !isDependencyFieldEditable(mode, key)
  );
  return { mode, denied };
}

/**
 * Whether an edit-form field is relevant for the selected next status.
 * Resolves by status key or label (tenant rename-safe). Hidden when the
 * edit policy locks the field; shown when editable or Limited-allowed.
 * Status stays visible so the next-step picker remains available.
 * When config is missing, fields stay visible (do not guess a lock).
 *
 * @param config - Live dependency lifecycle config, or null while loading
 * @param selectedStatus - Draft / selected next status (key or label)
 * @param field - Edit-form body key
 */
export function isDependencyEditFormFieldVisible(
  config: DependencyLifecycleConfig | null | undefined,
  selectedStatus: string,
  field: string
): boolean {
  if (field === "status") return true;
  if (!config) return true;
  return isDependencyFieldEditable(
    resolveDependencyEditMode(config, selectedStatus),
    field
  );
}

/**
 * Edit-form fields that should render for the selected next status.
 *
 * @param config - Live dependency lifecycle config, or null while loading
 * @param selectedStatus - Draft / selected next status (key or label)
 */
export function visibleDependencyEditFormFields(
  config: DependencyLifecycleConfig | null | undefined,
  selectedStatus: string
): DependencyEditFormField[] {
  return DEPENDENCY_EDIT_FORM_FIELDS.filter((field) =>
    isDependencyEditFormFieldVisible(config, selectedStatus, field)
  );
}

/**
 * PATCH body for the dependency edit form: only fields visible for the
 * selected next status. Status is always included. Notes empty → null.
 *
 * @param config - Live dependency lifecycle config, or null while loading
 * @param draft - Current edit-form values
 */
export function dependencyEditFormPatchBody(
  config: DependencyLifecycleConfig | null | undefined,
  draft: DependencyEditFormDraft
): {
  releaseId?: string;
  dependsOnReleaseId?: string;
  dependencyType?: string;
  status: string;
  impactIfBlocked?: string;
  notes?: string | null;
} {
  const status = draft.status;
  const body: {
    releaseId?: string;
    dependsOnReleaseId?: string;
    dependencyType?: string;
    status: string;
    impactIfBlocked?: string;
    notes?: string | null;
  } = { status };
  if (isDependencyEditFormFieldVisible(config, status, "releaseId")) {
    body.releaseId = draft.releaseId;
  }
  if (isDependencyEditFormFieldVisible(config, status, "dependsOnReleaseId")) {
    body.dependsOnReleaseId = draft.dependsOnReleaseId;
  }
  if (isDependencyEditFormFieldVisible(config, status, "dependencyType")) {
    body.dependencyType = draft.dependencyType;
  }
  if (isDependencyEditFormFieldVisible(config, status, "impactIfBlocked")) {
    body.impactIfBlocked = draft.impactIfBlocked;
  }
  if (isDependencyEditFormFieldVisible(config, status, "notes")) {
    body.notes = draft.notes.trim() ? draft.notes.trim() : null;
  }
  return body;
}
