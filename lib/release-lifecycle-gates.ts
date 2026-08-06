/**
 * Fixed catalog of Release lifecycle gates.
 *
 * Users may attach these known gate types to transitions, but cannot provide
 * executable/free-form rules. Runtime evaluators are added with Wave 1.
 */

export const RELEASE_LIFECYCLE_GATE_TYPES = [
  "required_fields_set",
  "owner_set",
  "size_set",
  "priority_set",
  "uat_environment_booked",
  "signoffs_complete",
  "go_live_date_set",
  "no_open_blockers",
  "scope_unchanged_since_cab",
  "rollback_plan_documented",
  "pre_deployment_checklist_complete",
  "environment_booked_for_deploy",
  "hard_dependencies_met",
  "post_deployment_validation_complete",
  "blocker_resolved",
  "root_cause_documented",
] as const;

export type ReleaseLifecycleGateType =
  (typeof RELEASE_LIFECYCLE_GATE_TYPES)[number];

export type GateDataReliability = "reliable" | "partial" | "missing";

export type ReleaseLifecycleGateDefinition = {
  label: string;
  description: string;
  ruleIds: readonly string[];
  dataReliability: GateDataReliability;
  futureFollowUp?: string;
};

/**
 * Gate metadata and known data reliability.
 *
 * Security: this catalog contains metadata only. It never evaluates client
 * supplied code, expressions, property paths, or database queries.
 */
export const RELEASE_LIFECYCLE_GATE_CATALOG: Readonly<
  Record<ReleaseLifecycleGateType, ReleaseLifecycleGateDefinition>
> = {
  required_fields_set: {
    label: "Required fields set",
    description: "Selected predefined Release fields must contain values.",
    ruleIds: [],
    dataReliability: "reliable",
  },
  owner_set: {
    label: "Owner set",
    description: "The Release owner must be populated.",
    ruleIds: ["§1-04"],
    dataReliability: "reliable",
  },
  size_set: {
    label: "Release size set",
    description: "The Release releaseSize field must be populated.",
    ruleIds: ["§1-06"],
    dataReliability: "reliable",
  },
  priority_set: {
    label: "Priority set",
    description: "The Release priority must be populated.",
    ruleIds: ["§1-05"],
    dataReliability: "reliable",
  },
  uat_environment_booked: {
    label: "UAT environment booked",
    description: "A valid UAT environment booking must exist for the Release.",
    ruleIds: ["UAT-ENV"],
    dataReliability: "partial",
  },
  signoffs_complete: {
    label: "Sign-offs complete",
    description: "All required Release sign-offs must be complete.",
    ruleIds: ["VR-14"],
    dataReliability: "partial",
  },
  go_live_date_set: {
    label: "Go-live date set",
    description: "The Release go-live date must be populated.",
    ruleIds: ["VR-24"],
    dataReliability: "reliable",
  },
  no_open_blockers: {
    label: "No open blockers",
    description: "The Release must have no unresolved blocker records.",
    ruleIds: ["VR-24", "VR-27"],
    dataReliability: "reliable",
  },
  scope_unchanged_since_cab: {
    label: "Scope unchanged since CAB",
    description: "No Release scope change may have occurred after CAB approval.",
    ruleIds: ["VR-21"],
    dataReliability: "missing",
    futureFollowUp: "Capture a CAB approval scope snapshot before making this gate Required.",
  },
  rollback_plan_documented: {
    label: "Rollback plan documented",
    description: "The Release rollback plan must be documented.",
    ruleIds: ["VR-16"],
    dataReliability: "partial",
  },
  pre_deployment_checklist_complete: {
    label: "Pre-deployment checklist complete",
    description: "The Release go-live checklist must be complete.",
    ruleIds: ["VR-27"],
    dataReliability: "partial",
  },
  environment_booked_for_deploy: {
    label: "Environment booked for deploy",
    description: "A valid deployment environment booking must exist.",
    ruleIds: ["VR-19"],
    dataReliability: "partial",
    futureFollowUp:
      "Capture an explicit deploy-purpose booking before making Deploying → Deployed Required.",
  },
  hard_dependencies_met: {
    label: "Hard dependencies met",
    description: "All hard Release dependencies must be satisfied.",
    ruleIds: ["VR-18"],
    dataReliability: "partial",
  },
  post_deployment_validation_complete: {
    label: "Post-deployment validation complete",
    description: "Post-deployment validation must be recorded as complete.",
    ruleIds: ["POST-DEPLOY-VALIDATION"],
    dataReliability: "missing",
    futureFollowUp:
      "Add a trustworthy validation record before making Deployed → Closed Required.",
  },
  blocker_resolved: {
    label: "Blocker resolved",
    description: "All blockers must be resolved before leaving Blocked.",
    ruleIds: ["§4-13"],
    dataReliability: "reliable",
  },
  root_cause_documented: {
    label: "Root cause documented",
    description: "Rollback root-cause documentation must be present.",
    ruleIds: ["§4-10"],
    dataReliability: "missing",
    futureFollowUp: "Add a dedicated rollback root-cause field or record.",
  },
};

const ALLOWED_REQUIRED_FIELDS = new Set([
  "owner",
  "releaseSize",
  "priority",
  "releaseDate",
  "rollbackPlan",
]);

/** Return true only for gate keys implemented by the fixed catalog. */
export function isReleaseLifecycleGateType(
  value: string
): value is ReleaseLifecycleGateType {
  return Object.prototype.hasOwnProperty.call(
    RELEASE_LIFECYCLE_GATE_CATALOG,
    value
  );
}

/**
 * Validate optional catalog parameters without accepting arbitrary field paths.
 * @returns null when valid, otherwise a safe human-readable validation error.
 */
export function validateReleaseLifecycleGateParams(
  gateType: ReleaseLifecycleGateType,
  params: Record<string, unknown> | null | undefined
): string | null {
  if (gateType !== "required_fields_set") {
    return params == null || Object.keys(params).length === 0
      ? null
      : `${gateType} does not accept parameters`;
  }

  const fields = params?.fields;
  if (
    !Array.isArray(fields) ||
    fields.length < 1 ||
    fields.length > ALLOWED_REQUIRED_FIELDS.size ||
    fields.some(
      (field) => typeof field !== "string" || !ALLOWED_REQUIRED_FIELDS.has(field)
    )
  ) {
    return "required_fields_set.fields must contain only approved Release fields";
  }
  return new Set(fields).size === fields.length
    ? null
    : "required_fields_set.fields must be unique";
}
