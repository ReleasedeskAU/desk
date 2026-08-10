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

type ResolveFlowLabels = {
  start: string;
  resolve: string;
  close: string;
  reopen: string;
};

/**
 * Open → In Progress → Resolved → Closed lifecycle shared by blockers and
 * environment conflicts.
 *
 * @param status - Current status; matched loosely so seed/CSV variants still resolve.
 * @param labels - Entity-specific button copy.
 * @param tracksResolutionDate - Whether the entity stores an actual resolution date.
 * @returns Primary and secondary transitions for the current status.
 */
function resolveFlow(
  status: string,
  labels: ResolveFlowLabels,
  tracksResolutionDate: boolean
): WorkflowOptions {
  const start: WorkflowStep = { id: "start", label: labels.start, status: "In Progress" };
  const resolve: WorkflowStep = {
    id: "resolve",
    label: labels.resolve,
    status: "Resolved",
    stampsResolution: tracksResolutionDate,
  };
  const close: WorkflowStep = { id: "close", label: labels.close, status: "Closed" };
  const reopen: WorkflowStep = {
    id: "reopen",
    label: labels.reopen,
    status: "Open",
    clearsResolution: tracksResolutionDate,
  };

  const normalized = status.trim().toLowerCase();
  if (normalized.includes("closed")) return { primary: null, secondary: [reopen] };
  if (normalized.includes("resolv")) return { primary: close, secondary: [reopen] };
  if (normalized.includes("progress")) return { primary: resolve, secondary: [] };
  // Open, blank, or an unrecognised status: treat as untouched work.
  return { primary: start, secondary: [resolve] };
}

/**
 * Transitions for a release blocker.
 *
 * @param status - Current blocker status.
 * @returns Primary and secondary transitions.
 */
export function blockerWorkflow(status: string): WorkflowOptions {
  return resolveFlow(
    status,
    {
      start: "Start work",
      resolve: "Mark resolved",
      close: "Close blocker",
      reopen: "Reopen blocker",
    },
    true
  );
}

/**
 * Transitions for an environment conflict. Conflicts store no resolution date,
 * so no date is stamped on resolve.
 *
 * @param status - Current conflict status.
 * @returns Primary and secondary transitions.
 */
export function conflictWorkflow(status: string): WorkflowOptions {
  return resolveFlow(
    status,
    {
      start: "Start resolving",
      resolve: "Mark resolved",
      close: "Close conflict",
      reopen: "Reopen conflict",
    },
    false
  );
}

/**
 * Transitions for an environment/config drift. Drift stores an ETA rather than
 * an actual resolution date, so no date is stamped on resolve.
 *
 * @param status - Current drift status.
 * @returns Primary and secondary transitions.
 */
export function driftWorkflow(status: string): WorkflowOptions {
  return resolveFlow(
    status,
    {
      start: "Start remediation",
      resolve: "Mark remediated",
      close: "Close drift",
      reopen: "Reopen drift",
    },
    false
  );
}

/**
 * Transitions for an inter-release dependency. The lifecycle tracks how much
 * the upstream link threatens the dependent release, not repair work, so the
 * moves are Blocked ↔ At Risk → Clear → Resolved.
 *
 * @param status - Current dependency status.
 * @returns Primary and secondary transitions.
 */
export function dependencyWorkflow(status: string): WorkflowOptions {
  const block: WorkflowStep = { id: "block", label: "Mark blocked", status: "Blocked" };
  const atRisk: WorkflowStep = { id: "at-risk", label: "Mark at risk", status: "At Risk" };
  const clear: WorkflowStep = { id: "clear", label: "Mark cleared", status: "Clear" };
  const resolve: WorkflowStep = { id: "resolve", label: "Mark resolved", status: "Resolved" };
  const reopen: WorkflowStep = { id: "reopen", label: "Reopen as at risk", status: "At Risk" };

  const normalized = status.trim().toLowerCase();
  if (normalized.includes("resolv")) return { primary: null, secondary: [reopen] };
  if (normalized.includes("clear")) return { primary: resolve, secondary: [block] };
  if (normalized.includes("risk")) return { primary: clear, secondary: [block] };
  // Blocked, blank, or an unrecognised status: the link is still a threat.
  return { primary: clear, secondary: [atRisk] };
}

/**
 * Transitions for a production incident. Incidents climb a containment ladder
 * before they can be resolved: Active → Investigating → Mitigated → Resolved.
 *
 * @param status - Current incident status.
 * @returns Primary and secondary transitions.
 */
export function incidentWorkflow(status: string): WorkflowOptions {
  const investigate: WorkflowStep = {
    id: "investigate",
    label: "Start investigating",
    status: "Investigating",
  };
  const mitigate: WorkflowStep = { id: "mitigate", label: "Mark mitigated", status: "Mitigated" };
  const resolve: WorkflowStep = { id: "resolve", label: "Mark resolved", status: "Resolved" };
  const close: WorkflowStep = { id: "close", label: "Close incident", status: "Closed" };
  const reopen: WorkflowStep = { id: "reopen", label: "Reopen incident", status: "Active" };

  const normalized = status.trim().toLowerCase();
  if (normalized.includes("closed")) return { primary: null, secondary: [reopen] };
  if (normalized.includes("resolv")) return { primary: close, secondary: [reopen] };
  if (normalized.includes("mitigat")) return { primary: resolve, secondary: [] };
  if (normalized.includes("investigat")) return { primary: mitigate, secondary: [resolve] };
  // Active, blank, or an unrecognised status: nobody is on it yet.
  return { primary: investigate, secondary: [mitigate] };
}

/**
 * Transitions for a CAB approval gate. Unlike the other lifecycles this one is
 * a decision rather than progress, so there is no middle "working on it" rung:
 * a gate is pending, deferred to a later meeting, or decided either way.
 * Recording a decision stamps the decision date; reopening clears it.
 *
 * @param decision - Current decision value.
 * @returns Primary and secondary transitions.
 */
export function approvalWorkflow(decision: string): WorkflowOptions {
  const approve: WorkflowStep = {
    id: "approve",
    label: "Approve",
    status: "Approved",
    stampsResolution: true,
  };
  const reject: WorkflowStep = {
    id: "reject",
    label: "Reject",
    status: "Rejected",
    stampsResolution: true,
  };
  const defer: WorkflowStep = { id: "defer", label: "Defer to next CAB", status: "Deferred" };
  const reopen: WorkflowStep = {
    id: "reopen",
    label: "Reopen as pending",
    status: "Pending",
    clearsResolution: true,
  };

  const normalized = decision.trim().toLowerCase();
  if (normalized.includes("approv") || normalized.includes("reject") || normalized.includes("denied")) {
    return { primary: null, secondary: [reopen] };
  }
  if (normalized.includes("defer")) return { primary: approve, secondary: [reject] };
  // Pending, in review, blank, or unrecognised: the gate is still open.
  return { primary: approve, secondary: [reject, defer] };
}

/**
 * Transitions for a monitoring alert. Alerts are acknowledged before anyone
 * investigates, so "someone has seen this" is a distinct rung from "someone is
 * working on it" — that gap is exactly what ops triage cares about.
 *
 * @param status - Current alert status.
 * @returns Primary and secondary transitions.
 */
export function alertWorkflow(status: string): WorkflowOptions {
  const acknowledge: WorkflowStep = { id: "ack", label: "Acknowledge", status: "Acknowledged" };
  const investigate: WorkflowStep = {
    id: "investigate",
    label: "Start investigating",
    status: "Investigating",
  };
  const resolve: WorkflowStep = { id: "resolve", label: "Mark resolved", status: "Resolved" };
  const close: WorkflowStep = { id: "close", label: "Close alert", status: "Closed" };
  const reopen: WorkflowStep = { id: "reopen", label: "Reopen alert", status: "Open" };

  const normalized = status.trim().toLowerCase();
  if (normalized.includes("closed")) return { primary: null, secondary: [reopen] };
  if (normalized.includes("resolv") || normalized.includes("clear")) {
    return { primary: close, secondary: [reopen] };
  }
  if (normalized.includes("investigat")) return { primary: resolve, secondary: [] };
  if (normalized.includes("ack")) return { primary: investigate, secondary: [resolve] };
  // Open, firing, blank, or an unrecognised status: nobody has looked yet.
  return { primary: acknowledge, secondary: [investigate] };
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
export function riskWorkflow(status: string): WorkflowOptions {
  const mitigate: WorkflowStep = { id: "mitigate", label: "Start mitigating", status: "Mitigating" };
  const escalate: WorkflowStep = { id: "escalate", label: "Escalate", status: "Escalated" };
  const accept: WorkflowStep = { id: "accept", label: "Accept risk", status: "Accepted" };
  const close: WorkflowStep = { id: "close", label: "Close risk", status: "Closed" };
  const reopen: WorkflowStep = { id: "reopen", label: "Reopen risk", status: "Open" };

  const normalized = status.trim().toLowerCase();
  // Accepted and Closed are both terminal: the only move left is reopening.
  if (normalized.includes("closed") || normalized.includes("accept")) {
    return { primary: null, secondary: [reopen] };
  }
  if (normalized.includes("escalat")) return { primary: mitigate, secondary: [accept] };
  if (
    normalized.includes("mitigat") ||
    normalized.includes("progress") ||
    normalized.includes("monitor")
  ) {
    return { primary: close, secondary: [escalate, accept] };
  }
  return { primary: mitigate, secondary: [escalate, accept] };
}
