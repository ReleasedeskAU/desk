/**
 * One-click status transitions offered in the DECIDE zone of detail pages.
 *
 * Detail pages previously required opening the edit modal to change a status,
 * which buried the most common action behind a form. These rules name the
 * single most likely next transition for a record plus its alternatives, so
 * "resolve this blocker" is one button rather than a six-step edit.
 *
 * Pure module — the API route still validates the resulting status and
 * enforces the editor role, so these are suggestions, never authorization.
 */
import { createDefaultAlertLifecycleConfig } from "./alert-lifecycle-config";
import type { AlertLifecycleConfig } from "./alert-lifecycle-config";
import { resolveAlertLifecycleStatusRef } from "./alert-lifecycle-transition";
import { createDefaultApprovalLifecycleConfig } from "./approval-lifecycle-config";
import type { ApprovalLifecycleConfig } from "./approval-lifecycle-config";
import { resolveApprovalLifecycleStatusRef } from "./approval-lifecycle-transition";
import { createDefaultBlockerLifecycleConfig } from "./blocker-lifecycle-config";
import type { BlockerLifecycleConfig } from "./blocker-lifecycle-config";
import {
  legalNextBlockerStatuses,
  resolveBlockerLifecycleStatusRef,
} from "./blocker-lifecycle-transition";
import { createDefaultConflictLifecycleConfig } from "./conflict-lifecycle-config";
import type { ConflictLifecycleConfig } from "./conflict-lifecycle-config";
import { resolveConflictLifecycleStatusRef } from "./conflict-lifecycle-transition";
import { createDefaultDependencyLifecycleConfig } from "./dependency-lifecycle-config";
import type { DependencyLifecycleConfig } from "./dependency-lifecycle-config";
import { resolveDependencyLifecycleStatusRef } from "./dependency-lifecycle-transition";
import { createDefaultDriftLifecycleConfig } from "./drift-lifecycle-config";
import type { DriftLifecycleConfig } from "./drift-lifecycle-config";
import { resolveDriftLifecycleStatusRef } from "./drift-lifecycle-transition";
import { createDefaultIncidentLifecycleConfig } from "./incident-lifecycle-config";
import type { IncidentLifecycleConfig } from "./incident-lifecycle-config";
import { resolveIncidentLifecycleStatusRef } from "./incident-lifecycle-transition";
import { createDefaultRiskLifecycleConfig } from "./risk-lifecycle-config";
import type { RiskLifecycleConfig } from "./risk-lifecycle-config";
import { resolveRiskLifecycleStatusRef } from "./risk-lifecycle-transition";

export type WorkflowStep = {
  /** Stable key; also used to track which button is mid-flight. */
  id: string;
  label: string;
  /** Status value written to the record. */
  status: string;
  /** Stamp today's date into the entity's resolution-date field. */
  stampsResolution?: boolean;
  /** Clear a previously stamped resolution date (reopening a settled record). */
  clearsResolution?: boolean;
};

export type WorkflowOptions = {
  /** Most likely next transition, or null when the record is already settled. */
  primary: WorkflowStep | null;
  /** Valid alternatives, rendered as quieter buttons. */
  secondary: WorkflowStep[];
};

const BLOCKER_PRIMARY_BY_FROM: Readonly<Record<string, string>> = {
  open: "assigned",
  assigned: "in_progress",
  in_progress: "resolved",
  pending: "in_progress",
  escalated: "in_progress",
  resolved: "closed",
  reopened: "in_progress",
};

const BLOCKER_STEP_COPY: Readonly<Record<string, string>> = {
  assigned: "Assign owner",
  in_progress: "Start work",
  pending: "Mark pending",
  escalated: "Escalate",
  resolved: "Mark resolved",
  closed: "Close blocker",
  cancelled: "Cancel blocker",
  reopened: "Reopen blocker",
};

function blockerStepForTarget(toKey: string, toLabel: string): WorkflowStep {
  return {
    id: toKey,
    label: BLOCKER_STEP_COPY[toKey] ?? `Move to ${toLabel}`,
    status: toLabel,
    stampsResolution: toKey === "resolved",
    clearsResolution: toKey === "reopened",
  };
}

/**
 * One-click transitions from the live blocker lifecycle graph.
 * Terminal statuses (Closed, Cancelled) offer no reopen-to-Open shortcut.
 *
 * @param status - Current blocker status (key or label).
 * @param config - Lifecycle config; defaults to the enterprise graph.
 */
export function blockerWorkflow(
  status: string,
  config: BlockerLifecycleConfig = createDefaultBlockerLifecycleConfig()
): WorkflowOptions {
  const from = resolveBlockerLifecycleStatusRef(config, status);
  if (!from) {
    return blockerWorkflow("Open", config);
  }
  const next = legalNextBlockerStatuses(config, status);
  if (from.terminal || next.length === 0) {
    return { primary: null, secondary: [] };
  }
  const preferredKey = BLOCKER_PRIMARY_BY_FROM[from.key];
  const preferred =
    next.find((s) => s.key === preferredKey) ?? next[0]!;
  const primary = blockerStepForTarget(preferred.key, preferred.label);
  const secondary = next
    .filter((s) => s.key !== preferred.key)
    .map((s) => blockerStepForTarget(s.key, s.label));
  return { primary, secondary };
}

type GraphStatus = {
  key: string;
  label: string;
  enabled: boolean;
  terminal: boolean;
  isIntake?: boolean;
};

type GraphTransition = {
  fromKey: string;
  toKey: string;
  enabled: boolean;
  sortOrder: number;
  /** Required edges are cron/system — not one-click buttons. */
  enforcement?: string;
};

type GraphConfig = {
  statuses: GraphStatus[];
  transitions: GraphTransition[];
};

type GraphWorkflowOpts = {
  primaryByFrom: Readonly<Record<string, string>>;
  stepCopy: Readonly<Record<string, string>>;
  stampsResolution?: (toKey: string) => boolean;
  clearsResolution?: (toKey: string) => boolean;
};

function legalNextFromGraph(
  config: GraphConfig,
  fromKey: string
): Array<{ key: string; label: string }> {
  return config.transitions
    .filter(
      (item) =>
        item.enabled &&
        item.fromKey === fromKey &&
        item.enforcement !== "required"
    )
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((item) =>
      config.statuses.find((s) => s.key === item.toKey && s.enabled)
    )
    .filter((s): s is GraphStatus => Boolean(s))
    .map((s) => ({ key: s.key, label: s.label }));
}

function graphStep(
  toKey: string,
  toLabel: string,
  opts: GraphWorkflowOpts
): WorkflowStep {
  return {
    id: toKey,
    label: opts.stepCopy[toKey] ?? `Move to ${toLabel}`,
    status: toLabel,
    stampsResolution: opts.stampsResolution?.(toKey),
    clearsResolution: opts.clearsResolution?.(toKey),
  };
}

/**
 * One-click transitions from a live entity graph (Blocker-style).
 * @param from - Resolved current status, or null to use Starting status.
 */
function graphWorkflow(
  from: GraphStatus | null,
  config: GraphConfig,
  opts: GraphWorkflowOpts
): WorkflowOptions {
  const current =
    from ??
    config.statuses.find((s) => s.enabled && s.isIntake) ??
    config.statuses.find((s) => s.enabled);
  if (!current) return { primary: null, secondary: [] };
  const next = legalNextFromGraph(config, current.key);
  if (current.terminal || next.length === 0) {
    return { primary: null, secondary: [] };
  }
  const preferredKey = opts.primaryByFrom[current.key];
  const preferred = next.find((s) => s.key === preferredKey) ?? next[0]!;
  return {
    primary: graphStep(preferred.key, preferred.label, opts),
    secondary: next
      .filter((s) => s.key !== preferred.key)
      .map((s) => graphStep(s.key, s.label, opts)),
  };
}

/**
 * One-click transitions from the live conflict graph.
 * @param status - Current conflict status (key or label).
 * @param config - Lifecycle config; defaults to the enterprise graph.
 */
export function conflictWorkflow(
  status: string,
  config: ConflictLifecycleConfig = createDefaultConflictLifecycleConfig()
): WorkflowOptions {
  return graphWorkflow(resolveConflictLifecycleStatusRef(config, status), config, {
    primaryByFrom: { detected: "under_review", under_review: "resolved" },
    stepCopy: {
      under_review: "Start review",
      resolved: "Mark resolved",
      dismissed: "Dismiss conflict",
    },
  });
}

/**
 * One-click transitions from the live drift graph.
 * @param status - Current drift status (key or label).
 * @param config - Lifecycle config; defaults to the enterprise graph.
 */
export function driftWorkflow(
  status: string,
  config: DriftLifecycleConfig = createDefaultDriftLifecycleConfig()
): WorkflowOptions {
  return graphWorkflow(resolveDriftLifecycleStatusRef(config, status), config, {
    primaryByFrom: {
      detected: "investigating",
      investigating: "approved",
      escalated: "investigating",
    },
    stepCopy: {
      investigating: "Start investigation",
      approved: "Approve drift",
      reverted: "Mark reverted",
      escalated: "Escalate drift",
    },
  });
}

/**
 * One-click transitions from the live dependency graph.
 * @param status - Current dependency status (key or label).
 * @param config - Lifecycle config; defaults to the enterprise graph.
 */
export function dependencyWorkflow(
  status: string,
  config: DependencyLifecycleConfig = createDefaultDependencyLifecycleConfig()
): WorkflowOptions {
  return graphWorkflow(
    resolveDependencyLifecycleStatusRef(config, status),
    config,
    {
      primaryByFrom: { pending: "at_risk", at_risk: "met" },
      stepCopy: {
        at_risk: "Mark at risk",
        met: "Mark met",
        waived: "Waive dependency",
        removed: "Remove dependency",
        pending: "Return to pending",
      },
    }
  );
}

/**
 * One-click transitions from the live incident graph.
 * @param status - Current incident status (key or label).
 * @param config - Lifecycle config; defaults to the enterprise graph.
 */
export function incidentWorkflow(
  status: string,
  config: IncidentLifecycleConfig = createDefaultIncidentLifecycleConfig()
): WorkflowOptions {
  return graphWorkflow(resolveIncidentLifecycleStatusRef(config, status), config, {
    primaryByFrom: {
      open: "acknowledged",
      acknowledged: "investigating",
      // Sheet: Investigating → Resolved, Escalated (Resolving defaults Off)
      investigating: "resolved",
      escalated: "investigating",
      resolving: "resolved",
      resolved: "closed",
      reopened: "investigating",
    },
    stepCopy: {
      acknowledged: "Acknowledge incident",
      investigating: "Start investigating",
      resolving: "Start resolving",
      escalated: "Escalate incident",
      resolved: "Mark resolved",
      closed: "Close incident",
      reopened: "Reopen incident",
    },
  });
}

/**
 * One-click transitions from the live approval graph.
 * Approve/Reject stamp the decision date.
 * @param decision - Current decision (key or label).
 * @param config - Lifecycle config; defaults to the enterprise graph.
 */
export function approvalWorkflow(
  decision: string,
  config: ApprovalLifecycleConfig = createDefaultApprovalLifecycleConfig()
): WorkflowOptions {
  return graphWorkflow(
    resolveApprovalLifecycleStatusRef(config, decision),
    config,
    {
      primaryByFrom: { pending: "approved", approved: "expired" },
      stepCopy: {
        approved: "Approve",
        approved_with_conditions: "Approve with conditions",
        rejected: "Reject",
        deferred: "Defer to next CAB",
        withdrawn: "Withdraw",
        expired: "Mark expired",
      },
      stampsResolution: (toKey) =>
        Boolean(config.statuses.find((s) => s.key === toKey)?.terminal),
    }
  );
}

/**
 * One-click transitions from the live alert graph.
 * @param status - Current alert status (key or label).
 * @param config - Lifecycle config; defaults to the enterprise graph.
 */
export function alertWorkflow(
  status: string,
  config: AlertLifecycleConfig = createDefaultAlertLifecycleConfig()
): WorkflowOptions {
  return graphWorkflow(resolveAlertLifecycleStatusRef(config, status), config, {
    primaryByFrom: { pending: "acknowledged", acknowledged: "actioned" },
    stepCopy: {
      acknowledged: "Acknowledge",
      actioned: "Mark actioned",
      dismissed: "Dismiss",
      expired: "Mark expired",
    },
  });
}

/**
 * Transitions for a planned maintenance window. Two stages are stitched
 * together: CAB approval (Pending → Approved → Scheduled) and execution
 * (In Progress → Completed). Cancelled and Rejected are terminal but reopenable,
 * since a rejected window is usually re-submitted rather than recreated.
 *
 * @param status - Current approval status.
 * @returns Primary and secondary transitions.
 */
export function maintenanceWorkflow(status: string): WorkflowOptions {
  const approve: WorkflowStep = { id: "approve", label: "Approve window", status: "Approved" };
  const reject: WorkflowStep = { id: "reject", label: "Reject request", status: "Rejected" };
  const schedule: WorkflowStep = { id: "schedule", label: "Confirm slot", status: "Scheduled" };
  const start: WorkflowStep = { id: "start", label: "Start maintenance", status: "In Progress" };
  const complete: WorkflowStep = { id: "complete", label: "Mark complete", status: "Completed" };
  const cancel: WorkflowStep = { id: "cancel", label: "Cancel window", status: "Cancelled" };
  const reopen: WorkflowStep = { id: "reopen", label: "Reopen as pending", status: "Pending" };

  const normalized = status.trim().toLowerCase();
  if (normalized.includes("complete")) return { primary: null, secondary: [] };
  if (normalized.includes("cancel") || normalized.includes("reject")) {
    return { primary: null, secondary: [reopen] };
  }
  if (normalized.includes("progress")) return { primary: complete, secondary: [] };
  if (normalized.includes("schedul")) return { primary: start, secondary: [cancel] };
  if (normalized.includes("approv")) return { primary: schedule, secondary: [cancel] };
  // Pending, blank, or an unrecognised status: still waiting on CAB.
  return { primary: approve, secondary: [reject] };
}

/**
 * Transitions for a qualitative risk. Risks are never "resolved" — they are
 * mitigated, escalated, formally accepted, or closed.
 *
 * @param status - Current risk status.
 * @returns Primary and secondary transitions.
 */
export function riskWorkflow(
  status: string,
  config: RiskLifecycleConfig = createDefaultRiskLifecycleConfig()
): WorkflowOptions {
  return graphWorkflow(resolveRiskLifecycleStatusRef(config, status), config, {
    primaryByFrom: {
      identified: "assessing",
      assessing: "mitigating",
      mitigating: "mitigated",
      mitigated: "closed",
      accepted: "closed",
      escalated: "mitigating",
    },
    stepCopy: {
      assessing: "Start assessing",
      mitigating: "Start mitigating",
      mitigated: "Mark mitigated",
      accepted: "Accept risk",
      closed: "Close risk",
      escalated: "Escalate",
    },
  });
}
