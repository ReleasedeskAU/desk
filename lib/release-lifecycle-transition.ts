/**
 * Pure release-status transition validation against a lifecycle config.
 *
 * Flexible unmet gates require a non-empty overrideReason. Required unmet
 * gates hard-block with no override path. Runtime gate facts are supplied by
 * the caller (PATCH loads them from the DB).
 */
import {
  RELEASE_LIFECYCLE_GATE_CATALOG,
  type ReleaseLifecycleGateType,
} from "@/lib/release-lifecycle-gates";
import {
  isLargeReleaseSize,
  validateReleaseDateOrder,
} from "@/lib/release-planning-entry-rules";
import {
  cabScopeChangedSinceSnapshot,
  type CabScopeSnapshot,
} from "@/lib/release-cab-scope-snapshot";
import type {
  ReleaseLifecycleConfig,
  ReleaseLifecycleEnforcement,
  ReleaseLifecycleGateAttachment,
  ReleaseLifecycleStatusConfig,
  ReleaseLifecycleTransitionConfig,
} from "@/lib/release-lifecycle-config";

export const MIN_LIFECYCLE_OVERRIDE_REASON_LENGTH = 3;

/** Facts the gate evaluators can inspect without free-form queries. */
export type ReleaseLifecycleGateFacts = {
  owner: string | null | undefined;
  releaseSize: string | null | undefined;
  priority: string | null | undefined;
  /** Release display name (§1-02). */
  name: string | null | undefined;
  /** Count of linked applications (§1-03). */
  applicationCount: number;
  /** Start Date — paired with releaseDate for VR-01. */
  startDate: Date | string | null | undefined;
  releaseDate: Date | string | null | undefined;
  rollbackPlan: string | null | undefined;
  /** Release notes — used for reactivation / rework / root-cause proxies. */
  notes: string | null | undefined;
  goLiveChecklistPercent: number | null | undefined;
  /** Count of blockers still open for this release. */
  openBlockerCount: number;
  /**
   * Count of linked incidents that block Deploying (AV-06): critical severity
   * and/or actively resolving statuses, excluding Resolved/Closed.
   */
  blockingIncidentCount: number;
  /** Count of linked incidents still non-terminal (VR-33 Close gate). */
  openIncidentCount: number;
  /** Detected/Under Review EnvironmentConflict rows involving this release (VR-32). */
  openEnvironmentConflictCount: number;
  /** BOOKED env bookings whose toDate is already past (AV-08). */
  expiredEnvBookingCount: number;
  /** True when `changeFreeze` is non-empty on the release (VR-05). */
  changeFreezeActive: boolean;
  /** True when DeploymentState.phase is Verified (§4-08). */
  deploymentOutcomeConfirmed: boolean;
  /** True when Test Sign-Off counts as complete (VR-30). */
  testSignoffComplete: boolean;
  /** True when Dress Rehearsal counts as complete (VR-26). */
  dressRehearsalComplete: boolean;
  /** True when Ops Sign-Off counts as complete (VR-31). */
  opsSignoffComplete: boolean;
  /** True when Business Sign-Off counts as complete (Ready-entry gate). */
  businessSignoffComplete: boolean;
  /**
   * Count of High-score linked risks that still have no mitigation plan (VR-27).
   * Closed / Accepted / Mitigated risks are excluded.
   */
  unmitigatedHighRiskCount: number;
  /** Incomplete linked Work Items by raw synced status (VR-29). */
  incompleteWorkItemCount: number;
  /** PIR completed flag (VR-34). */
  pirComplete: boolean;
  /** Scope fields at evaluation time for CAB compare. */
  scopeDescription: string | null | undefined;
  /** Snapshot captured at CAB approval (null = missing). */
  cabScopeSnapshot: CabScopeSnapshot | null;
  /** True when a UAT-purpose environment booking exists. */
  hasUatBooking: boolean;
  /** True when a deploy-purpose (or any active) deploy booking exists. */
  hasDeployBooking: boolean;
  /** True when all hard dependencies are Clear/Resolved. */
  hardDependenciesMet: boolean;
  /** True when required sign-off fields look complete. */
  signoffsComplete: boolean;
  /** Optional field bag for required_fields_set. */
  fields?: Record<string, unknown>;
};

export type TransitionResult =
  | {
      allowed: true;
      overridden: false;
      fromKey: string;
      toKey: string;
      canonicalStatus: string;
    }
  | {
      allowed: true;
      overridden: true;
      fromKey: string;
      toKey: string;
      canonicalStatus: string;
      ruleIds: string[];
      unmetReasons: string[];
      overrideReason: string;
    }
  | {
      allowed: false;
      code:
        | "UNKNOWN_STATUS"
        | "ILLEGAL_TRANSITION"
        | "TRANSITION_NEEDS_OVERRIDE"
        | "TRANSITION_BLOCKED";
      reason: string;
      ruleIds?: string[];
      unmetReasons?: string[];
      fromKey?: string;
      toKey?: string;
    };

function isPresent(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  return true;
}

/**
 * Resolve a client/DB status string to a config status (key or label, case-insensitive label).
 * No legacy alias map — unmatched values return null.
 */
export function resolveLifecycleStatusRef(
  config: ReleaseLifecycleConfig,
  raw: string | null | undefined
): ReleaseLifecycleStatusConfig | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  // Prefer enabled matches, but still resolve disabled statuses so releases
  // already sitting on a toggled-off stage remain enforceable / displayable.
  const byKeyEnabled = config.statuses.find((s) => s.key === trimmed && s.enabled);
  if (byKeyEnabled) return byKeyEnabled;
  const lower = trimmed.toLocaleLowerCase();
  const byLabelEnabled = config.statuses.find(
    (s) => s.enabled && s.label.trim().toLocaleLowerCase() === lower
  );
  if (byLabelEnabled) return byLabelEnabled;
  const byKeyAny = config.statuses.find((s) => s.key === trimmed);
  if (byKeyAny) return byKeyAny;
  return (
    config.statuses.find(
      (s) => s.label.trim().toLocaleLowerCase() === lower
    ) ?? null
  );
}

function effectiveGateEnforcement(
  transition: ReleaseLifecycleTransitionConfig,
  gate: ReleaseLifecycleGateAttachment
): ReleaseLifecycleEnforcement {
  if (gate.enforcement === "inherit") return transition.enforcement;
  return gate.enforcement;
}

type GateEval = {
  gateType: ReleaseLifecycleGateType;
  passed: boolean;
  reason: string;
  ruleIds: string[];
  enforcement: ReleaseLifecycleEnforcement;
};

/**
 * Evaluate one catalog gate against provided facts.
 * Missing/partial reliability still evaluates best-effort — unmet when unproven.
 */
export function evaluateLifecycleGate(
  gate: ReleaseLifecycleGateAttachment,
  facts: ReleaseLifecycleGateFacts,
  transition: ReleaseLifecycleTransitionConfig
): GateEval {
  const def = RELEASE_LIFECYCLE_GATE_CATALOG[gate.gateType];
  const enforcement = effectiveGateEnforcement(transition, gate);
  const base = {
    gateType: gate.gateType,
    ruleIds: [...def.ruleIds],
    enforcement,
  };

  const fail = (reason: string): GateEval => ({
    ...base,
    passed: false,
    reason,
  });
  const pass = (): GateEval => ({
    ...base,
    passed: true,
    reason: def.label,
  });

  if (!gate.enabled) return pass();

  switch (gate.gateType) {
    case "owner_set":
      return isPresent(facts.owner) ? pass() : fail("Owner is not set");
    case "size_set":
      return isPresent(facts.releaseSize) ? pass() : fail("Release size is not set");
    case "priority_set":
      return isPresent(facts.priority) ? pass() : fail("Priority is not set");
    case "name_set":
      return isPresent(facts.name) ? pass() : fail("Release name is not set");
    case "applications_linked":
      return facts.applicationCount > 0
        ? pass()
        : fail("At least one application must be linked");
    case "dates_ordered": {
      const dateError = validateReleaseDateOrder({
        startDate: facts.startDate,
        endDate: facts.releaseDate,
      });
      return dateError ? fail(dateError) : pass();
    }
    case "test_signoff_complete":
      return facts.testSignoffComplete
        ? pass()
        : fail("QA Sign-Off — Test Phase must be complete before UAT");
    case "go_live_date_set":
      return isPresent(facts.releaseDate)
        ? pass()
        : fail("Go-live date is not set");
    case "rollback_plan_documented":
      return isPresent(facts.rollbackPlan)
        ? pass()
        : fail("Rollback plan is not documented");
    case "no_open_blockers":
    case "blocker_resolved":
      return facts.openBlockerCount === 0
        ? pass()
        : fail(
            `${facts.openBlockerCount} open blocker${facts.openBlockerCount === 1 ? "" : "s"} remain`
          );
    case "no_blocking_incidents":
      return facts.blockingIncidentCount === 0
        ? pass()
        : fail(
            `${facts.blockingIncidentCount} blocking incident${facts.blockingIncidentCount === 1 ? "" : "s"} remain`
          );
    case "no_open_incidents":
      return facts.openIncidentCount === 0
        ? pass()
        : fail(
            `${facts.openIncidentCount} open incident${facts.openIncidentCount === 1 ? "" : "s"} remain`
          );
    case "no_open_environment_conflicts":
      return facts.openEnvironmentConflictCount === 0
        ? pass()
        : fail(
            `${facts.openEnvironmentConflictCount} unresolved environment conflict${facts.openEnvironmentConflictCount === 1 ? "" : "s"} still block Ready`
          );
    case "dress_rehearsal_for_large":
      // VR-26: warning only for Large; non-Large always passes.
      if (!isLargeReleaseSize(facts.releaseSize)) return pass();
      return facts.dressRehearsalComplete
        ? pass()
        : fail("Large release has no completed Dress Rehearsal");
    case "uat_environment_booked":
      return facts.hasUatBooking
        ? pass()
        : fail("No UAT environment booking on record");
    case "environment_booked_for_deploy":
      return facts.hasDeployBooking
        ? pass()
        : fail("No deployment environment booking on record");
    case "no_expired_env_bookings":
      return facts.expiredEnvBookingCount === 0
        ? pass()
        : fail(
            `${facts.expiredEnvBookingCount} environment booking${facts.expiredEnvBookingCount === 1 ? "" : "s"} expired`
          );
    case "outside_change_freeze":
      return facts.changeFreezeActive
        ? fail("Deploy date falls inside a recorded change-freeze window")
        : pass();
    case "hard_dependencies_met":
      return facts.hardDependenciesMet
        ? pass()
        : fail("Hard dependencies are not all clear");
    case "signoffs_complete":
      return facts.signoffsComplete
        ? pass()
        : fail("Required sign-offs are incomplete");
    case "deployment_outcome_confirmed":
      return facts.deploymentOutcomeConfirmed
        ? pass()
        : fail("Deployment outcome must be Verified before Deployed");
    case "pre_deployment_checklist_complete":
      return typeof facts.goLiveChecklistPercent === "number" &&
        facts.goLiveChecklistPercent >= 100
        ? pass()
        : fail("Pre-deployment checklist is not complete");
    case "required_fields_set": {
      const fields = gate.params?.fields;
      if (!Array.isArray(fields) || fields.length === 0) {
        return fail("required_fields_set has no approved fields configured");
      }
      const bag = facts.fields ?? {};
      const missing = fields.filter(
        (field) => typeof field === "string" && !isPresent(bag[field])
      );
      return missing.length === 0
        ? pass()
        : fail(`Required fields missing: ${missing.join(", ")}`);
    }
    case "scope_unchanged_since_cab": {
      const scopeError = cabScopeChangedSinceSnapshot(facts.cabScopeSnapshot, {
        releaseSize: facts.releaseSize,
        priority: facts.priority,
        scopeDescription: facts.scopeDescription,
      });
      return scopeError ? fail(scopeError) : pass();
    }
    case "ops_signoff_complete":
      return facts.opsSignoffComplete
        ? pass()
        : fail("Operations Review must be complete before Ready");
    case "business_signoff_complete":
      return facts.businessSignoffComplete
        ? pass()
        : fail("Business Review must be complete before Ready");
    case "high_risks_mitigated":
      return facts.unmitigatedHighRiskCount === 0
        ? pass()
        : fail(
            `${facts.unmitigatedHighRiskCount} high-score risk${facts.unmitigatedHighRiskCount === 1 ? "" : "s"} still ${facts.unmitigatedHighRiskCount === 1 ? "has" : "have"} no mitigation plan`
          );
    case "work_items_complete":
      return facts.incompleteWorkItemCount === 0
        ? pass()
        : fail(
            `${facts.incompleteWorkItemCount} linked work item${facts.incompleteWorkItemCount === 1 ? "" : "s"} still incomplete`
          );
    case "pir_complete":
      return facts.pirComplete
        ? pass()
        : fail("Post-Implementation Review must be completed before Close");
    case "post_deployment_validation_complete":
      // Best-effort until a dedicated validation record exists.
      return typeof facts.goLiveChecklistPercent === "number" &&
        facts.goLiveChecklistPercent >= 100
        ? pass()
        : fail("Post-deployment validation is not complete (checklist must be 100%)");
    case "root_cause_documented":
      return isPresent(facts.notes) || isPresent(facts.rollbackPlan)
        ? pass()
        : fail("Root cause is not documented (add notes or a rollback plan)");
    case "reactivation_decision_recorded":
      return isPresent(facts.notes)
        ? pass()
        : fail("Reactivation decision is not recorded (add notes before leaving Deferred)");
    case "rework_acknowledged":
      return isPresent(facts.notes)
        ? pass()
        : fail("Rework is not acknowledged (add notes before returning to Planning)");
    default:
      return fail(`Unhandled gate type: ${String(gate.gateType)}`);
  }
}

function findEnabledTransition(
  config: ReleaseLifecycleConfig,
  fromKey: string,
  toKey: string,
  isPreviousStatus: boolean
): ReleaseLifecycleTransitionConfig | null {
  return (
    config.transitions.find((item) => {
      if (!item.enabled || item.fromKey !== fromKey) return false;
      if (isPreviousStatus) return item.isPreviousStatus;
      return !item.isPreviousStatus && item.toKey === toKey;
    }) ?? null
  );
}

/**
 * Sheet “any previous status” from an interrupt (Blocked): return to an enabled
 * mainline or branch stage — not another interrupt and not a final status.
 *
 * @param from - Current status (must be an interrupt for this to apply).
 * @param to - Candidate return status.
 * @returns True when the wildcard previous-status edge may land here.
 */
export function isEligiblePreviousReturnTarget(
  from: Pick<ReleaseLifecycleStatusConfig, "kind" | "key">,
  to: Pick<ReleaseLifecycleStatusConfig, "kind" | "key" | "enabled" | "terminal">
): boolean {
  if (from.kind !== "interrupt") return false;
  if (!to.enabled || to.terminal || to.key === from.key) return false;
  return to.kind === "mainline" || to.kind === "branch";
}

/**
 * Validate a status transition against the supplied lifecycle config.
 *
 * @param args.fromStatus - Current Release.status (key or label)
 * @param args.toStatus - Requested next status (key or label)
 * @param args.previousStatus - Prior status for `__previous__` interrupt returns
 * @param args.overrideReason - Required when Flexible gates are unmet
 * @param args.gateFacts - Evaluated checklist facts for attached gates
 */
export function validateReleaseTransition(args: {
  config: ReleaseLifecycleConfig;
  fromStatus: string;
  toStatus: string;
  previousStatus?: string | null;
  overrideReason?: string | null;
  gateFacts: ReleaseLifecycleGateFacts;
}): TransitionResult {
  const from = resolveLifecycleStatusRef(args.config, args.fromStatus);
  const toRequested = resolveLifecycleStatusRef(args.config, args.toStatus);

  if (!from || !toRequested) {
    const which = !from && !toRequested
      ? `current ("${args.fromStatus}") and requested ("${args.toStatus}")`
      : !from
        ? `current ("${args.fromStatus}")`
        : `requested ("${args.toStatus}")`;
    return {
      allowed: false,
      code: "UNKNOWN_STATUS",
      reason: `This status isn’t in your workflow settings. Pick a status that exists under Lifecycle, or ask an admin to update the workflow.`,
    };
  }

  if (from.key === toRequested.key) {
    return {
      allowed: true,
      overridden: false,
      fromKey: from.key,
      toKey: toRequested.key,
      canonicalStatus: toRequested.label,
    };
  }

  // Disabled targets stay in the catalog for history, but are not selectable.
  if (!toRequested.enabled) {
    return {
      allowed: false,
      code: "ILLEGAL_TRANSITION",
      reason: `“${toRequested.label}” is turned off in workflow settings, so it can’t be chosen as a next step.`,
      fromKey: from.key,
      toKey: toRequested.key,
    };
  }

  if (from.terminal) {
    return {
      allowed: false,
      code: "ILLEGAL_TRANSITION",
      reason: `“${from.label}” is a final status — this release can’t move on from here.`,
      fromKey: from.key,
      toKey: toRequested.key,
    };
  }

  // Sheet: Blocked → any previous working status (mainline/branch), not only
  // the single audit-derived prior label.
  const transition =
    findEnabledTransition(
      args.config,
      from.key,
      toRequested.key,
      false
    ) ??
    (isEligiblePreviousReturnTarget(from, toRequested)
      ? findEnabledTransition(args.config, from.key, toRequested.key, true)
      : null);

  if (!transition) {
    return {
      allowed: false,
      code: "ILLEGAL_TRANSITION",
      reason: `You can’t move this release from “${from.label}” to “${toRequested.label}”. That step isn’t allowed from here.`,
      fromKey: from.key,
      toKey: toRequested.key,
    };
  }

  const enabledGates = transition.gates.filter((g) => g.enabled);
  const evaluations = enabledGates.map((gate) =>
    evaluateLifecycleGate(gate, args.gateFacts, transition)
  );
  const unmet = evaluations.filter((e) => !e.passed);
  if (unmet.length === 0) {
    return {
      allowed: true,
      overridden: false,
      fromKey: from.key,
      toKey: toRequested.key,
      canonicalStatus: toRequested.label,
    };
  }

  const requiredUnmet = unmet.filter((e) => e.enforcement === "required");
  const flexibleUnmet = unmet.filter((e) => e.enforcement === "flexible");
  const unmetReasons = unmet.map((e) => e.reason);
  const ruleIds = [...new Set(unmet.flatMap((e) => e.ruleIds))];

  if (requiredUnmet.length > 0) {
    return {
      allowed: false,
      code: "TRANSITION_BLOCKED",
      reason:
        "This status change is blocked. Required checks aren’t met, and this step doesn’t allow an exception. Fix the items listed below, then try again.",
      unmetReasons: requiredUnmet.map((e) => e.reason),
      ruleIds: [...new Set(requiredUnmet.flatMap((e) => e.ruleIds))],
      fromKey: from.key,
      toKey: toRequested.key,
    };
  }

  const reasonText = (args.overrideReason ?? "").trim();
  if (reasonText.length < MIN_LIFECYCLE_OVERRIDE_REASON_LENGTH) {
    return {
      allowed: false,
      code: "TRANSITION_NEEDS_OVERRIDE",
      reason:
        "This step needs an exception note. Some checks aren’t met. Enter a short reason (at least 3 characters) explaining why you’re allowed to continue, then try again.",
      unmetReasons,
      ruleIds,
      fromKey: from.key,
      toKey: toRequested.key,
    };
  }

  return {
    allowed: true,
    overridden: true,
    fromKey: from.key,
    toKey: toRequested.key,
    canonicalStatus: toRequested.label,
    ruleIds,
    unmetReasons,
    overrideReason: reasonText,
  };
}

/** Empty facts for unit tests / transitions with no gates. */
export function emptyLifecycleGateFacts(
  overrides: Partial<ReleaseLifecycleGateFacts> = {}
): ReleaseLifecycleGateFacts {
  return {
    owner: null,
    releaseSize: null,
    priority: null,
    name: null,
    applicationCount: 0,
    startDate: null,
    releaseDate: null,
    rollbackPlan: null,
    notes: null,
    goLiveChecklistPercent: null,
    openBlockerCount: 0,
    blockingIncidentCount: 0,
    openIncidentCount: 0,
    openEnvironmentConflictCount: 0,
    expiredEnvBookingCount: 0,
    changeFreezeActive: false,
    deploymentOutcomeConfirmed: false,
    testSignoffComplete: false,
    dressRehearsalComplete: false,
    opsSignoffComplete: false,
    businessSignoffComplete: false,
    unmitigatedHighRiskCount: 0,
    incompleteWorkItemCount: 0,
    pirComplete: false,
    scopeDescription: null,
    cabScopeSnapshot: null,
    hasUatBooking: false,
    hasDeployBooking: false,
    hardDependenciesMet: true,
    signoffsComplete: false,
    fields: {},
    ...overrides,
  };
}

export type LegalNextGateView = {
  gateType: ReleaseLifecycleGateType;
  label: string;
  passed: boolean;
  enforcement: ReleaseLifecycleEnforcement;
  reason: string;
  /** Flexible unmet — warn / needs override. */
  soft: boolean;
  /** Required unmet — hard block. */
  hard: boolean;
};

export type LegalNextStatusView = {
  key: string;
  label: string;
  kind: ReleaseLifecycleStatusConfig["kind"];
  isPreviousStatus: boolean;
  transitionEnforcement: ReleaseLifecycleEnforcement;
  gates: LegalNextGateView[];
  outcome: "allowed" | "needs_override" | "blocked";
};

/**
 * List legal next statuses from the current status with inline gate feedback.
 * Does not consume overrideReason — used by the status picker preview.
 */
export function listLegalNextStatuses(args: {
  config: ReleaseLifecycleConfig;
  fromStatus: string;
  previousStatus?: string | null;
  gateFacts: ReleaseLifecycleGateFacts;
}): LegalNextStatusView[] {
  const from = resolveLifecycleStatusRef(args.config, args.fromStatus);
  if (!from || from.terminal) return [];

  const previous = resolveLifecycleStatusRef(args.config, args.previousStatus);
  const statusByKey = new Map(args.config.statuses.map((s) => [s.key, s]));
  const edges = args.config.transitions.filter(
    (item) => item.enabled && item.fromKey === from.key
  );

  const results: LegalNextStatusView[] = [];
  const pushTarget = (
    edge: (typeof edges)[number],
    to: ReleaseLifecycleStatusConfig
  ) => {
    const evaluations = edge.gates
      .filter((g) => g.enabled)
      .map((gate) => evaluateLifecycleGate(gate, args.gateFacts, edge));
    const gates: LegalNextGateView[] = evaluations.map((e) => ({
      gateType: e.gateType,
      label: RELEASE_LIFECYCLE_GATE_CATALOG[e.gateType].label,
      passed: e.passed,
      enforcement: e.enforcement,
      reason: e.reason,
      soft: !e.passed && e.enforcement === "flexible",
      hard: !e.passed && e.enforcement === "required",
    }));
    const hasHard = gates.some((g) => g.hard);
    const hasSoft = gates.some((g) => g.soft);
    results.push({
      key: to.key,
      label: to.label,
      kind: to.kind,
      isPreviousStatus: edge.isPreviousStatus,
      transitionEnforcement: edge.enforcement,
      gates,
      outcome: hasHard ? "blocked" : hasSoft ? "needs_override" : "allowed",
    });
  };

  for (const edge of edges) {
    if (edge.isPreviousStatus) {
      // Sheet: any previous working status. Prefer listing the recorded prior
      // first; always include every eligible mainline/branch return.
      const returns = args.config.statuses
        .filter((status) => isEligiblePreviousReturnTarget(from, status))
        .sort((a, b) => {
          if (previous && a.key === previous.key) return -1;
          if (previous && b.key === previous.key) return 1;
          return a.sortOrder - b.sortOrder || a.label.localeCompare(b.label);
        });
      for (const to of returns) pushTarget(edge, to);
      continue;
    }
    if (!edge.toKey) continue;
    const to = statusByKey.get(edge.toKey) ?? null;
    if (!to || !to.enabled) continue;
    pushTarget(edge, to);
  }

  return results.sort((a, b) => a.label.localeCompare(b.label));
}

/** Build the mainline rail + interrupt panel model for the detail stepper. */
export function buildLifecycleStepperModel(args: {
  config: ReleaseLifecycleConfig;
  currentStatus: string;
}): {
  currentKey: string | null;
  currentLabel: string;
  mainline: {
    key: string;
    label: string;
    state: "complete" | "current" | "upcoming";
  }[];
  interruptPanels: {
    key: string;
    label: string;
    kind: ReleaseLifecycleStatusConfig["kind"];
    active: boolean;
  }[];
} {
  const current = resolveLifecycleStatusRef(args.config, args.currentStatus);
  // Show every enabled status in configured order; keep the current stage
  // visible even if it was toggled off after the release landed there.
  const enabled = args.config.statuses
    .filter((s) => s.enabled || (current != null && s.key === current.key))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));

  const mainlineStatuses = enabled.filter(
    (s) => s.kind === "mainline" || (s.kind === "terminal" && s.key === "closed")
  );
  const interruptStatuses = enabled.filter(
    (s) =>
      s.kind === "interrupt" ||
      s.kind === "branch" ||
      (s.kind === "terminal" && s.key !== "closed")
  );

  const currentIdx = current
    ? mainlineStatuses.findIndex((s) => s.key === current.key)
    : -1;
  const onMainline = currentIdx >= 0;

  return {
    currentKey: current?.key ?? null,
    currentLabel: current?.label ?? args.currentStatus,
    mainline: mainlineStatuses.map((s, idx) => ({
      key: s.key,
      label: s.label,
      state: !onMainline
        ? ("upcoming" as const)
        : idx < currentIdx
          ? ("complete" as const)
          : idx === currentIdx
            ? ("current" as const)
            : ("upcoming" as const),
    })),
    interruptPanels: interruptStatuses.map((s) => ({
      key: s.key,
      label: s.label,
      kind: s.kind,
      active: current?.key === s.key,
    })),
  };
}
