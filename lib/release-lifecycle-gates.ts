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
  "name_set",
  "applications_linked",
  "dates_ordered",
  "test_signoff_complete",
  "uat_environment_booked",
  "signoffs_complete",
  "go_live_date_set",
  "no_open_blockers",
  "no_blocking_incidents",
  "no_open_incidents",
  "no_open_environment_conflicts",
  "dress_rehearsal_for_large",
  "scope_unchanged_since_cab",
  "ops_signoff_complete",
  "high_risks_mitigated",
  "work_items_complete",
  "pir_complete",
  "rollback_plan_documented",
  "pre_deployment_checklist_complete",
  "environment_booked_for_deploy",
  "no_expired_env_bookings",
  "outside_change_freeze",
  "hard_dependencies_met",
  "deployment_outcome_confirmed",
  "post_deployment_validation_complete",
  "blocker_resolved",
  "root_cause_documented",
  "reactivation_decision_recorded",
  "rework_acknowledged",
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
    description: "Release size must be set.",
    ruleIds: ["§1-06"],
    dataReliability: "reliable",
  },
  priority_set: {
    label: "Priority set",
    description: "The Release priority must be populated.",
    ruleIds: ["§1-05"],
    dataReliability: "reliable",
  },
  name_set: {
    label: "Release name set",
    description: "The Release name must be populated.",
    ruleIds: ["§1-02"],
    dataReliability: "reliable",
  },
  applications_linked: {
    label: "Application linked",
    description: "At least one application must be linked to the Release.",
    ruleIds: ["§1-03"],
    dataReliability: "reliable",
  },
  dates_ordered: {
    label: "Dates ordered",
    description: "End Date (release date) must not be before Start Date.",
    ruleIds: ["VR-01"],
    dataReliability: "reliable",
  },
  test_signoff_complete: {
    label: "Test sign-off complete",
    description: "Test Sign-Off must be complete before leaving Testing for UAT.",
    ruleIds: ["VR-30"],
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
    // VR-15: blocks entry to Ready; also used on Pending CAB → CAB Approved.
    ruleIds: ["VR-15", "VR-24"],
    dataReliability: "reliable",
  },
  no_blocking_incidents: {
    label: "No blocking incidents",
    description:
      "The Release must have no linked critical or actively resolving incidents.",
    ruleIds: ["AV-06"],
    dataReliability: "reliable",
  },
  no_open_incidents: {
    label: "No open incidents",
    description:
      "The Release must have no linked incidents still in a non-terminal status.",
    ruleIds: ["VR-33"],
    dataReliability: "reliable",
  },
  no_open_environment_conflicts: {
    label: "No open environment conflicts",
    description:
      "Detected or Under Review environment conflicts must be cleared before Ready.",
    ruleIds: ["VR-32"],
    dataReliability: "reliable",
  },
  dress_rehearsal_for_large: {
    label: "Dress rehearsal for large releases",
    description:
      "Large releases should complete Dress Rehearsal before Ready (warning only).",
    ruleIds: ["VR-26"],
    dataReliability: "reliable",
  },
  scope_unchanged_since_cab: {
    label: "Scope unchanged since CAB",
    description:
      "Size, Priority, and Scope Description must match the snapshot taken at CAB approval.",
    ruleIds: ["VR-21"],
    dataReliability: "reliable",
  },
  ops_signoff_complete: {
    label: "Ops sign-off complete",
    description: "Ops Sign-Off must be complete before Ready.",
    ruleIds: ["VR-31"],
    dataReliability: "reliable",
  },
  high_risks_mitigated: {
    label: "High risks have a mitigation plan",
    description:
      "Every High-score risk on this release must have a mitigation plan before Ready. Closed, accepted, or already mitigated risks are ignored.",
    ruleIds: ["VR-27"],
    dataReliability: "reliable",
  },
  work_items_complete: {
    label: "Linked work items complete",
    description:
      "Linked Work Items must be in a terminal synced status before Deploying.",
    ruleIds: ["VR-29"],
    dataReliability: "partial",
  },
  pir_complete: {
    label: "Post-implementation review complete",
    description:
      "Post-Implementation Review must be marked complete before Close.",
    ruleIds: ["VR-34"],
    dataReliability: "reliable",
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
    // VR-16 enabler: Deployment Checklist must be complete before Ready.
    ruleIds: ["VR-16"],
    dataReliability: "partial",
  },
  environment_booked_for_deploy: {
    label: "Environment booked for deploy",
    description: "A valid deployment environment booking must exist.",
    ruleIds: ["VR-19"],
    dataReliability: "partial",
  },
  no_expired_env_bookings: {
    label: "No expired environment bookings",
    description:
      "Active environment bookings must not be past their end date before Deploying.",
    ruleIds: ["AV-08"],
    dataReliability: "reliable",
  },
  outside_change_freeze: {
    label: "Outside change freeze",
    description:
      "Deploying is blocked while a change-freeze window is recorded on the Release.",
    ruleIds: ["VR-05"],
    dataReliability: "partial",
  },
  hard_dependencies_met: {
    label: "Hard dependencies met",
    description: "All hard Release dependencies must be satisfied.",
    // VR-16 (Ready entry) + VR-18 (Deploying entry) share this evaluator today.
    ruleIds: ["VR-16", "VR-18"],
    dataReliability: "partial",
  },
  deployment_outcome_confirmed: {
    label: "Deployment outcome confirmed",
    description:
      "Deployment must be Verified before the Release can move to Deployed.",
    ruleIds: ["§4-08"],
    dataReliability: "reliable",
  },
  post_deployment_validation_complete: {
    label: "Post-deployment validation complete",
    description:
      "Post-deployment validation must be recorded (go-live checklist at 100% until a dedicated field exists).",
    ruleIds: ["POST-DEPLOY-VALIDATION"],
    dataReliability: "partial",
  },
  blocker_resolved: {
    label: "Blocker resolved",
    description: "All blockers must be resolved before leaving Blocked.",
    ruleIds: ["§4-13"],
    dataReliability: "reliable",
  },
  root_cause_documented: {
    label: "Root cause documented",
    description:
      "Rollback root-cause documentation must be present (notes or rollback plan until a dedicated field exists).",
    ruleIds: ["§4-10"],
    dataReliability: "partial",
  },
  reactivation_decision_recorded: {
    label: "Reactivation decision recorded",
    description: "A reactivation decision must be recorded before leaving Deferred.",
    ruleIds: ["CAB-REACTIVATE"],
    dataReliability: "partial",
  },
  rework_acknowledged: {
    label: "Rework acknowledged",
    description: "Rework after CAB rejection must be acknowledged before returning to Planning.",
    ruleIds: ["§4-12"],
    dataReliability: "partial",
  },
};

const ALLOWED_REQUIRED_FIELDS = new Set([
  "owner",
  "releaseSize",
  "priority",
  "releaseDate",
  "rollbackPlan",
]);

/**
 * Default field list when attaching "Required fields set" from the Gates UI.
 * Security: only whitelist keys from ALLOWED_REQUIRED_FIELDS — never free-form paths.
 */
export const DEFAULT_REQUIRED_FIELDS_SET_FIELDS: readonly string[] = [
  "owner",
  "priority",
  "releaseSize",
];

/**
 * Optional default params when attaching a catalog gate from settings.
 * @param gateType - Fixed catalog gate key.
 * @returns Params object, or undefined when the gate takes none.
 */
export function defaultParamsForLifecycleGate(
  gateType: ReleaseLifecycleGateType
): Record<string, unknown> | undefined {
  if (gateType === "required_fields_set") {
    return { fields: [...DEFAULT_REQUIRED_FIELDS_SET_FIELDS] };
  }
  return undefined;
}

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
    return "Required fields set needs at least one approved Release field (owner, priority, release size, release date, or rollback plan).";
  }
  return new Set(fields).size === fields.length
    ? null
    : "Required fields set cannot list the same field twice.";
}
